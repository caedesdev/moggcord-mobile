# Copyright (c) 2026 Moggcord contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build an iOS test IPA from a local Discord IPA and the Moggcord loader."""

import argparse
from copy import copy
from os import link
from pathlib import Path, PurePosixPath
import plistlib
import shutil
import stat
import struct
import tempfile
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile


APP = "Payload/Discord.app/"
EXECUTABLE = APP + "Discord"
INFO_PLIST = APP + "Info.plist"
FRAMEWORKS = APP + "Frameworks/"
LOADER_NAME = "MoggcordMobile.dylib"
LOADER = FRAMEWORKS + LOADER_NAME
REFERENCE_LOADER = FRAMEWORKS + "RainTweak.dylib"
DYLIB_COMMANDS = {0x0C, 0x20, 0x80000018, 0x8000001F, 0x80000023}
LC_LOAD_WEAK_DYLIB = 0x80000018


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_commands(data, file_type):
    magic, architecture, _, kind, count, size = struct.unpack_from("<6I", data)
    require((magic, architecture, kind) == (0xFEEDFACF, 0x100000C, file_type),
            "Expected a single ARM64 Mach-O binary.")
    end = 32 + size
    require(end <= len(data) and count <= size // 8, "Invalid Mach-O header.")
    commands = []
    offset = 32
    for _ in range(count):
        command, length = struct.unpack_from("<II", data, offset)
        require(length >= 8 and length % 8 == 0 and offset + length <= end,
                "Invalid Mach-O load command.")
        commands.append((command, data[offset:offset + length]))
        offset += length
    require(offset == end, "Mach-O command size mismatch.")
    return commands, end


def command_path(command):
    offset, = struct.unpack_from("<I", command, 8)
    end = command.find(b"\0", offset)
    require(12 <= offset < end < len(command), "Invalid Mach-O path.")
    return command[offset:end]


def link_loader(data, replace_reference):
    commands, old_end = read_commands(data, 2)
    encryption = [raw for kind, raw in commands if kind == 0x2C]
    require(len(encryption) == 1 and struct.unpack_from("<I", encryption[0], 16)[0] == 0,
            "Choose a compatible Discord IPA with an unencrypted executable.")

    first_section = len(data)
    for kind, segment in commands:
        if kind != 0x19:
            continue
        count, = struct.unpack_from("<I", segment, 64)
        require(len(segment) == 72 + count * 80, "Invalid Mach-O segment.")
        for index in range(count):
            section = 72 + index * 80
            offset, = struct.unpack_from("<I", segment, section + 48)
            flags, = struct.unpack_from("<I", segment, section + 64)
            if offset and flags & 0xFF not in (1, 0xC, 0x12):
                first_section = min(first_section, offset)
    require(first_section < len(data), "The executable has no file-backed sections.")

    paths = {index: command_path(raw) for index, (kind, raw) in enumerate(commands)
             if kind in DYLIB_COMMANDS}
    reference_links = [i for i, path in paths.items() if path == b"@rpath/RainTweak.dylib"]
    require(len(reference_links) == int(replace_reference), "Unexpected RainTweak loader layout.")
    require(not any(path.endswith(b"/MoggcordMobile.dylib") for path in paths.values()),
            "This IPA already links Moggcord Mobile.")

    path = b"@executable_path/Frameworks/MoggcordMobile.dylib"
    length = (24 + len(path) + 1 + 7) & ~7
    command = (struct.pack("<6I", LC_LOAD_WEAK_DYLIB, length, 24, 0, 0, 0) + path).ljust(length, b"\0")
    table = [raw for _, raw in commands]
    if replace_reference:
        # Reuse the dependency's slot to preserve the ordinals of other libraries.
        table[reference_links[0]] = command
    else:
        table.append(command)
    table_bytes = b"".join(table)
    new_end = 32 + len(table_bytes)
    require(old_end <= new_end <= first_section and not any(data[old_end:new_end]),
            "The executable header has insufficient space for the loader.")
    patched = bytearray(data)
    struct.pack_into("<II", patched, 16, len(table), len(table_bytes))
    patched[32:new_end] = table_bytes
    return patched


def build(source, loader, destination):
    require(source.resolve() != destination.resolve(), "Choose a different output path.")
    require(not destination.exists(), f"Output already exists: {destination}")
    library = loader.read_bytes()
    commands, _ = read_commands(library, 6)
    require([command_path(raw) for kind, raw in commands if kind == 0x0D]
            == [b"@rpath/MoggcordMobile.dylib"], "Choose the MoggcordMobile.dylib from this kit.")

    with ZipFile(source) as original:
        members = original.infolist()
        names = {entry.filename for entry in members}
        require(len(members) == len(names) and {EXECUTABLE, INFO_PLIST} <= names,
                "Expected a single Payload/Discord.app bundle.")
        for member in members:
            name = member.filename
            require((name == "Payload/" or name.startswith(APP)) and "\\" not in name
                    and ".." not in PurePosixPath(name).parts
                    and not stat.S_ISLNK(member.external_attr >> 16), "Unsupported IPA file layout.")
            require(not name.startswith(FRAMEWORKS) or not name.endswith(".dylib")
                    or name == REFERENCE_LOADER, "Choose a base without other injected libraries.")

        info = plistlib.loads(original.read(INFO_PLIST))
        require(isinstance(info, dict) and info.get("CFBundleIdentifier") == "com.hammerandchisel.discord"
                and info.get("CFBundleExecutable") == "Discord"
                and info.get("CFBundleVersion") == "110861",
                "This kit targets Discord 344.1 (build 110861).")
        executable = original.read(EXECUTABLE)
        require(b"RCTHost\0" in executable and b"instance:didInitializeRuntime:\0" in executable,
                "The Discord build is missing the compatible React Native host.")
        info["CFBundleDisplayName"] = "Moggcord"
        edits = {
            EXECUTABLE: link_loader(executable, REFERENCE_LOADER in names),
            INFO_PLIST: plistlib.dumps(info, fmt=plistlib.FMT_BINARY, sort_keys=False),
        }

        with tempfile.NamedTemporaryFile(prefix=".moggcord-", suffix=".part",
                                         dir=destination.parent, delete=False) as temp:
            stage = Path(temp.name)
        try:
            with ZipFile(stage, "w", ZIP_DEFLATED, compresslevel=4) as ipa:
                for member in members:
                    name = member.filename
                    if name == REFERENCE_LOADER:
                        continue
                    entry = copy(member)
                    if name in edits:
                        ipa.writestr(entry, edits[name], compresslevel=4)
                    else:
                        with original.open(member) as reader, ipa.open(entry, "w") as writer:
                            shutil.copyfileobj(reader, writer, 1024 * 1024)
                entry = copy(original.getinfo(EXECUTABLE))
                entry.filename = LOADER
                entry.external_attr = (stat.S_IFREG | 0o755) << 16
                ipa.writestr(entry, library, compresslevel=4)
            with ZipFile(stage) as ipa:
                require(ipa.testzip() is None, "The completed IPA failed its integrity check.")
            # Create the final name without overwriting a concurrently created file.
            link(stage, destination)
        finally:
            stage.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Local Discord 344.1 IPA")
    default_loader = Path(__file__).with_name(LOADER_NAME)
    if not default_loader.is_file():
        default_loader = Path(__file__).resolve().parent.parent / "dist" / "ios" / LOADER_NAME
    parser.add_argument("--loader", type=Path, default=default_loader)
    parser.add_argument("-o", "--output", type=Path, default=Path("Moggcord-Mobile.ipa"))
    args = parser.parse_args()
    try:
        build(args.source, args.loader, args.output)
    except (OSError, ValueError, BadZipFile, KeyError, RuntimeError, struct.error) as error:
        parser.exit(1, f"Could not build IPA: {error}\n")
    print(f"Created {args.output.resolve()}")
    print("Open the IPA in your sideloading tool to sign and install it.")


if __name__ == "__main__":
    main()
