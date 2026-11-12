/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.format.DateUtils;

import org.lsposed.patch.util.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;

final class InstallProgress {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final int MAX_LOG_LINES = 6;
    private static final int ANDROID_CONFIRMATION = 96;
    private static final ArrayDeque<LogLine> lines = new ArrayDeque<>();
    private static Runnable listener;
    private static boolean running;
    private static long start;
    private static long end;
    private static long lastAdvance;
    private static int percent;
    private static int phase;
    private static int file;
    private static int files;

    private record LogLine(long seconds, int label, int file, int files) {}

    static void observe(Runnable observer) {
        listener = observer;
    }

    static void stopObserving(Runnable observer) {
        if (listener == observer) listener = null;
    }

    static void onLauncherMessage(int message, boolean installing) {
        if (message == R.string.preparing) {
            lines.clear();
            running = true;
            start = SystemClock.elapsedRealtime();
            end = 0;
            lastAdvance = start;
            percent = 0;
            phase = 0;
            update(0, R.string.install_phase_prepare, 0, 0);
        } else if (message == R.string.confirm_install && running) {
            update(ANDROID_CONFIRMATION, R.string.install_phase_confirm, 0, 0);
        } else if (!installing && running) {
            int outcome = R.string.install_phase_complete;
            if (message == R.string.install_failed) outcome = R.string.install_phase_failed;
            if (message == R.string.install_canceled) outcome = R.string.install_phase_canceled;
            end = SystemClock.elapsedRealtime();
            running = false;
            update(outcome == R.string.install_phase_complete ? 100 : percent, outcome, 0, 0);
        }
    }

    static Transfer copying(long size) {
        return new Transfer(size, 7, 31, R.string.install_phase_copy);
    }

    static void patching(Logger.Stage stage, int index, int count) {
        int position = switch (stage) {
            case READING -> 0;
            case SIGNING -> 12;
            case PACKING_SPLIT -> 54;
            case REWRITING -> 23;
            case INJECTING -> 43;
            case EMBEDDING -> 62;
            case WRITING -> 82;
            case DONE -> 100;
        };
        int label = switch (stage) {
            case READING -> R.string.install_phase_read;
            case SIGNING -> R.string.install_phase_sign;
            case PACKING_SPLIT -> R.string.install_phase_split;
            case REWRITING -> R.string.install_phase_patch;
            case INJECTING, EMBEDDING -> R.string.install_phase_add_module;
            case WRITING, DONE -> R.string.install_phase_write;
        };
        int progress = 32 + (50 * ((index - 1) * 100 + position)) / (count * 100);
        report(progress, label, index, count);
    }

    static Transfer staging(long size) {
        return new Transfer(size, 83, 95, R.string.install_phase_stage);
    }

    private static void report(int progress, int label, int index, int count) {
        MAIN.post(() -> {
            if (running) update(progress, label, index, count);
        });
    }

    private static void update(int progress, int label, int index, int count) {
        if (progress > percent) {
            percent = progress;
            lastAdvance = SystemClock.elapsedRealtime();
        }
        if (phase != label || file != index || files != count) {
            phase = label;
            file = index;
            files = count;
            if (lines.size() == MAX_LOG_LINES) lines.removeFirst();
            lines.addLast(new LogLine((SystemClock.elapsedRealtime() - start) / 1000, label, index, count));
        }
        if (listener != null) listener.run();
    }

    static boolean hasProgress() { return phase != 0; }
    static boolean isRunning() { return running; }
    static int percent() { return percent; }

    static boolean clearCompleted() {
        if (phase != R.string.install_phase_complete) return false;
        phase = 0;
        lines.clear();
        if (listener != null) listener.run();
        return true;
    }

    static String phaseText(Context context) {
        return formatPhase(context, phase, file, files);
    }

    static String timeText(Context context) {
        long now = running ? SystemClock.elapsedRealtime() : end;
        long elapsed = Math.max(0, now - start);
        String formatted = DateUtils.formatElapsedTime(elapsed / 1000);
        if (running && percent >= 12 && percent < ANDROID_CONFIRMATION
                && elapsed >= 2_000 && now - lastAdvance <= 6_000) {
            long remaining = Math.max(1, Math.round(elapsed * (100.0 - percent) / percent / 1000));
            return context.getString(R.string.install_time_estimate, formatted, DateUtils.formatElapsedTime(remaining));
        }
        return context.getString(R.string.install_time_elapsed, formatted);
    }

    static String logText(Context context) {
        StringBuilder log = new StringBuilder();
        for (LogLine line : lines) {
            if (log.length() > 0) log.append('\n');
            log.append(DateUtils.formatElapsedTime(line.seconds())).append("  ")
                .append(formatPhase(context, line.label(), line.file(), line.files()));
        }
        return log.toString();
    }

    private static String formatPhase(Context context, int label, int index, int count) {
        return count > 1 ? context.getString(R.string.install_phase_file, context.getString(label), index, count)
            : context.getString(label);
    }

    static final class Transfer {
        private final long size;
        private final int first;
        private final int last;
        private final int label;
        private final byte[] buffer = new byte[64 * 1024];
        private long copied;
        private int previous;

        private Transfer(long size, int first, int last, int label) {
            this.size = Math.max(1, size);
            this.first = first;
            this.last = last;
            this.label = label;
            previous = first;
            report(first, label, 0, 0);
        }

        void copy(InputStream input, OutputStream output) throws IOException {
            for (int length; (length = input.read(buffer)) != -1;) {
                output.write(buffer, 0, length);
                copied += length;
                int progress = first + (int) ((last - first) * Math.min(copied, size) / size);
                if (progress != previous) {
                    previous = progress;
                    report(progress, label, 0, 0);
                }
            }
        }
    }
}
