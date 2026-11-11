/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { t } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { after, before } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { TableRow } from "@metro/common/components";
import { findInReactTree } from "@lib/utils";
import { cloneElement, createContext, isValidElement } from "react";
import { StyleSheet, Text } from "react-native";
import { replaceVideoControl } from "../../../../shared/voice-controls";
import { afterRender, moduleAt } from "../common";
import { myVoiceChannel } from "../shared/calls";

const Replacement = createContext<any>(null);
let svg: any;

function GhostIcon({ color, slashed }: { color: string; slashed: boolean; }) {
    svg ??= findByProps("Svg", "Path");
    if (!svg?.Svg || !svg?.Path) {
        const name = slashed ? "HeadphonesSlashIcon" : "HeadphonesIcon";
        const Headphones = moduleAt(`design/components/Icon/native/redesign/generated/${name}.tsx`)?.[name];
        return Headphones ? <Headphones color={color} size="lg" /> : <Text style={{ color, fontWeight: "700" }}>FD</Text>;
    }
    // Fixed SVG bounds keep the slash on the icon instead of stretching across the button.
    return <svg.Svg width={28} height={28} viewBox="0 0 24 24" pointerEvents="none" accessible={false}>
        <svg.Path fill={color} fillRule="evenodd" d="M12 1.5a9 9 0 0 0-9 9V21a.8.8 0 0 0 1.35.58L8 18.3l3.45 3.12a.8.8 0 0 0 1.1 0L16 18.3l3.65 3.28A.8.8 0 0 0 21 21V10.5a9 9 0 0 0-9-9ZM8 8.5v3h2v-3H8Zm6 0v3h2v-3h-2Z" />
        {slashed && <svg.Path d="M3 21 21 3" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />}
    </svg.Svg>;
}

export function installFakeDeafenControls(plugin: any, toggle: () => void) {
    const hooks = moduleAt<any>("modules/voice_panel/native/controls/useControlsButtons.tsx");
    const video = moduleAt<any>("modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx");
    const voiceRows = moduleAt<any>("modules/voice_panel/native/controls/VoicePanelVoiceControlsButtons.tsx");
    const groups = moduleAt<any>("design/components/TableRow/native/TableRowGroup.native.tsx");
    const useVoiceStyles = moduleAt<any>("modules/voice_panel/native/controls/buttons/VoicePanelStyles.tsx")?.useVoicePanelButtonStyles;
    const key = typeof hooks?.useControlsButtons === "function" ? "useControlsButtons" : "default";
    if (typeof hooks?.[key] !== "function" || !video?.default || typeof groups?.TableRowGroup !== "function" ||
        !voiceRows?.HideSelfVideo || !voiceRows?.AudioRouteButton) return () => {};

    let camera: { channelId: string; onPress: () => void; disabled: boolean } | undefined;

    function StyledButton({ tree, state, wrapperSpecs }: any) {
        // The same hook and muted styles used by Discord's MicButton, including theme changes.
        const styles = useVoiceStyles?.(wrapperSpecs);
        const fill = StyleSheet.flatten(state.on ? styles?.iconFillRed : styles?.iconFill);
        const color = fill?.color ?? (state.on ? "#F23F43" : "#f2f3f5");
        const background = (state.on ? styles?.iconBgVoiceMuted : styles?.iconBg) ?? {
            backgroundColor: state.on ? "#F23F431A" : "transparent",
            borderColor: state.on ? "#F23F4326" : "transparent",
            borderWidth: state.on ? 1 : 0
        };
        return cloneElement(tree, {
            onPress: state.toggle,
            disabled: false,
            accessibilityLabel: state.on ? "Disable Fake Deafen" : "Enable Fake Deafen",
            style: [tree.props.style, background],
            children: <GhostIcon color={color} slashed={state.on} />
        } as any);
    }

    const undoVideo = afterRender(video, "default", (props, tree) =>
        <Replacement.Consumer>{state => {
            if (!state || !isValidElement<any>(tree)) return tree;
            const button = typeof tree.props.onPress === "function" ? tree :
                findInReactTree(tree, node => typeof node?.props?.onPress === "function");
            const channelId = myVoiceChannel();
            camera = channelId && button ? { channelId, onPress: button.props.onPress, disabled: !!button.props.disabled } : undefined;
            return <StyledButton tree={tree} state={state} wrapperSpecs={props.wrapperSpecs} />;
        }}</Replacement.Consumer>);
    if (!undoVideo) return () => {};

    // The actual row types identify the Voice Settings group in every language.
    const undoCameraRow = before("TableRowGroup", groups, ([props, ...args]) => {
        const children = props?.children;
        if (!Array.isArray(children)) return;
        const ownCamera = children.findIndex(child => child?.type === voiceRows.HideSelfVideo);
        if (ownCamera < 0 || children.some(child => child?.key === "moggcord-camera")) return;
        const audioOutput = children.find(child => child?.type === voiceRows.AudioRouteButton);
        const channelId = audioOutput?.props.channel?.id;
        if (!channelId) return;
        const cameraIcon = findAssetId("VideoIcon");
        const cameraRow = <TableRow key="moggcord-camera" label={t("Camera")} trailing={TableRow.Arrow}
            icon={<TableRow.Icon source={cameraIcon} />}
            disabled={!audioOutput.props.connected || camera?.channelId !== channelId || camera?.disabled}
            onPress={() => {
                if (audioOutput.props.connected && camera?.channelId === channelId && !camera.disabled && myVoiceChannel() === channelId)
                    camera.onPress();
            }} />;
        return [{ ...props, children: [...children.slice(0, ownCamera + 1), cameraRow, ...children.slice(ownCamera + 1)] }, ...args];
    });

    function FakeControl({ render, originalKey, props }: any) {
        const store = useProxy(plugin.store);
        return <Replacement.Provider value={{ on: !!(store.fakeMute || store.fakeDeafen), toggle }}>
            {render(originalKey, props)}
        </Replacement.Provider>;
    }

    const undoButtons = after(key, hooks, (_args, buttons) =>
        replaceVideoControl(buttons, render => (originalKey: string, props: any) =>
            <FakeControl key={originalKey} render={render} originalKey={originalKey} props={props} />));
    return () => {
        undoButtons();
        undoCameraRow();
        undoVideo();
        camera = undefined;
    };
}
