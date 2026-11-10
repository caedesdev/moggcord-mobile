/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import <Foundation/Foundation.h>

@interface MoggcordUpdateStore : NSObject
@property(nonatomic, readonly) NSString *recoveryNotice;
- (instancetype)initWithDirectory:(NSURL *)directory publicKey:(NSData *)key
    hostBuild:(NSString *)build embeddedVersion:(NSString *)version;
- (NSDictionary *)verifyEnvelope:(NSString *)envelope error:(NSError **)error;
- (BOOL)stageEnvelope:(NSString *)envelope source:(NSData *)source currentVersion:(NSString *)version error:(NSError **)error;
/** Marks a pending candidate as attempted before returning it. An unconfirmed attempt rolls back on the next load. */
- (NSDictionary *)selectBundle;
- (BOOL)confirmHash:(NSString *)hash version:(NSString *)version error:(NSError **)error;
@end
