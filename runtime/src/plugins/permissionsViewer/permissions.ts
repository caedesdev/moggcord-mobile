/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
interface Role { id: string; name: string; position?: number; permissions: unknown; }

/** Permission values can be bigint in Discord stores and strings in API data. Never coerce to 32 bits. */
function bitfield(value: unknown): bigint | undefined {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) return;
    if (!["number", "string", "bigint"].includes(typeof value)) return;
    if (typeof value === "string" && !/^(?:\d+|0x[0-9a-f]+)$/i.test(value)) return;
    try {
        const result = BigInt(value as string | number | bigint);
        return result >= 0n ? result : undefined;
    } catch { return; }
}

/** Server permissions only; channel overwrites and moderation role hierarchy are separate. */
export function memberPermissions(guildId: string, userId: string, ownerId: string | undefined,
    roleIds: string[], roles: Record<string, Role>, table: Record<string, unknown>) {
    const ids = [...new Set([guildId, ...roleIds])];
    const assigned = ids.map(id => roles[id]).filter(Boolean).sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
    let bits = 0n;
    let complete = assigned.length === ids.length;
    for (const role of assigned) {
        const value = bitfield(role.permissions);
        if (value === undefined) complete = false;
        else bits |= value;
    }
    const definitions = Object.entries(table).filter(([name]) => /^[A-Z][A-Z_0-9]+$/.test(name))
        .map(([name, value]) => [name, bitfield(value)] as const).filter((entry): entry is readonly [string, bigint] => !!entry[1]);
    const owner = ownerId === userId;
    const adminBit = bitfield(table.ADMINISTRATOR);
    const administrator = owner || !!(adminBit && (bits & adminBit) === adminBit);
    const seen = new Set<bigint>();
    const permissions = definitions.filter(([, flag]) => {
        if (seen.has(flag) || (!administrator && (bits & flag) !== flag)) return false;
        seen.add(flag);
        return true;
    }).map(([name]) => name);
    return { roles: assigned, permissions, owner, administrator, complete: complete && definitions.length > 0 };
}
