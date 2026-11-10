/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore, guildRoles } from "../common";
import { displayName, getGuild } from "../hooks";
import { addUserAction } from "../userActions";
import { showText } from "../ui/dialogs";
import { memberPermissions } from "./permissions";

const title = (name: string) => name.toLowerCase().split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

export default definePlugin({
    id: "moggcord.permissions-viewer",
    name: "PermissionsViewer",
    description: tx("View a server member's roles and permissions from their profile or a message."),
    icon: "ShieldIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(addUserAction({
            key: "permissions-viewer",
            icon: "ShieldIcon",
            label: () => t("View Roles and Permissions"),
            visible: (user, context) => !!context.guildId && !!user?.id,
            onPress: (user, { guildId }) => {
                if (!guildId) return;
                const guild = getGuild(guildId);
                const member = getStore("GuildMemberStore")?.getMember?.(guildId, user.id);
                const roles = guildRoles(guildId);
                const table = findByProps("Permissions", "ChannelTypes")?.Permissions ?? findByProps("Permissions")?.Permissions ?? {};
                const ownerId = guild?.ownerId ?? guild?.owner_id;
                const result = memberPermissions(guildId, user.id, ownerId, member?.roles ?? [], roles, table);
                if ((!member && ownerId !== user.id) || !result.complete) {
                    showText(displayName(user), t("Member or role details have not loaded yet. Open this member's server profile and try again."));
                    return;
                }
                showText(`${displayName(user)}${guild?.name ? ` · ${guild.name}` : ""}`, [
                    result.owner ? t("Server owner") : "",
                    `${t("Roles")}: ${result.roles.map(r => r.name).join(", ") || "—"}`,
                    "",
                    result.administrator ? t("Administrator: every server permission")
                        : `${t("Server permissions")}:\n${result.permissions.map(p => `• ${title(p)}`).join("\n") || "—"}`,
                    "",
                    t("Channel overrides and role hierarchy may limit individual actions."),
                ].filter((line, i) => line || i === 2).join("\n"));
            },
        }));
    },
});
