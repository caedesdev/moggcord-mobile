/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

final class DiscordResources {
    private static final int TABLE = 0x0002;
    private static final int PACKAGE = 0x0200;
    private static final int CHUNK_HEADER_SIZE = 8;
    private static final int PACKAGE_NAME_OFFSET = CHUNK_HEADER_SIZE + Integer.BYTES;
    private static final int PACKAGE_NAME_SIZE = 128 * Character.BYTES;

    static boolean renamePackage(byte[] table, String original, String replacement) throws IOException {
        ByteBuffer bytes = ByteBuffer.wrap(table).order(ByteOrder.LITTLE_ENDIAN);
        if (table.length < CHUNK_HEADER_SIZE + Integer.BYTES || Short.toUnsignedInt(bytes.getShort(0)) != TABLE
                || bytes.getInt(4) != table.length) {
            throw new IOException("Invalid Discord resource table header.");
        }
        int offset = Short.toUnsignedInt(bytes.getShort(2));
        if (offset < CHUNK_HEADER_SIZE + Integer.BYTES || offset > table.length) {
            throw new IOException("Invalid Discord resource table header size.");
        }

        byte[] encodedName = replacement.getBytes(StandardCharsets.UTF_16LE);
        if (encodedName.length >= PACKAGE_NAME_SIZE) throw new IOException("The clone package name is too long.");

        boolean changed = false;
        while (offset < table.length) {
            int remaining = table.length - offset;
            if (remaining < CHUNK_HEADER_SIZE) throw new IOException("Truncated Discord resource table chunk.");
            int type = Short.toUnsignedInt(bytes.getShort(offset));
            int headerSize = Short.toUnsignedInt(bytes.getShort(offset + 2));
            int size = bytes.getInt(offset + 4);
            if (headerSize < CHUNK_HEADER_SIZE || size < headerSize || size > remaining) {
                throw new IOException("Invalid Discord resource table chunk size.");
            }

            if (type == PACKAGE) {
                if (headerSize < PACKAGE_NAME_OFFSET + PACKAGE_NAME_SIZE) {
                    throw new IOException("Invalid Discord resource package header.");
                }
                int nameStart = offset + PACKAGE_NAME_OFFSET;
                int nameEnd = nameStart + PACKAGE_NAME_SIZE;
                int end = nameStart;
                while (end < nameEnd && bytes.getChar(end) != '\0') end += Character.BYTES;
                String name = new String(table, nameStart, end - nameStart, StandardCharsets.UTF_16LE);
                if (original.equals(name)) {
                    // Keep the package ID, resource IDs, and offsets unchanged.
                    Arrays.fill(table, nameStart, nameEnd, (byte) 0);
                    System.arraycopy(encodedName, 0, table, nameStart, encodedName.length);
                    changed = true;
                }
            }
            offset += size;
        }
        return changed;
    }
}
