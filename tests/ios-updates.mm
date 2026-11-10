/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import "../ios/UpdateStore.h"
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>

static void check(BOOL ok, const char *message) { if (!ok) { fprintf(stderr, "%s\n", message); exit(1); } }
static NSString *digest(NSData *data) {
    unsigned char bytes[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(data.bytes, (CC_LONG)data.length, bytes);
    NSMutableString *hex = [NSMutableString new]; for (unsigned char byte : bytes) [hex appendFormat:@"%02x", byte]; return hex;
}
static NSString *envelope(SecKeyRef key, NSData *source, NSString *version, NSDictionary *extra) {
    NSMutableDictionary *manifest = [@{@"schema": @1, @"platform": @"ios", @"version": version,
        @"minLoader": @1, @"discordBuild": @"110861", @"sha256": digest(source), @"bytes": @(source.length),
        @"bundle": [NSString stringWithFormat:@"https://moggcord.cc/mobile/updates/ios/%@/moggcord-mobile.js", version]} mutableCopy];
    [manifest addEntriesFromDictionary:extra ?: @{}];
    NSData *payload = [NSJSONSerialization dataWithJSONObject:manifest options:NSJSONWritingSortedKeys error:nil];
    NSData *signature = CFBridgingRelease(SecKeyCreateSignature(key, kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
        (__bridge CFDataRef)payload, nullptr));
    check(signature != nil, "Could not sign the test fixture");
    NSData *outer = [NSJSONSerialization dataWithJSONObject:@{@"payload": [payload base64EncodedStringWithOptions:0],
        @"signature": [signature base64EncodedStringWithOptions:0]} options:0 error:nil];
    return [[NSString alloc] initWithData:outer encoding:NSUTF8StringEncoding];
}

int main() { @autoreleasepool {
    NSDictionary *attributes = @{(__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256};
    SecKeyRef privateKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, nullptr);
    check(privateKey != nullptr, "Could not create the test signing key");
    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    NSData *publicBytes = CFBridgingRelease(SecKeyCopyExternalRepresentation(publicKey, nullptr));
    CFRelease(publicKey);
    NSURL *directory = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:
        [@"moggcord-updater-test-" stringByAppendingString:NSUUID.UUID.UUIDString]] isDirectory:YES];
    MoggcordUpdateStore *(^newStore)(void) = ^{
        return [[MoggcordUpdateStore alloc] initWithDirectory:directory publicKey:publicBytes hostBuild:@"110861" embeddedVersion:@"1.0.0"];
    };
    MoggcordUpdateStore *store = newStore();
    check([store selectBundle] == nil, "A clean install should use the embedded payload");
    NSData *first = [@"/* Verified fixture 1 */" dataUsingEncoding:NSUTF8StringEncoding];
    NSString *signedFirst = envelope(privateKey, first, @"1.1.0", nil);
    check([[store verifyEnvelope:signedFirst error:nil][@"version"] isEqual:@"1.1.0"], "A valid update was rejected");
    check([store verifyEnvelope:@"{\"payload\":\"e30=\",\"signature\":\"AA==\"}" error:nil] == nil, "An invalid signature was accepted");
    check([store verifyEnvelope:envelope(privateKey, first, @"1.1.0", @{@"minLoader": @2}) error:nil] != nil, "The current loader version was rejected");
    check([store verifyEnvelope:envelope(privateKey, first, @"1.1.0", @{@"minLoader": @3}) error:nil] == nil, "A newer loader requirement was ignored");
    check([store verifyEnvelope:envelope(privateKey, first, @"1.1.0", @{@"discordBuild": @"other"}) error:nil] == nil, "A different Discord build was accepted");
    check([store verifyEnvelope:envelope(privateKey, first, @"1.1.0", @{@"bundle": @"https://example.com/code.js"}) error:nil] == nil, "An unapproved origin was accepted");
    check([store verifyEnvelope:envelope(privateKey, first, @"1.1.0", @{@"bytes": @YES}) error:nil] == nil, "A boolean byte count was accepted");
    check(![store stageEnvelope:signedFirst source:[NSData data] currentVersion:@"1.0.0" error:nil], "An incomplete payload was accepted");
    check([store stageEnvelope:signedFirst source:first currentVersion:@"1.0.0" error:nil], "Could not stage the fixture");
    NSDictionary *candidate = [store selectBundle];
    check([candidate[@"source"] isEqual:first], "The candidate payload differs");
    MoggcordUpdateStore *afterCrash = newStore();
    check([afterCrash selectBundle] == nil && afterCrash.recoveryNotice.length, "An unconfirmed startup did not roll back");
    check([store stageEnvelope:signedFirst source:first currentVersion:@"1.0.0" error:nil], "Could not retry the fixture");
    candidate = [store selectBundle];
    check([store confirmHash:candidate[@"sha256"] version:@"1.1.0" error:nil], "Could not confirm a successful startup");
    check([newStore() selectBundle] != nil, "The confirmed update did not persist");
    check(![store stageEnvelope:signedFirst source:first currentVersion:@"1.1.0" error:nil], "The current version was reinstalled");
    NSData *second = [@"/* Verified fixture 2 */" dataUsingEncoding:NSUTF8StringEncoding];
    NSString *signedSecond = envelope(privateKey, second, @"1.2.0", nil);
    check(![store stageEnvelope:signedSecond source:first currentVersion:@"1.1.0" error:nil], "A payload hash mismatch was accepted");
    check([store stageEnvelope:signedSecond source:second currentVersion:@"1.1.0" error:nil], "Could not stage a second update");
    check([[store selectBundle][@"version"] isEqual:@"1.2.0"], "The second candidate did not load");
    check([[newStore() selectBundle][@"version"] isEqual:@"1.1.0"], "A failed candidate did not restore the last confirmed payload");
    NSURL *cache = [directory URLByAppendingPathComponent:[NSString stringWithFormat:@"bundle-%@.js", digest(first)]];
    [second writeToURL:cache atomically:YES];
    check([newStore() selectBundle] == nil, "A modified cached payload was executed");
    check([directory.path hasPrefix:NSTemporaryDirectory()] && [directory.lastPathComponent hasPrefix:@"moggcord-updater-test-"], "Unexpected test cleanup path");
    [NSFileManager.defaultManager removeItemAtURL:directory error:nil];
    CFRelease(privateKey);
    puts("iOS update signatures, payload integrity, compatibility, atomic staging and startup rollback passed.");
    return 0;
} }
