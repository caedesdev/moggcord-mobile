/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import <Foundation/Foundation.h>

/** The suffix is internal metadata produced by the PlatformIndicators plugin. */
static inline NSArray<NSString *> *MoggcordPlatformTokens(NSString *text, NSRange *suffix) {
    if (![text isKindOfClass:NSString.class] || text.length > 512 || ![text hasSuffix:@"\u2063"]) return nil;
    NSString *prefix = @"\u2063mcpi|";
    NSRange start = [text rangeOfString:prefix options:NSBackwardsSearch];
    if (start.location == NSNotFound) return nil;
    NSUInteger offset = NSMaxRange(start);
    NSUInteger length = text.length - offset - 1;
    if (!length || length > 10 || length % 2) return nil;
    NSMutableArray<NSString *> *tokens = [NSMutableArray array];
    NSMutableSet<NSString *> *devices = [NSMutableSet set];
    for (NSUInteger index = 0; index < length; index += 2) {
        NSString *device = [text substringWithRange:NSMakeRange(offset + index, 1)];
        unichar status = [text characterAtIndex:offset + index + 1];
        if ([@"dwmcv" rangeOfString:device].location == NSNotFound || status < '0' || status > '3' ||
            [devices containsObject:device]) return nil;
        [devices addObject:device];
        [tokens addObject:[text substringWithRange:NSMakeRange(offset + index, 2)]];
    }
    if (suffix) *suffix = NSMakeRange(start.location, text.length - start.location);
    return tokens;
}
