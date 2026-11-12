/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import com.android.tools.build.apkzlib.zip.ZFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

import pxb.android.axml.AxmlReader;
import pxb.android.axml.AxmlVisitor;
import pxb.android.axml.AxmlWriter;
import pxb.android.axml.NodeVisitor;

final class DiscordPackage {
    static final String ORIGINAL = "com.discord";
    static final String MOGGCORD = "cc.moggcord.mobile.discord";
    private static final String ANDROID = "http://schemas.android.com/apk/res/android";
    private static final String MANIFEST = "AndroidManifest.xml";

    static void rename(File apk) throws IOException {
        try (ZFile zip = ZFile.openReadWrite(apk)) {
            var entry = zip.get(MANIFEST);
            if (entry == null) throw new IOException("Discord APK is missing its manifest.");

            byte[] manifest;
            try (InputStream input = entry.open()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                for (int size; (size = input.read(buffer)) != -1;) bytes.write(buffer, 0, size);
                manifest = bytes.toByteArray();
            }
            zip.add(MANIFEST, new ByteArrayInputStream(renameManifest(manifest)));
        }
    }

    private static byte[] renameManifest(byte[] manifest) throws IOException {
        AxmlWriter writer = new AxmlWriter();
        boolean[] discord = {false};
        new AxmlReader(manifest).accept(new AxmlVisitor(writer) {
            @Override
            public NodeVisitor child(String namespace, String name) {
                return new NodeVisitor(super.child(namespace, name)) {
                    @Override
                    public void attr(String ns, String key, int resourceId, int type, Object value) {
                        if ("manifest".equals(name) && ns == null && "package".equals(key) && ORIGINAL.equals(value)) {
                            discord[0] = true;
                            value = MOGGCORD;
                        }
                        super.attr(ns, key, resourceId, type, value);
                    }

                    @Override
                    public NodeVisitor child(String ns, String tag) {
                        return new ManifestNode(super.child(ns, tag), tag);
                    }
                };
            }
        });
        if (!discord[0]) throw new IOException("The source APK is not Discord.");
        return writer.toByteArray();
    }

    private static final class ManifestNode extends NodeVisitor {
        private final String tag;

        ManifestNode(NodeVisitor delegate, String tag) {
            super(delegate);
            this.tag = tag;
        }

        @Override
        public void attr(String namespace, String key, int resourceId, int type, Object value) {
            if (ANDROID.equals(namespace) && value instanceof String) {
                String text = (String) value;
                value = switch (key) {
                    case "authorities" -> "provider".equals(tag) ? renameAuthorities(text) : text;
                    case "permission", "permissionGroup", "readPermission", "writePermission", "taskAffinity" ->
                        renameIdentifier(text);
                    case "name" -> tag.startsWith("uses-permission") || tag.startsWith("permission")
                        ? renameIdentifier(text) : isComponent(tag) ? qualifyClass(text) : text;
                    case "targetActivity", "parentActivityName", "appComponentFactory", "backupAgent",
                         "manageSpaceActivity", "zygotePreloadName" -> qualifyClass(text);
                    default -> text;
                };
            }
            super.attr(namespace, key, resourceId, type, value);
        }

        @Override
        public NodeVisitor child(String namespace, String name) {
            NodeVisitor delegate = super.child(namespace, name);
            return "application".equals(tag) ? new ManifestNode(delegate, name) : delegate;
        }
    }

    private static boolean isComponent(String tag) {
        return switch (tag) {
            case "application", "activity", "activity-alias", "service", "receiver", "provider", "instrumentation" -> true;
            default -> false;
        };
    }

    private static String qualifyClass(String name) {
        if (name.startsWith(".")) return ORIGINAL + name;
        return name.contains(".") ? name : ORIGINAL + "." + name;
    }

    private static String renameIdentifier(String name) {
        return name.equals(ORIGINAL) || name.startsWith(ORIGINAL + ".")
            ? MOGGCORD + name.substring(ORIGINAL.length()) : name;
    }

    private static String renameAuthorities(String value) {
        String[] names = value.split(";", -1);
        for (int i = 0; i < names.length; i++) names[i] = renameIdentifier(names[i]);
        return String.join(";", names);
    }
}
