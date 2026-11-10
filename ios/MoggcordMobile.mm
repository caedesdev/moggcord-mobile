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
#import "UpdateStore.h"
#include "UpdatePublicKey.h"

namespace {
using facebook::jsi::Runtime;
using InitializeRuntime = void (*)(id, SEL, id, Runtime &);
std::atomic<InitializeRuntime> original{nullptr};

facebook::jsi::String jsString(Runtime &runtime, NSString *value) {
    return facebook::jsi::String::createFromUtf8(runtime, value.UTF8String ?: "");
}

NSString *stringArgument(Runtime &runtime, const facebook::jsi::Value *args, size_t count, size_t index, size_t maxBytes) {
    if (count <= index || !args[index].isString()) throw facebook::jsi::JSError(runtime, "The update argument must be text.");
    std::string value = args[index].getString(runtime).utf8(runtime);
    if (value.size() > maxBytes) throw facebook::jsi::JSError(runtime, "The update is too large.");
    NSString *result = [[NSString alloc] initWithBytes:value.data() length:value.size() encoding:NSUTF8StringEncoding];
    if (!result) throw facebook::jsi::JSError(runtime, "The update is not valid UTF-8 text.");
    return result;
}

void installUpdater(Runtime &runtime, MoggcordUpdateStore *store, NSDictionary *selected) {
    using facebook::jsi::Object;
    using facebook::jsi::Function;
    using facebook::jsi::PropNameID;
    using facebook::jsi::Value;
    NSString *version = selected[@"version"] ?: @(moggcord_embedded_version);
    NSString *hash = selected[@"sha256"];
    Object bridge(runtime);
    bridge.setProperty(runtime, "apiVersion", 1);
    bridge.setProperty(runtime, "platform", "ios");
    bridge.setProperty(runtime, "runningVersion", jsString(runtime, version));
    bridge.setProperty(runtime, "recoveryNotice", jsString(runtime, store.recoveryNotice));
    bridge.setProperty(runtime, "verify", Function::createFromHostFunction(runtime, PropNameID::forAscii(runtime, "verify"), 1,
        [store](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
            NSString *envelope = stringArgument(rt, args, count, 0, 16384);
            NSError *error = nil;
            NSDictionary *manifest = [store verifyEnvelope:envelope error:&error];
            if (!manifest) throw facebook::jsi::JSError(rt, error.localizedDescription.UTF8String ?: "Update verification failed.");
            NSData *data = [NSJSONSerialization dataWithJSONObject:manifest options:0 error:nil];
            return jsString(rt, [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
        }));
    bridge.setProperty(runtime, "stage", Function::createFromHostFunction(runtime, PropNameID::forAscii(runtime, "stage"), 2,
        [store, version](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
            NSString *envelope = stringArgument(rt, args, count, 0, 16384);
            NSString *source = stringArgument(rt, args, count, 1, 8 * 1024 * 1024);
            NSError *error = nil;
            if (![store stageEnvelope:envelope source:[source dataUsingEncoding:NSUTF8StringEncoding] currentVersion:version error:&error])
                throw facebook::jsi::JSError(rt, error.localizedDescription.UTF8String ?: "The update could not be saved.");
            return Value(true);
        }));
    bridge.setProperty(runtime, "confirm", Function::createFromHostFunction(runtime, PropNameID::forAscii(runtime, "confirm"), 1,
        [store, version, hash](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
            NSString *loaded = stringArgument(rt, args, count, 0, 32);
            NSError *error = nil;
            if (![loaded isEqual:version] || ![store confirmHash:hash version:loaded error:&error])
                throw facebook::jsi::JSError(rt, "The running update could not be confirmed.");
            return Value(true);
        }));
    runtime.global().setProperty(runtime, "__MOGGCORD_UPDATER__", std::move(bridge));
}

void initializeRuntime(id host, SEL selector, id instance, Runtime &runtime) {
    original.load()(host, selector, instance, runtime);
    @try {
        try {
            static MoggcordUpdateStore *store;
            static dispatch_once_t once;
            dispatch_once(&once, ^{
                NSURL *directory = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject
                    URLByAppendingPathComponent:@"MoggcordMobile/Updates" isDirectory:YES];
                NSData *key = [[NSData alloc] initWithBase64EncodedString:@(moggcord_update_key) options:0];
                store = [[MoggcordUpdateStore alloc] initWithDirectory:directory publicKey:key
                    hostBuild:[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleVersion"] embeddedVersion:@(moggcord_embedded_version)];
            });
            NSDictionary *selected = [store selectBundle];
            installUpdater(runtime, store, selected);
            NSData *updated = selected[@"source"];
            std::string source = updated ? std::string(reinterpret_cast<const char *>(updated.bytes), updated.length)
                : std::string(reinterpret_cast<const char *>(moggcord_payload), sizeof(moggcord_payload));
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
