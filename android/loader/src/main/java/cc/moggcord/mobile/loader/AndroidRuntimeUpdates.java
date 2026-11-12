/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.app.Application;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.regex.Pattern;

import org.json.JSONObject;

final class AndroidRuntimeUpdates {
    private static final String TAG = "MoggcordMobile";
    static final int PROTOCOL = 1;
    static final int MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_RECORD_BYTES = 2 * MAX_BUNDLE_BYTES + 32_768;
    private static final String PUBLIC_KEY_PREFIX = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE";
    private static final Pattern VERSION = Pattern.compile("(0|[1-9]\\d{0,5})\\.(0|[1-9]\\d{0,5})\\.(0|[1-9]\\d{0,5})");
    private static final String ORIGIN = "https://moggcord.cc/mobile/updates/android/";

    record Selection(String prefix, byte[] source) {}
    private record Update(String version, String hash, byte[] source) {}

    static Selection select(Application app) throws Exception {
        var info = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
        return select(app.getFilesDir().getCanonicalFile(), Long.toString(info.getLongVersionCode()),
            BuildConfig.RUNTIME_VERSION, BuildConfig.UPDATE_PUBLIC_KEY);
    }

    static synchronized Selection select(File filesDir, String build, String embeddedVersion, String publicKey) throws Exception {
        Path dir = filesDir.toPath().resolve("moggcord-updates");
        Path pending = dir.resolve("pending.json");
        Path candidate = dir.resolve("candidate.json");
        Path confirmed = dir.resolve("active.json");
        Path confirmation = dir.resolve("confirmed.txt");
        String recovery = "";
        if (Files.exists(candidate)) {
            Update attempted = verified(candidate, build, publicKey);
            if (attempted != null && Files.exists(confirmation) && Files.size(confirmation) == 64 &&
                    attempted.hash.equals(new String(Files.readAllBytes(confirmation), StandardCharsets.US_ASCII))) {
                move(candidate, confirmed);
            } else {
                Files.deleteIfExists(candidate);
                recovery = "The previous update did not finish starting. Moggcord restored the last working version.";
            }
            Files.deleteIfExists(confirmation);
        }

        Update active = verified(confirmed, build, publicKey);
        if (active != null && compare(active.version, embeddedVersion) <= 0) active = null;
        Update staged = verified(pending, build, publicKey);
        if (staged != null && compare(staged.version, active == null ? embeddedVersion : active.version) > 0) {
            Files.deleteIfExists(confirmation);
            move(pending, candidate);
        } else {
            Files.deleteIfExists(pending);
            staged = null;
        }

        var config = new JSONObject().put("apiVersion", PROTOCOL).put("publicKey", publicKey)
            .put("filesDir", filesDir.getPath()).put("discordBuild", build).put("recoveryNotice", recovery);
        if (staged != null) config.put("candidateVersion", staged.version).put("candidateHash", staged.hash);
        Update selected = staged == null ? active : staged;
        return new Selection("globalThis.__MOGGCORD_ANDROID_UPDATES__=" + config + ";\n",
            selected == null ? null : selected.source);
    }

    private static Update verified(Path file, String build, String publicKey) {
        if (!Files.isRegularFile(file)) return null;
        try {
            var record = new JSONObject(read(file, MAX_RECORD_BYTES));
            String envelopeText = record.getString("envelope");
            if (envelopeText.length() > 16_384) return null;
            var envelope = new JSONObject(envelopeText);
            var decoder = Base64.getDecoder();
            byte[] manifest = decoder.decode(envelope.getString("payload"));
            byte[] signature = decoder.decode(envelope.getString("signature"));
            if (manifest.length > 8192 || signature.length > 80 || !verify(manifest, signature, publicKey)) return null;

            var meta = new JSONObject(new String(manifest, StandardCharsets.UTF_8));
            String version = meta.getString("version");
            int length = meta.getInt("bytes");
            int protocol = meta.getInt("minLoader");
            if (meta.getInt("schema") != 1 || !"android".equals(meta.getString("platform"))
                    || protocol < 1 || protocol > PROTOCOL || !build.equals(meta.getString("discordBuild"))
                    || !VERSION.matcher(version).matches() || length < 1 || length > MAX_BUNDLE_BYTES
                    || !meta.getString("revision").matches("[a-f0-9]{40}")
                    || !(ORIGIN + version + "/moggcord-mobile.js").equals(meta.getString("bundle"))) return null;
            byte[] source = record.getString("source").getBytes(StandardCharsets.UTF_8);
            String hash = meta.getString("sha256");
            if (source.length != length || !hash.equals(hex(MessageDigest.getInstance("SHA-256").digest(source)))) return null;
            return new Update(version, hash, source);
        } catch (Exception error) {
            Log.w(TAG, "Ignoring an unreadable Android runtime update.", error);
            return null;
        }
    }

    private static boolean verify(byte[] manifest, byte[] signature, String publicKey) throws Exception {
        var decoder = Base64.getDecoder();
        byte[] point = decoder.decode(publicKey);
        if (point.length != 65 || point[0] != 4) return false;
        byte[] prefix = decoder.decode(PUBLIC_KEY_PREFIX);
        byte[] encoded = Arrays.copyOf(prefix, prefix.length + point.length - 1);
        System.arraycopy(point, 1, encoded, prefix.length, point.length - 1);
        var key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(encoded));
        var verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(key);
        verifier.update(manifest);
        return verifier.verify(signature);
    }

    private static String read(Path path, int limit) throws IOException {
        if (Files.size(path) > limit) throw new IOException("The update record is too large.");
        byte[] bytes = Files.readAllBytes(path);
        if (bytes.length > limit) throw new IOException("The update record is too large.");
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static void move(Path source, Path target) throws IOException {
        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private static int compare(String left, String right) {
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < 3; i++) {
            int difference = Integer.compare(Integer.parseInt(a[i]), Integer.parseInt(b[i]));
            if (difference != 0) return difference;
        }
        return 0;
    }

    private static String hex(byte[] bytes) {
        var result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            result.append(Character.forDigit((b >>> 4) & 15, 16));
            result.append(Character.forDigit(b & 15, 16));
        }
        return result.toString();
    }
}
