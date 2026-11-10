import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const output = "dist/moggcord-mobile.js";
await build({
  absWorkingDir: root,
  entryPoints: ["shared/index.js"],
  outfile: output,
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: true,
  charset: "ascii",
  loader: { ".png": "dataurl" },
  define: { MOGGCORD_MOBILE_VERSION: JSON.stringify(version) },
  banner: { js: "/* Moggcord Mobile · SPDX-License-Identifier: GPL-3.0-or-later */" }
});
const { size } = await stat(new URL("../" + output, import.meta.url));
if (!size || size > 1024 * 1024) throw new Error("Unexpected mobile bundle size");
console.log(`${output} · ${size} bytes`);
