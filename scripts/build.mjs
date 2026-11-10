import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import globals from "esbuild-plugin-globals";
import swc from "@swc/core";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
const metro = ["react", "react-native", "util", "moment", "chroma-js", "lodash", "react-native-webview"];
const output = "dist/moggcord-mobile.js";
await build({
  absWorkingDir: root, entryPoints: ["runtime/bootstrap.ts"], outfile: output,
  tsconfig: "runtime/tsconfig.json", bundle: true, format: "iife", target: "es2020",
  supported: { "const-and-let": false }, minify: true, charset: "ascii",
  loader: { ".png": "dataurl", ".html": "text" },
  define: { window: "globalThis", __DEV__: "false", __MOGGCORD_TEST__: "false",
    __BUILDS_BRANCH__: '"main"', MOGGCORD_MOBILE_VERSION: JSON.stringify(version) },
  inject: ["runtime/shims/asyncIteratorSymbol.js", "runtime/shims/promiseAllSettled.js"],
  alias: {
    "!bunny-deps-shim!": path.join(root, "runtime/shims/depsModule.ts"),
    spitroast: path.join(root, "node_modules/spitroast"),
    "react/jsx-runtime": path.join(root, "runtime/shims/jsxRuntime.ts")
  },
  logLimit: 8,
  plugins: [
    {
      name: "hermes-transforms",
      setup(builder) {
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: "file" }, async args => {
          const ts = /\.tsx?$/.test(args.path);
          const result = await swc.transformFile(args.path, {
            jsc: {
              parser: { syntax: ts ? "typescript" : "ecmascript", tsx: args.path.endsWith(".tsx") },
              externalHelpers: true,
              transform: { react: { runtime: "automatic" } }
            },
            env: {
              targets: "fully supports es6",
              include: ["transform-block-scoping", "transform-classes", "transform-async-to-generator", "transform-async-generator-functions"],
              exclude: ["transform-parameters", "transform-template-literals", "transform-exponentiation-operator",
                "transform-named-capturing-groups-regex", "transform-nullish-coalescing-operator", "transform-object-rest-spread",
                "transform-optional-chaining", "transform-logical-assignment-operators"]
            }
          });
          return { contents: result.code, loader: "js" };
        });
      }
    },
    globals(Object.fromEntries(metro.map(name => [name, 'require("!bunny-deps-shim!")[' + JSON.stringify(name) + "]"]))),
    {
      name: "moggcord-build-info",
      setup(builder) {
        builder.onResolve({ filter: /^bunny-build-info$/ }, () => ({ path: "info", namespace: "build-info" }));
        builder.onLoad({ filter: /.*/, namespace: "build-info" }, () => ({
          contents: "export var version=" + JSON.stringify(version) + ", hash=" + JSON.stringify(revision) + ', branch="moggcord";',
          loader: "js"
        }));
      }
    }
  ],
  banner: { js: "/* Moggcord Mobile. Framework and plugin notices are in runtime/LICENSE and NOTICE.md. */" }
});
const { size } = await stat(new URL("../" + output, import.meta.url));
if (!size || size > 8 * 1024 * 1024) throw new Error("Unexpected mobile bundle size");
console.log(output + " · " + size + " bytes");
