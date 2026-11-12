# Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later
"""Sign the already-built mobile runtime. Keep the private key outside this repository."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--key", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--platform", choices=("ios", "android"), default="ios")
parser.add_argument("--discord-build", help="Exact installed Android version code")
args = parser.parse_args()
if args.platform == "android" and not re.fullmatch(r"[1-9]\d{0,17}", args.discord_build or ""):
    parser.error("Android requires the exact compatible Discord --discord-build.")
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text())["version"]
if not re.fullmatch(r"(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})", version):
    raise SystemExit("Use a stable three-part runtime version.")
key = serialization.load_pem_private_key(args.key.read_bytes(), password=None)
if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
    raise SystemExit("Expected the existing P-256 update signing key.")
public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
pinned = re.search(r'moggcord_update_key\s*=\s*"([A-Za-z0-9+/=]+)"', (root / "ios/UpdatePublicKey.h").read_text())[1]
if public != base64.b64decode(pinned):
    raise SystemExit("This key does not match the verifier built into the app.")
bundle = (root / "dist/moggcord-mobile.js").read_bytes()
if not 0 < len(bundle) <= 8 * 1024 * 1024:
    raise SystemExit("The built runtime has an invalid size.")
if args.platform == "android" and not bundle.isascii():
    raise SystemExit("Rebuild the runtime in ASCII for the installed Android updater.")
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
if args.platform == "ios":
    loader_version = int(re.search(r"moggcord_loader_version\s*=\s*(\d+)", (root / "ios/LoaderVersion.h").read_text())[1])
    discord_build = "110861"
else:
    verifier = root / "android/loader/src/main/java/cc/moggcord/mobile/loader/AndroidRuntimeUpdates.java"
    loader_version = int(re.search(r"PROTOCOL\s*=\s*(\d+)", verifier.read_text())[1])
    discord_build = args.discord_build
manifest = {"schema": 1, "platform": args.platform, "version": version, "minLoader": loader_version,
            "discordBuild": discord_build, "revision": revision,
            "bundle": f"https://moggcord.cc/mobile/updates/{args.platform}/{version}/moggcord-mobile.js",
            "bytes": len(bundle), "sha256": hashlib.sha256(bundle).hexdigest()}
payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
signature = key.sign(payload, ec.ECDSA(hashes.SHA256()))
key.public_key().verify(signature, payload, ec.ECDSA(hashes.SHA256()))
envelope = {"payload": base64.b64encode(payload).decode(), "signature": base64.b64encode(signature).decode()}
with args.output.open("x", encoding="ascii") as target:
    target.write(json.dumps(envelope, separators=(",", ":")) + "\n")
print(f"Signed {args.platform} runtime {version} ({len(bundle)} bytes, {manifest['sha256']}).")
