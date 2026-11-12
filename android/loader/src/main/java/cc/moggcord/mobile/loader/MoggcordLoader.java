/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.content.res.AssetManager;
import android.content.res.Resources;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipFile;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.IXposedHookZygoteInit;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.callbacks.XC_LoadPackage;
import org.luckypray.dexkit.DexKitBridge;
import org.luckypray.dexkit.query.FindMethod;
import org.luckypray.dexkit.query.matchers.ClassMatcher;
import org.luckypray.dexkit.query.matchers.MethodMatcher;

public final class MoggcordLoader implements IXposedHookZygoteInit, IXposedHookLoadPackage {
    private static final String TAG = "MoggcordMobile";
    private static final String BUNDLE = "moggcord-mobile.js";
    private static final String REACT_INSTANCE = "com.facebook.react.runtime.ReactInstance";
    private static final String FILE_LOADER = "loadScriptFromFile";
    private static final int MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
    private final Set<Object> initialized = Collections.newSetFromMap(new WeakHashMap<>());
    private String modulePath;
    private boolean hooked;
    private boolean resourceLookupHooked;

    @Override
    public void initZygote(StartupParam param) {
        modulePath = param.modulePath;
    }

    @Override
    public synchronized void handleLoadPackage(XC_LoadPackage.LoadPackageParam param) {
        if (hooked || modulePath == null || !param.packageName.equals(param.processName)
                || !(DiscordPackage.ORIGINAL.equals(param.packageName) || DiscordPackage.MOGGCORD.equals(param.packageName))) return;
        if (DiscordPackage.MOGGCORD.equals(param.packageName) && !resourceLookupHooked) {
            try {
                hookResourceLookup();
                resourceLookupHooked = true;
            } catch (Throwable error) {
                Log.w(TAG, "Could not attach the Discord resource lookup fallback.", error);
            }
        }
        try {
            Class<?> delegate = findDelegate(param.classLoader);
            Method file = delegate.getDeclaredMethod(FILE_LOADER, String.class, String.class, boolean.class);
            Method assets = delegate.getDeclaredMethod("loadScriptFromAssets", AssetManager.class, String.class, boolean.class);
            File payload = installPayload(new File(param.appInfo.dataDir, "code_cache"));
            PlatformIndicators.install();
            XC_MethodHook beforeHostBundle = new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam call) {
                    synchronized (initialized) {
                        if (!initialized.add(call.thisObject)) return;
                    }
                    try {
                        String path = payload.getAbsolutePath();
                        XposedBridge.invokeOriginalMethod(file, call.thisObject, new Object[] { path, path, call.args[2] });
                        Log.i(TAG, "Loaded the embedded Moggcord payload.");
                    } catch (Throwable error) {
                        Log.w(TAG, "Could not load Moggcord into this React Native runtime.", error);
                    }
                }
            };
            XC_MethodHook.Unhook fileHook = XposedBridge.hookMethod(file, beforeHostBundle);
            try {
                XposedBridge.hookMethod(assets, beforeHostBundle);
            } catch (Throwable error) {
                fileHook.unhook();
                throw error;
            }
            hooked = true;
        } catch (Throwable error) {
            Log.w(TAG, "Could not attach the Moggcord loader. Discord can continue.", error);
        }
    }

    private static void hookResourceLookup() throws NoSuchMethodException {
        Method getIdentifier = Resources.class.getMethod("getIdentifier", String.class, String.class, String.class);
        String clonePrefix = DiscordPackage.MOGGCORD + ":";
        XposedBridge.hookMethod(getIdentifier, new XC_MethodHook() {
            private final AtomicBoolean reported = new AtomicBoolean();

            @Override
            protected void afterHookedMethod(MethodHookParam call) throws Throwable {
                if (call.hasThrowable() || !Integer.valueOf(0).equals(call.getResult())
                        || !(call.args[0] instanceof String name) || name.isEmpty()) return;

                // Repackaging changes the manifest package while Discord's resource table keeps its original name.
                if (name.startsWith(clonePrefix)) {
                    name = DiscordPackage.ORIGINAL + name.substring(DiscordPackage.MOGGCORD.length());
                } else if (name.indexOf(':') >= 0 || !DiscordPackage.MOGGCORD.equals(call.args[2])) {
                    return;
                }
                Object fallback = XposedBridge.invokeOriginalMethod(getIdentifier, call.thisObject,
                    new Object[] { name, call.args[1], DiscordPackage.ORIGINAL });
                if (fallback instanceof Integer id && id != 0) {
                    call.setResult(id);
                    if (reported.compareAndSet(false, true)) Log.i(TAG, "Resolved a resource using Discord's original package name.");
                }
            }
        });
    }

    private static Class<?> findDelegate(ClassLoader loader) throws Exception {
        try {
            return Class.forName(REACT_INSTANCE + "$loadJSBundle$1", false, loader);
        } catch (ClassNotFoundException ignored) {
            System.loadLibrary("dexkit");
            try (DexKitBridge bridge = DexKitBridge.create(loader, true)) {
                var methods = bridge.findMethod(FindMethod.create().matcher(MethodMatcher.create()
                    .name(FILE_LOADER)
                    .declaredClass(ClassMatcher.create().addInterface("com.facebook.react.bridge.JSBundleLoaderDelegate"))
                    .addInvoke(MethodMatcher.create().declaredClass(REACT_INSTANCE))));
                if (methods.size() != 1) throw new ClassNotFoundException("Could not identify Discord's bundle loader");
                return methods.get(0).getMethodInstance(loader).getDeclaringClass();
            }
        }
    }

    private File installPayload(File cache) throws IOException {
        if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("Could not create the code cache");
        File output = new File(cache, BUNDLE);
        File temporary = File.createTempFile("moggcord-", ".js", cache);
        try (ZipFile module = new ZipFile(modulePath)) {
            var entry = module.getEntry("assets/" + BUNDLE);
            if (entry == null || entry.getSize() <= 0 || entry.getSize() > MAX_BUNDLE_BYTES) {
                throw new IOException("The loader has no valid embedded payload");
            }
            try (InputStream input = module.getInputStream(entry); OutputStream target = Files.newOutputStream(temporary.toPath())) {
                target.write("globalThis.__MOGGCORD_PLATFORM_ICONS__={apiVersion:1};\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                byte[] buffer = new byte[8192];
                int total = 0;
                for (int size; (size = input.read(buffer)) != -1; ) {
                    total += size;
                    if (total > entry.getSize()) throw new IOException("The embedded payload exceeds its declared size");
                    target.write(buffer, 0, size);
                }
                if (total != entry.getSize()) throw new IOException("The embedded payload is incomplete");
            }
            Files.move(temporary.toPath(), output.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return output;
        } finally {
            Files.deleteIfExists(temporary.toPath());
        }
    }
}
