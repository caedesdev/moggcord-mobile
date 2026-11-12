import type { Metro } from "@metro/types";
import { version } from "bunny-build-info";
const { instead } = require("spitroast");
const startupWaitMs = 10_000;

// @ts-ignore - window is defined later in the bundle, so we assign it early
globalThis.window = globalThis;

// When the bundle started running, for StartupTimings
(globalThis as any).__MOGGCORD_TIMINGS__ ??= { loaded: Date.now(), plugins: {} };

async function initializeRevenge(canContinue = () => true) {
    try {
        // Make 'freeze' and 'seal' do nothing
        // The pinned mobile hooks need to replace Discord component exports.
        Object.freeze = Object.seal = Object;

        const { step } = require("@core/timings");
        await step("metroCache", () => require("@metro/internals/caches").initMetroCache());
        if (!canContinue()) return;
        if ((globalThis as any).__vendetta_loader?.name === "Moggcord Mobile") {
            await step("themeRecovery", () => require("@lib/addons/themes/colors/recovery").recoverDiscordTheme());
        }
        if (!canContinue()) return;
        const main = step("modules", () => require("."));
        await step("init", () => main.default());
    } catch (e) {
        console.warn(`[Moggcord] Version ${version} could not initialize.`, e);
    }
}

if (typeof window.__r === "undefined") {
    // Used for storing the current require function for the global.__r getter defined below
    var _requireFunc: any;
    let deferNativeCalls = true;

    // Calls from the native side are deferred until the index.ts(x) is loaded
    // Revenge delays the execution of index.ts(x) because Revenge's initialization is asynchronous
    interface DeferredQueue {
        object: any;
        method: string;
        resume?: (queue: DeferredQueue) => void;
        args: any[];
    }

    const deferredCalls: Array<DeferredQueue> = [];
    const unpatches: Array<() => void> = [];

    const deferMethodExecution = (
        object: any,
        method: string,
        condition?: (...args: any[]) => boolean,
        resume?: (queue: DeferredQueue) => void,
        returnWith?: (queue: DeferredQueue) => any
    ) => {
        if (typeof object[method] !== "function") return;
        const restore = instead(method, object, function (this: any, args: any[], original: any) {
            if (deferNativeCalls && (!condition || condition(...args))) {
                const queue: DeferredQueue = { object, method, args, resume };
                deferredCalls.push(queue);
                return returnWith ? returnWith(queue) : undefined;
            }

            // If the condition is not met, we execute the original method immediately
            return original.apply(this, args);
        });

        unpatches.push(restore);
    };

    const resumeDeferred = () => {
        for (const queue of deferredCalls.splice(0)) {
            const { object, method, args, resume } = queue;

            try {
                if (resume) {
                    resume(queue);
                } else {
                    object[method](...args);
                }
            } catch (error) {
                console.warn("[Moggcord] Could not replay a native startup call.", error);
            }
        }
    };

    const onceIndexRequired = async (originalRequire: Metro.RequireFn) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let canInitialize = true;
        try {
            if (typeof setTimeout !== "function" || typeof clearTimeout !== "function") {
                console.warn("[Moggcord] Startup timers are unavailable. Continuing Discord startup.");
                return;
            }
            // We hold calls from the native side
            if (window.__fbBatchedBridge) {
                const batchedBridge = window.__fbBatchedBridge;
                deferMethodExecution(
                    batchedBridge,
                    "callFunctionReturnFlushedQueue",
                    // If the call is to AppRegistry, we want to defer it because it is not yet registered (Revenge delays it)
                    // Same goes to the non-callable modules, which are not registered yet, so we ensure that only registered ones can get through
                    (...args) => args[0] === "AppRegistry" || !batchedBridge.getCallableModule(args[0]),
                    ({ args }) => {
                        if (batchedBridge.getCallableModule(args[0])) {
                            batchedBridge.__callFunction(...args);
                        }
                    },
                    () => batchedBridge.flushedQueue()
                );
            }

            // Introduced since RN New Architecture
            if (window.RN$AppRegistry) {
                deferMethodExecution(window.RN$AppRegistry, "runApplication");
            }

            const deadline = new Promise<void>(resolve => {
                timer = setTimeout(() => {
                    canInitialize = false;
                    resolve();
                    console.warn("[Moggcord] Initialization timed out. Continuing Discord startup.");
                }, startupWaitMs);
            });
            await Promise.race([initializeRevenge(() => canInitialize), deadline]);
        } catch (error) {
            console.warn("[Moggcord] Could not prepare the runtime for startup.", error);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
            deferNativeCalls = false;
            for (const unpatch of unpatches.splice(0)) {
                try { unpatch(); }
                catch (error) { console.warn("[Moggcord] Could not restore a startup hook.", error); }
            }
            originalRequire(0);
            resumeDeferred();
        }
    };

    Object.defineProperties(globalThis, {
        __r: {
            configurable: true,
            get: () => _requireFunc,
            set(v) {
                // _requireFunc is required here, because using 'this' here errors for some unknown reason
                _requireFunc = function patchedRequire(a: number) {
                    // Initializing index.ts(x)
                    if (a === 0) {
                        if (window.modules instanceof Map) window.modules = Object.fromEntries(window.modules);
                        _requireFunc = v;
                        void onceIndexRequired(v).catch(error => console.error("[Moggcord] Discord startup failed.", error));
                    } else return v(a);
                };
            }
        },
        __d: {
            configurable: true,
            get() {
                // @ts-ignore - I got an error where 'Object' is undefined *sometimes*, which is literally never supposed to happen
                if (window.Object && !window.modules) {
                    window.modules = window.__c?.();
                }
                return this.value;
            },
            set(v) { this.value = v; }
        }
    });
} else {
    // It is too late to late to hook __r, so we just initialize Revenge here
    // Likely because of using the legacy loader (from Vendetta)
    initializeRevenge();
}
