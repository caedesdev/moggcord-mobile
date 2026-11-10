const settingKey = "MOGGCORD_MOBILE";
const title = "Moggcord Mobile";
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function createSettingsAdapter(createPage, report, onNative = () => {}) {
  let react;
  let native;
  let page;
  let hasRenderer = false;
  const decorated = new WeakSet();

  function renderConfig(original) {
    let previous;
    let next;
    return () => {
      const config = original.SETTING_RENDERER_CONFIG;
      if (!config || typeof config !== "object") return config;
      if (config !== previous) {
        next = { ...config, [settingKey]: {
          type: "route",
          title: () => title,
          useTitle: () => title,
          screen: {
            route: settingKey,
            getComponent() {
              if (react && native) page ??= createPage(react, native);
              return page ?? (() => null);
            }
          }
        } };
        previous = config;
      }
      return next;
    };
  }

  function addSection(config) {
    if (!react || !native || !hasRenderer || !Array.isArray(config?.sections)) return config;
    const sections = config.sections;
    if (sections.some(section => section?.settings?.includes?.(settingKey))) return config;
    const account = sections.findIndex(section => section?.settings?.includes?.("ACCOUNT"));
    if (account === -1) return config;
    const section = { label: "Moggcord", title: "Moggcord", settings: [settingKey] };
    return { ...config, sections: [...sections.slice(0, account + 1), section, ...sections.slice(account + 1)] };
  }

  return function observe(module) {
    const exported = module?.exports;
    if (!exported || typeof exported !== "object" || decorated.has(exported)) return;
    if (!react && typeof exported.createElement === "function" && typeof exported.useState === "function") react = exported;
    if (!native && owns(exported, "AppRegistry") && owns(exported, "View") && owns(exported, "Text")) {
      native = exported;
      onNative(native);
    }
    if (!owns(exported, "SETTING_RENDERER_CONFIG") && !owns(exported, "createList")) return;
    const descriptors = Object.getOwnPropertyDescriptors(exported);
    if (descriptors.SETTING_RENDERER_CONFIG) {
      descriptors.SETTING_RENDERER_CONFIG = {
        enumerable: descriptors.SETTING_RENDERER_CONFIG.enumerable,
        configurable: true,
        get: renderConfig(exported)
      };
      hasRenderer = true;
    }
    if (descriptors.createList && typeof exported.createList === "function") {
      const createList = exported.createList;
      descriptors.createList = {
        enumerable: descriptors.createList.enumerable,
        configurable: true,
        value: function (config, ...args) {
          let decoratedConfig = config;
          try { decoratedConfig = addSection(config); }
          catch (error) { report(error); }
          return Reflect.apply(createList, this, [decoratedConfig, ...args]);
        }
      };
    }
    const replacement = Object.create(Object.getPrototypeOf(exported), descriptors);
    decorated.add(replacement);
    module.exports = replacement;
  };
}

export function observeMetro(scope, observe, report) {
  const descriptor = Object.getOwnPropertyDescriptor(scope, "__d");
  if (descriptor && !descriptor.configurable) return false;
  const patched = new WeakMap();
  function wrap(define) {
    if (typeof define !== "function") return define;
    if (patched.has(define)) return patched.get(define);
    const wrapped = function (factory, ...rest) {
      if (typeof factory !== "function") return Reflect.apply(define, this, [factory, ...rest]);
      const observedFactory = function (...args) {
        const result = Reflect.apply(factory, this, args);
        try { observe(args[4]); }
        catch (error) { report(error); }
        return result;
      };
      return Reflect.apply(define, this, [observedFactory, ...rest]);
    };
    patched.set(define, wrapped);
    patched.set(wrapped, wrapped);
    return wrapped;
  }
  let define = wrap(scope.__d);
  Object.defineProperty(scope, "__d", {
    configurable: true,
    enumerable: descriptor?.enumerable ?? false,
    get: () => define,
    set(value) { define = wrap(value); }
  });
  return true;
}
