/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

public final class LauncherActivity extends Activity {
    private static final String DISCORD = "com.discord";
    private static final String DISCORD_VARIANT = "cc.moggcord.mobile.discord";
    private static final String LEGACY_LOADER = "cc.moggcord.mobile.loader";
    private static final String MANAGER = "org.lsposed.manager";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.launcher);
        View launcher = findViewById(R.id.launcher);
        if (Build.VERSION.SDK_INT >= 30) {
            launcher.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            launcher.requestApplyInsets();
        }
        findViewById(R.id.setup_action).setOnClickListener(view -> showSetup());
    }

    @Override
    protected void onResume() {
        super.onResume();
        PackageInfo discord = installedPackage(DISCORD);
        if (discord == null) discord = installedPackage(DISCORD_VARIANT);
        Button discordAction = findViewById(R.id.discord_action);
        TextView discordStatus = findViewById(R.id.discord_status);
        Intent discordIntent = discord == null ? null : getPackageManager().getLaunchIntentForPackage(discord.packageName);
        if (discord == null) {
            discordStatus.setText(R.string.discord_missing);
            discordAction.setText(R.string.get_discord);
            discordAction.setOnClickListener(view -> open(
                new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + DISCORD)), R.string.discord));
        } else {
            String version = discord.versionName;
            discordStatus.setText(version == null || version.trim().isEmpty()
                ? getString(R.string.discord_found) : getString(R.string.discord_version, version));
            discordAction.setText(R.string.open_discord);
            discordAction.setOnClickListener(view -> open(discordIntent, R.string.discord));
        }
        Button setupAction = findViewById(R.id.setup_action);
        setupAction.setEnabled(discord != null);
        setupAction.setAlpha(discord == null ? 0.55f : 1f);
        findViewById(R.id.previous_loader).setVisibility(installedPackage(LEGACY_LOADER) == null ? View.GONE : View.VISIBLE);
    }

    private PackageInfo installedPackage(String packageName) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                return getPackageManager().getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0));
            }
            return getPackageManager().getPackageInfo(packageName, 0);
        } catch (PackageManager.NameNotFoundException error) {
            return null;
        }
    }

    private void showSetup() {
        Intent managerIntent = getPackageManager().getLaunchIntentForPackage(MANAGER);
        String message = getString(R.string.setup_steps);
        if (installedPackage(LEGACY_LOADER) != null) {
            message = getString(R.string.previous_loader_step) + "\n\n" + message;
        }
        if (managerIntent == null) {
            message = message + "\n\n" + getString(R.string.manager_unavailable);
        }
        AlertDialog.Builder dialog = new AlertDialog.Builder(this)
            .setTitle(R.string.setup_title)
            .setMessage(message)
            .setNegativeButton(R.string.done, null);
        if (managerIntent != null) {
            dialog.setPositiveButton(R.string.open_manager, (ignored, which) -> open(managerIntent, R.string.open_manager));
        }
        dialog.show();
    }

    private void open(Intent intent, int target) {
        if (intent != null) {
            try {
                startActivity(intent);
                return;
            } catch (ActivityNotFoundException | SecurityException error) {
                android.util.Log.w("MoggcordLauncher", "Could not open requested app.", error);
            }
        }
        Toast.makeText(this, getString(R.string.could_not_open, getString(target)), Toast.LENGTH_SHORT).show();
    }
}
