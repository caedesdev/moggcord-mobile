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
    private final Runnable observer = this::scheduleRender;
    private final Runnable frame = this::render;
    private final Runnable clock = this::updateClock;
    private boolean renderScheduled;

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
        removeCallbacks(frame);
        removeCallbacks(clock);
        renderScheduled = false;
        super.onDetachedFromWindow();
    }

    private void scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        postOnAnimation(frame);
    }

    private void render() {
        renderScheduled = false;
        setVisibility(InstallProgress.hasProgress() ? VISIBLE : GONE);
        if (!InstallProgress.hasProgress()) {
            removeCallbacks(clock);
            return;
        }
        Context context = getContext();
        int value = InstallProgress.percent();
        bar.setProgress(value);
        updateText(percent, context.getString(R.string.install_percent_value, value));
        updateText(phase, InstallProgress.phaseText(context));
        updateText(log, InstallProgress.logText(context));
        updateClock();
    }

    private void updateClock() {
        removeCallbacks(clock);
        updateText(time, InstallProgress.timeText(getContext()));
        if (InstallProgress.isRunning()) postDelayed(clock, 1000);
    }

    private static void updateText(TextView view, String text) {
        if (!TextUtils.equals(view.getText(), text)) view.setText(text);
    }
}
