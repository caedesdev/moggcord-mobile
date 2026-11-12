/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

final class DiscordLocaleResources {
    private static final Pattern LOCALE_RESOURCE = Pattern.compile("[a-z0-9_]+compiledmessages");
    private static final int MAX_RESOURCE_BYTES = 2 * 1024 * 1024;

    static InputStream open(File apk, String name) throws IOException {
        if (!LOCALE_RESOURCE.matcher(name).matches()) return null;

        try (ZipFile zip = new ZipFile(apk)) {
            ZipEntry entry = zip.getEntry("res/raw/" + name + ".jsona");
            if (entry == null) return null;

            long size = entry.getSize();
            if (size <= 0 || size > MAX_RESOURCE_BYTES) return null;

            byte[] bytes = new byte[(int) size];
            try (DataInputStream input = new DataInputStream(zip.getInputStream(entry))) {
                input.readFully(bytes);
                if (input.read() != -1) throw new IOException("Discord locale resource exceeds its declared size");
            }
            return new ByteArrayInputStream(bytes);
        }
    }
}
