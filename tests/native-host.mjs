import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";

export async function nativeModule(entryPoint, modules, globals = {}) {
  const output = await build({ entryPoints: [entryPoint], bundle: true, write: false,
    platform: "node", format: "cjs", logLevel: "silent", plugins: [{ name: "native-test-host", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.kind === "entry-point" ? undefined : { path: args.path, external: true });
    } }] });
  const context = vm.createContext({ module: { exports: {} }, exports: {}, console,
    require(name) { assert(Object.hasOwn(modules, name), "Unexpected native dependency " + name); return modules[name]; },
    setTimeout(callback) { callback(); }, ...globals });
  vm.runInContext(output.outputFiles[0].text, context);
  return context.module.exports;
}
