import { mkdir, readFile, writeFile } from "node:fs/promises";
const bundle = await readFile(new URL("../dist/moggcord-mobile.js", import.meta.url));
if (!bundle.length || bundle.length > 8 * 1024 * 1024) throw new Error("Unexpected mobile bundle size");
const output = new URL("../dist/ios/generated/", import.meta.url);
await mkdir(output, { recursive: true });
const lines = [];
for (let offset = 0; offset < bundle.length; offset += 24) {
  lines.push("  " + [...bundle.subarray(offset, offset + 24)].map(value => "0x" + value.toString(16).padStart(2, "0")).join(", "));
}
await writeFile(new URL("MobilePayload.h", output), "static constexpr unsigned char moggcord_payload[] = {\n" + lines.join(",\n") + "\n};\n");
