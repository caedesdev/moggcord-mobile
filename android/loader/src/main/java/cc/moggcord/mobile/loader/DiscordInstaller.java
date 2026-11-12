/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.util.AtomicFile;
import android.util.Log;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.lsposed.patch.ApkPatcher;
import org.lsposed.patch.KeystoreSpec;
import org.lsposed.patch.ManifestOverrides;
import org.lsposed.patch.PatchSpec;
import org.lsposed.patch.util.Logger;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

final class DiscordInstaller {
    static final String RESULT = "cc.moggcord.mobile.loader.INSTALL_RESULT";
    private static final String TAG = "MoggcordInstaller";
    private static final String KEY_ALIAS = "moggcord-discord";

    static void install(Context context, ApplicationInfo discord, Runnable awaitingConfirmation) throws Exception {
        if (!DiscordPackage.ORIGINAL.equals(discord.packageName)) throw new IOException("Discord is required.");
        Path work = Files.createTempDirectory(context.getCacheDir().toPath(), "discord-install-");
        try {
            File keyFile = new File(context.getNoBackupFilesDir(), "discord-install.keystore");
            String password = signingPassword(context);
            prepareSigningKey(keyFile, password.toCharArray());
            List<File> sources = new ArrayList<>();
            sources.add(new File(discord.sourceDir));
            if (discord.splitSourceDirs != null) {
                for (String split : discord.splitSourceDirs) sources.add(new File(split));
            }
            var copying = InstallProgress.copying(sources.stream().mapToLong(File::length).sum());
            List<File> inputs = new ArrayList<>();
            for (int i = 0; i < sources.size(); i++) {
                String name = i == 0 ? "base.apk" : "split_" + (i - 1) + ".apk";
                inputs.add(prepareApk(work, sources.get(i), name, copying));
            }

            List<File> outputs = new ApkPatcher(new Logger() {
                @Override public void d(String message) { Log.d(TAG, message); }
                @Override public void stage(Stage stage, int index, int total) {
                    InstallProgress.patching(stage, index, total);
                }
                @Override public void i(String message) { Log.i(TAG, message); }
                @Override public void e(String message) { Log.e(TAG, message); }
            }, PatchSpec.builder()
                .apks(inputs)
                .module(new File(context.getApplicationInfo().sourceDir))
                .outputDir(work.resolve("install").toFile())
                .sigBypassLevel(0)
                .manifestOverrides(ManifestOverrides.builder().label("Moggcord Discord").build())
                .keystore(KeystoreSpec.of(keyFile, password, KEY_ALIAS, password))
                .build()).patch();

            PackageInfo result = context.getPackageManager().getPackageArchiveInfo(outputs.get(0).getPath(), 0);
            if (result == null || !DiscordPackage.MOGGCORD.equals(result.packageName)) {
                throw new IOException("The prepared APK has an unexpected package name.");
            }
            commit(context, outputs, awaitingConfirmation);
        } finally {
            try (var files = Files.walk(work)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).collect(Collectors.toList())) {
                    Files.deleteIfExists(path);
                }
            } catch (IOException error) {
                Log.w(TAG, "Could not remove temporary APKs.", error);
            }
        }
    }

    private static File prepareApk(Path work, File source, String name, InstallProgress.Transfer copying) throws IOException {
        Path copy = work.resolve(name);
        try (var input = new FileInputStream(source); var output = Files.newOutputStream(copy)) {
            copying.copy(input, output);
        }
        File apk = copy.toFile();
        DiscordPackage.rename(apk);
        return apk;
    }

    private static void commit(Context context, List<File> apks, Runnable awaitingConfirmation) throws IOException {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(DiscordPackage.MOGGCORD);
        long size = apks.stream().mapToLong(File::length).sum();
        params.setSize(size);
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        int id = installer.createSession(params);
        boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id)) {
            var staging = InstallProgress.staging(size);
            for (File apk : apks) {
                try (var input = new FileInputStream(apk);
                     var output = session.openWrite(apk.getName(), 0, apk.length())) {
                    staging.copy(input, output);
                    session.fsync(output);
                }
            }
            Intent status = new Intent(context, LauncherActivity.InstallResultReceiver.class).setAction(RESULT)
                .setData(Uri.fromParts("moggcord-install", Integer.toString(id), null));
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent receiver = PendingIntent.getBroadcast(context, id, status, flags);
            awaitingConfirmation.run();
            session.commit(receiver.getIntentSender());
            committed = true;
        } finally {
            if (!committed) installer.abandonSession(id);
        }
    }

    private static String signingPassword(Context context) throws IOException {
        var preferences = context.getSharedPreferences("discord-signing", Context.MODE_PRIVATE);
        String password = preferences.getString("password", null);
        if (password != null) return password;
        password = UUID.randomUUID().toString();
        if (!preferences.edit().putString("password", password).commit()) {
            throw new IOException("Could not save the Moggcord signing key password.");
        }
        return password;
    }

    private static void prepareSigningKey(File keyFile, char[] password) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
        AtomicFile file = new AtomicFile(keyFile);
        if (keyFile.exists()) {
            try (FileInputStream input = file.openRead()) {
                keyStore.load(input, password);
            }
        } else {
            keyStore.load(null, password);
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var pair = generator.generateKeyPair();
            var subject = new X500Name("CN=Moggcord Discord");
            long now = System.currentTimeMillis();
            var certificate = new JcaX509v3CertificateBuilder(subject,
                new BigInteger(128, new SecureRandom()).setBit(127),
                new Date(now - 86_400_000L), new Date(now + 30L * 366 * 86_400_000L),
                subject, pair.getPublic());
            var signing = new JcaContentSignerBuilder("SHA256withRSA").build(pair.getPrivate());
            var signed = new JcaX509CertificateConverter().getCertificate(certificate.build(signing));
            keyStore.setKeyEntry(KEY_ALIAS, pair.getPrivate(), password, new Certificate[] {signed});
            FileOutputStream output = file.startWrite();
            try {
                keyStore.store(output, password);
                file.finishWrite(output);
            } catch (Exception error) {
                file.failWrite(output);
                throw error;
            }
        }
    }
}
