/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

public final class LauncherActivity extends Activity {
    private static final String TAG = "MoggcordLauncher";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    // The install and its confirmation can outlive one Activity instance.
    private static LauncherActivity foreground;
    private static boolean installing;
    private static int message;
    private static String detail;
    private static Intent confirmation;
    private boolean requestedPermission;
    private boolean requestedTestInstall;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.launcher);
        if (state != null) {
            requestedPermission = state.getBoolean("requestedPermission");
            requestedTestInstall = state.getBoolean("requestedTestInstall");
        }
        View launcher = findViewById(R.id.launcher);
        if (Build.VERSION.SDK_INT >= 30) {
            launcher.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            launcher.requestApplyInsets();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = this;
        if (requestedPermission) {
            requestedPermission = false;
            if (getPackageManager().canRequestPackageInstalls()) {
                startInstall(requestedTestInstall);
            } else {
                setMessage(R.string.install_permission_required, null);
            }
        }
        refresh();
    }

    @Override
    protected void onPause() {
        if (foreground == this) foreground = null;
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putBoolean("requestedPermission", requestedPermission);
        state.putBoolean("requestedTestInstall", requestedTestInstall);
    }

    private void refresh() {
        PackageInfo discord = installedPackage(DiscordPackage.ORIGINAL);
        PackageInfo moggcord = installedPackage(DiscordPackage.MOGGCORD);
        TextView status = findViewById(R.id.discord_status);
        status.setText(discord == null ? getString(R.string.discord_missing) :
            discord.versionName == null || discord.versionName.isBlank() ? getString(R.string.discord_found) :
                getString(R.string.discord_version, discord.versionName));

        Button install = findViewById(R.id.discord_action);
        install.setEnabled(!installing);
        install.setVisibility(discord == null && moggcord != null ? View.GONE : View.VISIBLE);
        install.setText(installing ? R.string.installing : discord == null ? R.string.get_discord :
            moggcord == null ? R.string.install_in_discord : R.string.reinstall_moggcord);
        install.setOnClickListener(view -> {
            if (discord == null) {
                open(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + DiscordPackage.ORIGINAL)), R.string.discord);
            } else {
                requestInstall(false);
            }
        });

        Button launch = findViewById(R.id.open_moggcord);
        launch.setVisibility(moggcord == null ? View.GONE : View.VISIBLE);
        launch.setEnabled(!installing);
        launch.setOnClickListener(view -> open(
            getPackageManager().getLaunchIntentForPackage(DiscordPackage.MOGGCORD), R.string.open_moggcord));

        Button test = findViewById(R.id.test_without_moggcord);
        test.setVisibility(discord != null && moggcord != null ? View.VISIBLE : View.GONE);
        test.setEnabled(!installing);
        test.setOnClickListener(view -> requestInstall(true));

        findViewById(R.id.install_progress).setVisibility(installing && message == R.string.preparing
            ? View.VISIBLE : View.GONE);
        TextView installStatus = findViewById(R.id.install_status);
        installStatus.setVisibility(message == 0 ? View.GONE : View.VISIBLE);
        if (message != 0) {
            installStatus.setText(detail == null || detail.isBlank() ? getString(message) :
                getString(message) + "\n" + detail);
        }
        if (confirmation != null) {
            Intent next = confirmation;
            confirmation = null;
            try {
                startActivity(next);
            } catch (ActivityNotFoundException | SecurityException error) {
                Log.w(TAG, "Android did not open the confirmation dialog.", error);
                finishInstall(R.string.install_failed, getString(R.string.confirmation_unavailable));
            }
        }
    }

    private PackageInfo installedPackage(String name) {
        try {
            return getPackageManager().getPackageInfo(name, 0);
        } catch (PackageManager.NameNotFoundException error) {
            return null;
        }
    }

    private void requestInstall(boolean testMode) {
        if (getPackageManager().canRequestPackageInstalls()) {
            startInstall(testMode);
            return;
        }
        requestedPermission = true;
        requestedTestInstall = testMode;
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getPackageName()));
        if (!open(intent, R.string.install_permission)) {
            requestedPermission = false;
            setMessage(R.string.install_permission_required, null);
        }
    }

    private void startInstall(boolean testMode) {
        if (installing) return;
        PackageInfo discord = installedPackage(DiscordPackage.ORIGINAL);
        if (discord == null || discord.applicationInfo == null) {
            setMessage(R.string.discord_missing, null);
            return;
        }
        Context context = getApplicationContext();
        installing = true;
        setMessage(R.string.preparing, null);
        new Thread(() -> {
            try {
                DiscordInstaller.install(context, discord.applicationInfo, testMode,
                    () -> MAIN.post(() -> setMessage(R.string.confirm_install, null)));
            } catch (Exception | LinkageError error) {
                Log.e(TAG, "Could not prepare Moggcord Discord.", error);
                MAIN.post(() -> finishInstall(R.string.install_failed, error.getLocalizedMessage()));
            }
        }, "moggcord-install").start();
    }

    private static void setMessage(int text, String error) {
        message = text;
        detail = error;
        if (foreground != null) foreground.refresh();
    }

    private static void finishInstall(int text, String error) {
        installing = false;
        confirmation = null;
        setMessage(text, error);
    }

    private boolean open(Intent intent, int target) {
        if (intent != null) {
            try {
                startActivity(intent);
                return true;
            } catch (ActivityNotFoundException | SecurityException error) {
                Log.w(TAG, "Could not open requested app.", error);
            }
        }
        Toast.makeText(this, getString(R.string.could_not_open, getString(target)), Toast.LENGTH_SHORT).show();
        return false;
    }

    public static final class InstallResultReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DiscordInstaller.RESULT.equals(intent.getAction())) return;
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            switch (status) {
                case PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    confirmation = Build.VERSION.SDK_INT >= 33
                        ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                        : intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirmation == null) {
                        finishInstall(R.string.install_failed, context.getString(R.string.confirmation_unavailable));
                    } else {
                        installing = true;
                        setMessage(R.string.confirm_install, null);
                    }
                }
                case PackageInstaller.STATUS_SUCCESS -> {
                    if (intent.getBooleanExtra(DiscordInstaller.TEST_MODE, false)) {
                        long pageSize = Os.sysconf(OsConstants._SC_PAGESIZE);
                        String device = pageSize > 0
                            ? context.getString(R.string.test_mode_device, Build.VERSION.RELEASE, pageSize / 1024)
                            : null;
                        finishInstall(R.string.test_install_success, device);
                    } else {
                        finishInstall(R.string.install_success, null);
                    }
                }
                case PackageInstaller.STATUS_FAILURE_ABORTED -> finishInstall(R.string.install_canceled, null);
                default -> finishInstall(R.string.install_failed, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
            }
        }
    }
}
