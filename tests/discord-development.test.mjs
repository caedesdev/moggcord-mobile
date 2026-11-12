import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const filename = "moggcord-android-launcher.png";
const script = fileURLToPath(new URL("../.github/scripts/discord-development.mjs", import.meta.url));
const revision = "a".repeat(40);
const previous = "b".repeat(40);
const id = "123456789012345678";
const repository = "https://github.com/caedesdev/moggcord-mobile";
const changes = repository + "/compare/" + previous + "..." + revision;
const attachmentId = "123456789012345679";
const image = { url: "attachment://" + filename };
const oldMessage = {
    id,
    embeds: [{ title: "Moggcord Mobile updated", url: changes, description: "Update", image }],
    attachments: [{ id: attachmentId, filename }],
};
const mockFetch = "data:text/javascript," + encodeURIComponent(String.raw`
    import assert from "node:assert/strict";
    const { mode, filename, oldMessage } = JSON.parse(process.env.DISCORD_TEST);
    globalThis.fetch = async (url, { method, body }) => {
        assert.ok(url.startsWith("https://discord.com/api/webhooks/1234/test-webhook"));
        if (method === "GET") {
            assert.equal(mode, "edit");
            return Response.json(oldMessage);
        }
        if (method === "PATCH") {
            assert.equal(mode, "edit");
            const payload = JSON.parse(body);
            assert.deepEqual(payload.attachments, oldMessage.attachments);
            assert.deepEqual(payload.embeds[0].image, oldMessage.embeds[0].image);
            assert.match(payload.embeds[0].fields[0].value, /Android APK/);
            return Response.json({ id: oldMessage.id, ...payload });
        }
        assert.equal(method, "POST");
        if (mode === "preview") {
            assert.ok(body instanceof FormData);
            const payload = JSON.parse(body.get("payload_json"));
            assert.equal(payload.embeds[0].image.url, "attachment://" + filename);
            assert.equal(payload.attachments[0].filename, filename);
            assert.equal(body.get("files[0]").name, filename);
            assert.equal(body.get("files[0]").type, "image/png");
            assert.equal(body.get("files[0]").size, 9);
            return Response.json(oldMessage);
        }
        const payload = JSON.parse(body);
        assert.equal(payload.embeds[0].image, undefined);
        return Response.json({ id: oldMessage.id, ...payload });
    };
`);

function run(t, mode) {
    const folder = mkdtempSync(join(tmpdir(), "moggcord-discord-preview-"));
    const releaseFolder = join(folder, "discord-release");
    const event = join(folder, "event.json");
    const message = join(folder, "discord-message.json");
    const screenshot = join(folder, filename);
    const release = join(folder, "discord-release.json");
    const reference = join(releaseFolder, "discord-message.json");
    t.after(() => {
        for (const path of [reference, event, message, screenshot, release]) rmSync(path, { force: true });
        if (mode === "edit") rmdirSync(releaseFolder);
        rmdirSync(folder);
    });

    writeFileSync(event, JSON.stringify({ before: previous, after: revision, head_commit: { message: "Launcher update" } }));
    if (mode === "preview") writeFileSync(screenshot, Buffer.from("89504e470d0a1a0a00", "hex"));
    if (mode === "edit") {
        mkdirSync(releaseFolder);
        writeFileSync(reference, JSON.stringify({ id, before: previous, sha: revision }));
        writeFileSync(release, JSON.stringify({
            version: "0.4.14", sha: revision, downloads: [{ label: "Android APK", url: repository + "/releases" }],
        }));
    }
    const result = spawnSync(process.execPath, ["--import", mockFetch, script, mode === "edit" ? "edit" : "post"], {
        encoding: "utf8",
        timeout: 10_000,
        env: {
            ...process.env,
            GITHUB_EVENT_PATH: event,
            GITHUB_REPOSITORY: "caedesdev/moggcord-mobile",
            GITHUB_SERVER_URL: "https://github.com",
            GITHUB_SHA: revision,
            RUNNER_TEMP: folder,
            DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1234/test-webhook",
            DISCORD_TEST: JSON.stringify({ mode, filename, oldMessage }),
        },
    });
    assert.equal(result.status, 0, result.stderr);
    if (mode !== "edit") assert.equal(JSON.parse(readFileSync(message, "utf8")).id, id);
    return result.stdout;
}

test("the Android screenshot is uploaded in the original development embed", t => {
    assert.match(run(t, "preview"), /with the Android screenshot/);
});

test("development updates still post when no screenshot was produced", t => {
    assert.match(run(t, "text"), /one development update/);
});

test("adding release links keeps the original screenshot attachment", t => {
    assert.match(run(t, "edit"), /Updated the existing Discord announcement/);
});
