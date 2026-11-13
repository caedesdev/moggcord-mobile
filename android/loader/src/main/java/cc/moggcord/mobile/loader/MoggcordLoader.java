/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.app.AndroidAppHelper;
import android.app.Instrumentation;
import android.content.Context;
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
    private final Set<Object> initialized = Collections.newSetFromMap(new WeakHashMap<>());
    private String modulePath;
    private volatile Context appContext;
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
                Log.w(TAG, "Could not attach the Discord resource name fallback.", error);
            }
        }
        try {
            Class<?> delegate = findDelegate(param.classLoader);
            Method file = delegate.getDeclaredMethod(FILE_LOADER, String.class, String.class, boolean.class);
            Method assets = delegate.getDeclaredMethod("loadScriptFromAssets", AssetManager.class, String.class, boolean.class);
            File cache = new File(param.appInfo.dataDir, "code_cache");
            PlatformIndicators.install();
            captureAppContext(param.packageName);
            XC_MethodHook beforeHostBundle = new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam call) {
                    synchronized (initialized) {
                        if (!initialized.add(call.thisObject)) return;
                    }
                    try {
                        AndroidRuntimeUpdates.Selection update = null;
                        try {
                            Context context = appContext;
                            if (context == null) context = AndroidAppHelper.currentApplication();
                            if (context == null) {
                                Log.w(TAG, "Android update storage isn't available during startup.");
                            } else {
                                update = AndroidRuntimeUpdates.select(context);
                            }
                        } catch (Exception | LinkageError error) {
                            Log.w(TAG, "Could not read Android updates. Using the embedded runtime.", error);
                        }
                        String path = installPayload(cache, update).getAbsolutePath();
                        XposedBridge.invokeOriginalMethod(file, call.thisObject, new Object[] { path, path, call.args[2] });
                        Log.i(TAG, update != null && update.source() != null
                            ? "Loaded a signed Moggcord update." : "Loaded the embedded Moggcord payload.");
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

    private void captureAppContext(String packageName) {
        try {
            Method create = Instrumentation.class.getMethod("newApplication", ClassLoader.class, String.class, Context.class);
            XposedBridge.hookMethod(create, new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam call) {
                    Context context = (Context) call.args[2];
                    // React Native can start while Android is still constructing the Application.
                    if (packageName.equals(context.getPackageName())) appContext = context;
                }
            });
        } catch (Exception | LinkageError error) {
            Log.w(TAG, "Could not capture the early application context for Android updates.", error);
        }
    }

    private static void hookResourceLookup() throws NoSuchMethodException {
        Method lookup = Resources.class.getMethod("getIdentifier", String.class, String.class, String.class);
        XposedBridge.hookMethod(lookup, new XC_MethodHook() {
            @Override
            protected void afterHookedMethod(MethodHookParam call) throws Throwable {
                if (call.hasThrowable() || !Integer.valueOf(0).equals(call.getResult())
                        || !(call.args[0] instanceof String name) || name.isEmpty()) return;

                int separator = name.indexOf(':');
                Object requestedPackage = separator >= 0 ? name.substring(0, separator) : call.args[2];
                String alternatePackage;
                // Discord can ask for com.discord explicitly. Older clones may still have that resource table name.
                if (DiscordPackage.ORIGINAL.equals(requestedPackage)) alternatePackage = DiscordPackage.MOGGCORD;
                else if (DiscordPackage.MOGGCORD.equals(requestedPackage)) alternatePackage = DiscordPackage.ORIGINAL;
                else return;

                String alternateName = separator >= 0 ? alternatePackage + name.substring(separator) : name;
                Object result = XposedBridge.invokeOriginalMethod(lookup, call.thisObject,
                    new Object[] { alternateName, call.args[1], alternatePackage });
                if (result instanceof Integer id && id != 0) call.setResult(id);
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

    private File installPayload(File cache, AndroidRuntimeUpdates.Selection update) throws IOException {
        if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("Could not create the code cache");
        File output = new File(cache, BUNDLE);
        File temporary = File.createTempFile("moggcord-", ".js", cache);
        try {
            try (OutputStream target = Files.newOutputStream(temporary.toPath())) {
                target.write("globalThis.__MOGGCORD_PLATFORM_ICONS__={apiVersion:1};\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                if (update != null) target.write(update.prefix().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                if (update != null && update.source() != null) target.write(update.source());
                else copyEmbedded(target);
            }
            Files.move(temporary.toPath(), output.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return output;
        } finally {
            Files.deleteIfExists(temporary.toPath());
        }
    }

    private void copyEmbedded(OutputStream target) throws IOException {
        try (ZipFile module = new ZipFile(modulePath)) {
            var entry = module.getEntry("assets/" + BUNDLE);
            if (entry == null || entry.getSize() <= 0 || entry.getSize() > AndroidRuntimeUpdates.MAX_BUNDLE_BYTES) {
                throw new IOException("The loader has no valid embedded payload");
            }
            try (InputStream input = module.getInputStream(entry)) {
                byte[] buffer = new byte[8192];
                int total = 0;
                for (int size; (size = input.read(buffer)) != -1; ) {
                    total += size;
                    if (total > entry.getSize()) throw new IOException("The embedded payload exceeds its declared size");
                    target.write(buffer, 0, size);
                }
                if (total != entry.getSize()) throw new IOException("The embedded payload is incomplete");
            }
        }
    }
}
