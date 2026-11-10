/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#include <atomic>
#include <memory>
#include <string>
#include <jsi/jsi.h>

#include "MobilePayload.h"

namespace {
using facebook::jsi::Runtime;
using InitializeRuntime = void (*)(id, SEL, id, Runtime &);
std::atomic<InitializeRuntime> original{nullptr};

void initializeRuntime(id host, SEL selector, id instance, Runtime &runtime) {
    original.load()(host, selector, instance, runtime);
    @try {
        try {
            std::string source(reinterpret_cast<const char *>(moggcord_payload), sizeof(moggcord_payload));
            runtime.evaluateJavaScript(std::make_shared<facebook::jsi::StringBuffer>(std::move(source)), "moggcord-mobile.js");
        } catch (const std::exception &error) {
            NSLog(@"[Moggcord Mobile] Payload could not start: %s", error.what());
        } catch (...) {
            NSLog(@"[Moggcord Mobile] Payload could not start.");
        }
    } @catch (NSException *error) {
        NSLog(@"[Moggcord Mobile] Payload could not start: %@", error.name);
    }
}

bool attach() {
    if (original.load() != nullptr) return true;
    Class host = objc_getClass("RCTHost");
    SEL selector = sel_registerName("instance:didInitializeRuntime:");
    Method method = host ? class_getInstanceMethod(host, selector) : nullptr;
    if (!method || method_getNumberOfArguments(method) != 4) return false;
    char returnType[2] = {};
    method_getReturnType(method, returnType, sizeof(returnType));
    if (returnType[0] != 'v') return false;
    original.store(reinterpret_cast<InitializeRuntime>(method_getImplementation(method)));
    method_setImplementation(method, reinterpret_cast<IMP>(initializeRuntime));
    return true;
}
}

__attribute__((constructor))
static void loadMoggcord() {
    @autoreleasepool {
        NSBundle *bundle = NSBundle.mainBundle;
        if (![bundle.bundlePath.pathExtension isEqualToString:@"app"] ||
                ![bundle.executablePath.lastPathComponent isEqualToString:@"Discord"]) return;
        if (!attach()) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (!attach()) NSLog(@"[Moggcord Mobile] This Discord build has no supported React Native host.");
            });
        }
    }
}
