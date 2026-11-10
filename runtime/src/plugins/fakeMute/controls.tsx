/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { findInReactTree } from "@lib/utils";
import { showToast } from "@lib/ui/toasts";
import { cloneElement, createContext, createElement, isValidElement } from "react";
import { Pressable, Text, View } from "react-native";
import { replaceVideoControl } from "../../../../shared/voice-controls";
import { afterRender, moduleAt } from "../common";
import { SlashedIcon } from "../silentTyping";

const Replacement = createContext<any>(null);
let cameraPress: (() => void) | undefined;
let svg: any;

function GhostIcon(props: any) {
    svg ??= findByProps("Svg", "Path");
    if (!svg?.Svg || !svg?.Path) {
        const Headphones = moduleAt("design/components/Icon/native/redesign/generated/HeadphonesIcon.tsx")?.HeadphonesIcon;
        return Headphones ? <Headphones {...props} /> : <Text style={{ color: "#f2f3f5", fontWeight: "700" }}>FD</Text>;
    }
    return <svg.Svg width={24} height={24} viewBox="0 0 24 24">
        <svg.Path fill="#f2f3f5" d="M12 2a8 8 0 0 0-8 8v10a1 1 0 0 0 1.7.7L8 18.4l3.3 3.3a1 1 0 0 0 1.4 0l3.3-3.3 2.3 2.3A1 1 0 0 0 20 20V10a8 8 0 0 0-8-8Z" />
        <svg.Path fill="#252529" d="M8 9h2v3H8zm6 0h2v3h-2z" />
    </svg.Svg>;
}

function transformDrawers(node: any): any {
    if (!isValidElement<any>(node)) return node;
    if (typeof node.props.renderContent === "function") {
        const original = node.props.renderContent;
        return cloneElement(node, {
            renderContent: (...args: any[]) => <View style={{ flex: 1 }}>
                <View style={{ flex: 1 }}>{original(...args)}</View>
                <Pressable accessibilityRole="button" accessibilityLabel="Camera" onPress={() => cameraPress?.()}
                    style={{ minHeight: 48, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "600" }}>Camera</Text>
                    <Text style={{ marginLeft: "auto", color: "#b5bac1", fontSize: 18 }}>›</Text>
                </Pressable>
            </View>
        } as any);
    }
    const children = node.props.children;
    if (children == null) return node;
    const next = Array.isArray(children) ? children.map(transformDrawers) : transformDrawers(children);
    return cloneElement(node, undefined, next);
}

export function installFakeDeafenControls(plugin: any, toggle: () => void) {
    const hooks = moduleAt<any>("modules/voice_panel/native/controls/useControlsButtons.tsx");
    const video = moduleAt<any>("modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx");
    const drawer = moduleAt<any>("modules/voice_panel/native/controls/VoicePanelControlsDrawer.tsx");
    const key = typeof hooks?.useControlsButtons === "function" ? "useControlsButtons" : "default";
    if (typeof hooks?.[key] !== "function" || !video?.default) return () => {};

    const undoVideo = afterRender(video, "default", (_props, tree) =>
        <Replacement.Consumer>{state => {
            if (!state || !isValidElement<any>(tree)) return tree;
            if (typeof tree.props.onPress === "function") cameraPress = tree.props.onPress;
            else {
                const button = findInReactTree(tree, node => typeof node?.props?.onPress === "function");
                if (button) cameraPress = button.props.onPress;
            }
            return cloneElement(tree, {
                onPress: state.toggle,
                disabled: false,
                accessibilityLabel: state.on ? "Disable Fake Deafen" : "Enable Fake Deafen",
                style: [tree.props.style, { backgroundColor: "transparent" }],
                children: state.on ? <SlashedIcon Icon={GhostIcon} /> : <GhostIcon />
            } as any);
        }}</Replacement.Consumer>);
    if (!undoVideo) return () => {};

    function FakeControl({ render, originalKey, props }: any) {
        const store = useProxy(plugin.store);
        return <Replacement.Provider value={{ on: store.fakeDeafen, toggle }}>
            {render(originalKey, props)}
        </Replacement.Provider>;
    }

    const undoButtons = after(key, hooks, (_args, buttons) =>
        replaceVideoControl(buttons, render => (originalKey: string, props: any) =>
            <FakeControl key={originalKey} render={render} originalKey={originalKey} props={props} />));
    const undoDrawer = drawer?.default ? afterRender(drawer, "default", (_props, tree) => transformDrawers(tree)) : null;
    return () => {
        undoButtons();
        undoVideo();
        undoDrawer?.();
        cameraPress = undefined;
    };
}
