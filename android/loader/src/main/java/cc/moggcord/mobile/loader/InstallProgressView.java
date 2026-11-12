/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.content.Context;
import android.text.TextUtils;
import android.util.AttributeSet;
import android.view.LayoutInflater;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public final class InstallProgressView extends LinearLayout {
    private final ProgressBar bar;
    private final TextView percent;
    private final TextView phase;
    private final TextView time;
    private final TextView log;
    private final Runnable observer = this::render;
    private final Runnable clock = this::updateClock;

    public InstallProgressView(Context context, AttributeSet attributes) {
        super(context, attributes);
        setOrientation(VERTICAL);
        LayoutInflater.from(context).inflate(R.layout.install_progress_content, this, true);
        bar = findViewById(R.id.install_progress);
        percent = findViewById(R.id.install_percent);
        phase = findViewById(R.id.install_phase);
        time = findViewById(R.id.install_time);
        log = findViewById(R.id.install_log);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        InstallProgress.observe(observer);
        render();
    }

    @Override
    protected void onDetachedFromWindow() {
        InstallProgress.stopObserving(observer);
        removeCallbacks(clock);
        super.onDetachedFromWindow();
    }

    private void render() {
        setVisibility(InstallProgress.hasProgress() ? VISIBLE : GONE);
        if (!InstallProgress.hasProgress()) return;
        Context context = getContext();
        int value = InstallProgress.percent();
        bar.setProgress(value, InstallProgress.isRunning());
        percent.setText(context.getString(R.string.install_percent_value, value));
        String currentPhase = InstallProgress.phaseText(context);
        if (!TextUtils.equals(phase.getText(), currentPhase)) phase.setText(currentPhase);
        String currentLog = InstallProgress.logText(context);
        if (!TextUtils.equals(log.getText(), currentLog)) log.setText(currentLog);
        updateClock();
    }

    private void updateClock() {
        removeCallbacks(clock);
        time.setText(InstallProgress.timeText(getContext()));
        if (InstallProgress.isRunning()) postDelayed(clock, 1000);
    }
}
