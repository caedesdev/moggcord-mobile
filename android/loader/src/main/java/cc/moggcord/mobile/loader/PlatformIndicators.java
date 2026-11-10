/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package cc.moggcord.mobile.loader;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ReplacementSpan;
import android.widget.TextView;

import java.util.HashSet;
import java.util.Set;

import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedHelpers;

final class PlatformIndicators {
    private static final String PREFIX = "\u2063mcpi|";
    private static final int[] COLORS = { 0xff23a55a, 0xfff0b232, 0xfff23f43, 0xff80848e };
    private static boolean installed;

    static synchronized void install() {
        if (installed) return;
        XposedHelpers.findAndHookMethod(TextView.class, "setText", CharSequence.class, TextView.BufferType.class,
            new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam call) {
                    if (!(call.args[0] instanceof CharSequence)) return;
                    CharSequence value = (CharSequence) call.args[0];
                    if (value.length() > 512) return;
                    String text = value.toString();
                    int start = text.lastIndexOf(PREFIX);
                    if (start < 0 || !text.endsWith("\u2063")) return;
                    String tokens = text.substring(start + PREFIX.length(), text.length() - 1);
                    if (tokens.isEmpty() || tokens.length() > 10 || tokens.length() % 2 != 0) return;
                    Set<Character> devices = new HashSet<>();
                    for (int index = 0; index < tokens.length(); index += 2) {
                        char device = tokens.charAt(index);
                        char status = tokens.charAt(index + 1);
                        if ("dwmcv".indexOf(device) < 0 || status < '0' || status > '3' || !devices.add(device)) return;
                    }
                    SpannableStringBuilder result = new SpannableStringBuilder(value.subSequence(0, start));
                    for (int index = 0; index < tokens.length(); index += 2) {
                        int position = result.length();
                        result.append('\ufffc');
                        result.setSpan(new DeviceIcon(tokens.charAt(index), COLORS[tokens.charAt(index + 1) - '0']),
                            position, position + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        result.append('\u2009');
                    }
                    call.args[0] = result;
                }
            });
        installed = true;
    }

    private static final class DeviceIcon extends ReplacementSpan {
        private final char device;
        private final int color;

        DeviceIcon(char device, int color) {
            this.device = device;
            this.color = color;
        }

        @Override
        public int getSize(Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt metrics) {
            return (int) Math.ceil(paint.getTextSize());
        }

        @Override
        public void draw(Canvas canvas, CharSequence text, int start, int end, float x,
                         int top, int baseline, int bottom, Paint original) {
            float size = original.getTextSize();
            Paint.FontMetrics metrics = original.getFontMetrics();
            float y = baseline + (metrics.ascent + metrics.descent - size) / 2;
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.8f);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            int saved = canvas.save();
            try {
                canvas.translate(x, y);
                canvas.scale(size / 24, size / 24);
                Path path = new Path();
                switch (device) {
                    case 'd':
                        path.addRoundRect(new RectF(2, 3, 22, 16), 1.2f, 1.2f, Path.Direction.CW);
                        path.moveTo(12, 16); path.lineTo(12, 21);
                        path.moveTo(7, 21); path.lineTo(17, 21);
                        break;
                    case 'm':
                        path.addRoundRect(new RectF(6, 2, 18, 22), 1.6f, 1.6f, Path.Direction.CW);
                        path.moveTo(6, 17); path.lineTo(18, 17);
                        path.addCircle(12, 19.8f, .5f, Path.Direction.CW);
                        break;
                    case 'w':
                        path.addOval(new RectF(2, 2, 22, 22), Path.Direction.CW);
                        path.addOval(new RectF(7, 2, 17, 22), Path.Direction.CW);
                        path.moveTo(2, 12); path.lineTo(22, 12);
                        break;
                    case 'c':
                        path.moveTo(7, 6); path.lineTo(17, 6);
                        path.cubicTo(20, 6, 21, 8, 21, 10);
                        path.lineTo(22, 18); path.quadTo(22, 21, 19, 20);
                        path.lineTo(15, 16); path.lineTo(9, 16);
                        path.lineTo(5, 20); path.quadTo(2, 21, 2, 18);
                        path.lineTo(3, 10); path.cubicTo(3, 8, 4, 6, 7, 6); path.close();
                        path.moveTo(7, 10); path.lineTo(7, 14);
                        path.moveTo(5, 12); path.lineTo(9, 12);
                        path.addCircle(17, 11, .6f, Path.Direction.CW);
                        path.addCircle(19, 13, .6f, Path.Direction.CW);
                        break;
                    case 'v':
                        path.moveTo(6, 5); path.lineTo(18, 5);
                        path.quadTo(22, 5, 22, 9); path.lineTo(22, 16);
                        path.quadTo(22, 20, 17, 19);
                        path.lineTo(13, 16); path.lineTo(11, 16); path.lineTo(7, 19);
                        path.quadTo(2, 20, 2, 16); path.lineTo(2, 9);
                        path.quadTo(2, 5, 6, 5); path.close();
                        break;
                }
                canvas.drawPath(path, paint);
            } finally {
                canvas.restoreToCount(saved);
            }
        }
    }
}
