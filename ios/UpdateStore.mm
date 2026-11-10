/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import "UpdateStore.h"
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>
#include "LoaderVersion.h"

namespace {
constexpr NSUInteger maxBundle = 8 * 1024 * 1024;
BOOL fail(NSError **error, NSString *message) {
    if (error) *error = [NSError errorWithDomain:@"cc.moggcord.mobile.update" code:1
        userInfo:@{NSLocalizedDescriptionKey: message}];
    return NO;
}
BOOL matches(id value, NSString *pattern) {
    return [value isKindOfClass:NSString.class] && [value length] < 256 &&
        [value rangeOfString:pattern options:NSRegularExpressionSearch].location != NSNotFound;
}
NSString *sha256(NSData *data) {
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *result = [NSMutableString stringWithCapacity:64];
    for (unsigned char byte : digest) [result appendFormat:@"%02x", byte];
    return result;
}
BOOL integer(id number, NSUInteger min, NSUInteger max) {
    return [number isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)number) != CFBooleanGetTypeID() &&
        [number doubleValue] >= min && [number doubleValue] <= max && [number doubleValue] == [number unsignedLongLongValue];
}
}

@interface MoggcordUpdateStore ()
@property(nonatomic) NSURL *directory;
@property(nonatomic) NSData *publicKey;
@property(nonatomic) NSString *hostBuild;
@property(nonatomic) NSString *embeddedVersion;
@property(nonatomic, readwrite) NSString *recoveryNotice;
@end

@implementation MoggcordUpdateStore
- (instancetype)initWithDirectory:(NSURL *)directory publicKey:(NSData *)key
    hostBuild:(NSString *)build embeddedVersion:(NSString *)version {
    if ((self = [super init])) {
        _directory = directory; _publicKey = key; _hostBuild = build; _embeddedVersion = version;
        _recoveryNotice = @"";
    }
    return self;
}
- (NSURL *)file:(NSString *)name { return [self.directory URLByAppendingPathComponent:name]; }
- (NSString *)read:(NSString *)name {
    NSData *data = [NSData dataWithContentsOfURL:[self file:name]];
    if (!data || data.length > 16384) return nil;
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}
- (BOOL)write:(NSString *)name data:(NSData *)data error:(NSError **)error {
    if (![NSFileManager.defaultManager createDirectoryAtURL:self.directory withIntermediateDirectories:YES attributes:nil error:error]) return NO;
    [self.directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
    return [data writeToURL:[self file:name] options:NSDataWritingAtomic error:error];
}
- (void)remove:(NSString *)name { [NSFileManager.defaultManager removeItemAtURL:[self file:name] error:nil]; }

- (NSDictionary *)verifyEnvelope:(NSString *)envelope error:(NSError **)error {
    NSData *data = [envelope dataUsingEncoding:NSUTF8StringEncoding];
    if (!data.length || data.length > 16384) { fail(error, @"The update manifest has an invalid size."); return nil; }
    id outer = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    if (![outer isKindOfClass:NSDictionary.class] || ![outer[@"payload"] isKindOfClass:NSString.class] ||
        ![outer[@"signature"] isKindOfClass:NSString.class]) { fail(error, @"The update manifest is invalid."); return nil; }
    NSData *payload = [[NSData alloc] initWithBase64EncodedString:outer[@"payload"] options:0];
    NSData *signature = [[NSData alloc] initWithBase64EncodedString:outer[@"signature"] options:0];
    if (!payload.length || payload.length > 8192 || !signature.length || signature.length > 256) {
        fail(error, @"The update signature is invalid."); return nil;
    }
    NSDictionary *attributes = @{(__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeyClass: (__bridge id)kSecAttrKeyClassPublic, (__bridge id)kSecAttrKeySizeInBits: @256};
    SecKeyRef key = SecKeyCreateWithData((__bridge CFDataRef)self.publicKey, (__bridge CFDictionaryRef)attributes, nullptr);
    BOOL valid = key && SecKeyVerifySignature(key, kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
        (__bridge CFDataRef)payload, (__bridge CFDataRef)signature, nullptr);
    if (key) CFRelease(key);
    if (!valid) { fail(error, @"This update could not be verified. Your current version is unchanged."); return nil; }
    id manifest = [NSJSONSerialization JSONObjectWithData:payload options:0 error:error];
    NSString *versionPattern = @"^(0|[1-9][0-9]{0,5})\\.(0|[1-9][0-9]{0,5})\\.(0|[1-9][0-9]{0,5})$";
    if (![manifest isKindOfClass:NSDictionary.class] || !integer(manifest[@"schema"], 1, 1) ||
        ![manifest[@"platform"] isEqual:@"ios"] || !matches(manifest[@"version"], versionPattern) ||
        !matches(manifest[@"sha256"], @"^[a-f0-9]{64}$") || !integer(manifest[@"bytes"], 1, maxBundle)) {
        fail(error, @"The verified update manifest is incompatible."); return nil;
    }
    if (!integer(manifest[@"minLoader"], 1, moggcord_loader_version)) {
        fail(error, @"This update needs a newer loader. Install the latest IPA once."); return nil;
    }
    if (![manifest[@"discordBuild"] isEqual:self.hostBuild]) {
        fail(error, @"This update targets a different Discord build. Install the latest compatible IPA."); return nil;
    }
    NSString *url = [NSString stringWithFormat:@"https://moggcord.cc/mobile/updates/ios/%@/moggcord-mobile.js", manifest[@"version"]];
    if (![manifest[@"bundle"] isEqual:url]) { fail(error, @"The update download address is invalid."); return nil; }
    return manifest;
}

- (NSDictionary *)readBundle:(NSString *)envelope {
    NSDictionary *manifest = [self verifyEnvelope:envelope error:nil];
    if (!manifest || [manifest[@"version"] compare:self.embeddedVersion options:NSNumericSearch] == NSOrderedAscending) return nil;
    NSURL *url = [self file:[NSString stringWithFormat:@"bundle-%@.js", manifest[@"sha256"]]];
    NSNumber *size = nil;
    if (![url getResourceValue:&size forKey:NSURLFileSizeKey error:nil] || size.unsignedLongLongValue != [manifest[@"bytes"] unsignedLongLongValue]) return nil;
    NSData *source = [NSData dataWithContentsOfURL:url];
    if (source.length != [manifest[@"bytes"] unsignedIntegerValue] || ![sha256(source) isEqual:manifest[@"sha256"]]) return nil;
    return @{@"source": source, @"version": manifest[@"version"], @"sha256": manifest[@"sha256"]};
}

- (BOOL)stageEnvelope:(NSString *)envelope source:(NSData *)source currentVersion:(NSString *)version error:(NSError **)error {
    @synchronized(self) {
        NSDictionary *manifest = [self verifyEnvelope:envelope error:error];
        if (!manifest) return NO;
        if ([manifest[@"version"] compare:version options:NSNumericSearch] != NSOrderedDescending ||
            [manifest[@"version"] compare:self.embeddedVersion options:NSNumericSearch] == NSOrderedAscending)
            return fail(error, @"Moggcord is already on this version or a newer one.");
        if (!source.length || source.length > maxBundle || source.length != [manifest[@"bytes"] unsignedIntegerValue] ||
            ![sha256(source) isEqual:manifest[@"sha256"]]) return fail(error, @"The downloaded update is incomplete or has changed. Try again.");
        NSString *name = [NSString stringWithFormat:@"bundle-%@.js", manifest[@"sha256"]];
        if (![self write:name data:source error:error] ||
            ![self write:@"pending.json" data:[envelope dataUsingEncoding:NSUTF8StringEncoding] error:error]) return NO;
        [self remove:@"attempt.txt"];
        return YES;
    }
}

- (NSDictionary *)selectBundle {
    @synchronized(self) {
        NSString *pending = [self read:@"pending.json"];
        if (pending) {
            NSDictionary *candidate = [self readBundle:pending];
            NSString *hash = candidate[@"sha256"];
            if (candidate && ![[self read:@"attempt.txt"] isEqual:hash] &&
                [self write:@"attempt.txt" data:[hash dataUsingEncoding:NSUTF8StringEncoding] error:nil]) return candidate;
            self.recoveryNotice = @"A previous update did not finish starting. Moggcord restored the last working version.";
            [self remove:@"pending.json"]; [self remove:@"attempt.txt"];
        }
        NSString *saved = [self read:@"installed.json"];
        NSDictionary *installed = [self readBundle:saved];
        if (saved && !installed && !self.recoveryNotice.length)
            self.recoveryNotice = @"The stored update is incompatible or could not be verified. Moggcord is using its built-in version.";
        return installed;
    }
}

- (BOOL)confirmHash:(NSString *)hash version:(NSString *)version error:(NSError **)error {
    @synchronized(self) {
        if (!hash.length) return YES;
        NSString *pending = [self read:@"pending.json"];
        NSDictionary *candidate = [self readBundle:pending];
        if (!candidate) return YES;
        if (![candidate[@"sha256"] isEqual:hash] || ![candidate[@"version"] isEqual:version])
            return fail(error, @"The running update did not match the pending update.");
        if (![self write:@"installed.json" data:[pending dataUsingEncoding:NSUTF8StringEncoding] error:error]) return NO;
        [self remove:@"pending.json"]; [self remove:@"attempt.txt"];
        // Keep only the confirmed payload. The embedded payload remains the fallback.
        NSString *keep = [NSString stringWithFormat:@"bundle-%@.js", hash];
        for (NSURL *url in [NSFileManager.defaultManager contentsOfDirectoryAtURL:self.directory includingPropertiesForKeys:nil options:0 error:nil]) {
            NSString *name = url.lastPathComponent;
            if ([name hasPrefix:@"bundle-"] && [name hasSuffix:@".js"] && ![name isEqual:keep])
                [NSFileManager.defaultManager removeItemAtURL:url error:nil];
        }
        return YES;
    }
}
@end
