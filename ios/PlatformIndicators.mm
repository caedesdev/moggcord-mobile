/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import "PlatformIndicators.h"
#import "PlatformIndicatorTokens.h"
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

namespace {
using TextSetter = void (*)(UILabel *, SEL, NSString *);
using AttributedSetter = void (*)(UILabel *, SEL, NSAttributedString *);
TextSetter originalText = nullptr;
AttributedSetter originalAttributed = nullptr;
thread_local bool rendering = false;

UIImage *deviceImage(NSString *token) {
    static NSCache<NSString *, UIImage *> *images;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ images = [NSCache new]; images.countLimit = 20; });
    UIImage *cached = [images objectForKey:token];
    if (cached) return cached;
    const unsigned colors[] = {0x23a55a, 0xf0b232, 0xf23f43, 0x80848e};
    unsigned hex = colors[[token characterAtIndex:1] - '0'];
    UIColor *color = [UIColor colorWithRed:((hex >> 16) & 255) / 255.0
        green:((hex >> 8) & 255) / 255.0 blue:(hex & 255) / 255.0 alpha:1];
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(24, 24)];
    UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        (void)context;
        [color setStroke];
        [color setFill];
        UIBezierPath *path = [UIBezierPath bezierPath];
        path.lineWidth = 1.8;
        path.lineCapStyle = kCGLineCapRound;
        path.lineJoinStyle = kCGLineJoinRound;
        switch ([token characterAtIndex:0]) {
            case 'd': {
                [path appendPath:[UIBezierPath bezierPathWithRoundedRect:CGRectMake(2, 3, 20, 13) cornerRadius:1.2]];
                [path moveToPoint:CGPointMake(12, 16)]; [path addLineToPoint:CGPointMake(12, 21)];
                [path moveToPoint:CGPointMake(7, 21)]; [path addLineToPoint:CGPointMake(17, 21)];
                break;
            }
            case 'm': {
                [path appendPath:[UIBezierPath bezierPathWithRoundedRect:CGRectMake(6, 2, 12, 20) cornerRadius:1.6]];
                [path moveToPoint:CGPointMake(6, 17)]; [path addLineToPoint:CGPointMake(18, 17)];
                [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(11.2, 19, 1.6, 1.6)] fill];
                break;
            }
            case 'w': {
                [path appendPath:[UIBezierPath bezierPathWithOvalInRect:CGRectMake(2, 2, 20, 20)]];
                [path appendPath:[UIBezierPath bezierPathWithOvalInRect:CGRectMake(7, 2, 10, 20)]];
                [path moveToPoint:CGPointMake(2, 12)]; [path addLineToPoint:CGPointMake(22, 12)];
                break;
            }
            case 'c': {
                [path moveToPoint:CGPointMake(7, 6)]; [path addLineToPoint:CGPointMake(17, 6)];
                [path addCurveToPoint:CGPointMake(21, 10) controlPoint1:CGPointMake(20, 6) controlPoint2:CGPointMake(21, 8)];
                [path addLineToPoint:CGPointMake(22, 18)];
                [path addQuadCurveToPoint:CGPointMake(19, 20) controlPoint:CGPointMake(22, 21)];
                [path addLineToPoint:CGPointMake(15, 16)]; [path addLineToPoint:CGPointMake(9, 16)];
                [path addLineToPoint:CGPointMake(5, 20)];
                [path addQuadCurveToPoint:CGPointMake(2, 18) controlPoint:CGPointMake(2, 21)];
                [path addLineToPoint:CGPointMake(3, 10)];
                [path addCurveToPoint:CGPointMake(7, 6) controlPoint1:CGPointMake(3, 8) controlPoint2:CGPointMake(4, 6)];
                [path closePath];
                [path moveToPoint:CGPointMake(7, 10)]; [path addLineToPoint:CGPointMake(7, 14)];
                [path moveToPoint:CGPointMake(5, 12)]; [path addLineToPoint:CGPointMake(9, 12)];
                [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(16, 10, 1.8, 1.8)] fill];
                [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(18, 12, 1.8, 1.8)] fill];
                break;
            }
            case 'v': {
                [path moveToPoint:CGPointMake(6, 5)]; [path addLineToPoint:CGPointMake(18, 5)];
                [path addQuadCurveToPoint:CGPointMake(22, 9) controlPoint:CGPointMake(22, 5)];
                [path addLineToPoint:CGPointMake(22, 16)];
                [path addQuadCurveToPoint:CGPointMake(17, 19) controlPoint:CGPointMake(22, 20)];
                [path addLineToPoint:CGPointMake(13, 16)]; [path addLineToPoint:CGPointMake(11, 16)];
                [path addLineToPoint:CGPointMake(7, 19)];
                [path addQuadCurveToPoint:CGPointMake(2, 16) controlPoint:CGPointMake(2, 20)];
                [path addLineToPoint:CGPointMake(2, 9)];
                [path addQuadCurveToPoint:CGPointMake(6, 5) controlPoint:CGPointMake(2, 5)];
                [path closePath];
                break;
            }
        }
        [path stroke];
    }];
    [images setObject:image forKey:token];
    return image;
}

NSAttributedString *decorate(UILabel *label, NSAttributedString *value) {
    NSRange range;
    NSArray<NSString *> *tokens = MoggcordPlatformTokens(value.string, &range);
    if (!tokens) return nil;
    NSMutableAttributedString *text = [value mutableCopy];
    [text deleteCharactersInRange:range];
    UIFont *font = label.font ?: [UIFont systemFontOfSize:12];
    CGFloat size = MIN(18, MAX(10, font.pointSize));
    for (NSString *token in tokens) {
        NSTextAttachment *attachment = [NSTextAttachment new];
        attachment.image = deviceImage(token);
        attachment.bounds = CGRectMake(0, (font.capHeight - size) / 2, size, size);
        [text appendAttributedString:[NSAttributedString attributedStringWithAttachment:attachment]];
        [text appendAttributedString:[[NSAttributedString alloc] initWithString:@"\u2009"]];
    }
    return text;
}

void setText(UILabel *label, SEL selector, NSString *value) {
    if (rendering || ![value isKindOfClass:NSString.class]) { originalText(label, selector, value); return; }
    NSRange range;
    if (!MoggcordPlatformTokens(value, &range)) { originalText(label, selector, value); return; }
    NSDictionary *attributes = @{NSFontAttributeName:label.font ?: [UIFont systemFontOfSize:12],
        NSForegroundColorAttributeName:label.textColor ?: UIColor.labelColor};
    NSAttributedString *decorated = decorate(label, [[NSAttributedString alloc] initWithString:value attributes:attributes]);
    rendering = true;
    @try {
        originalText(label, selector, [value substringToIndex:range.location]);
        label.attributedText = decorated;
    } @finally { rendering = false; }
}

void setAttributedText(UILabel *label, SEL selector, NSAttributedString *value) {
    if (rendering || ![value isKindOfClass:NSAttributedString.class]) { originalAttributed(label, selector, value); return; }
    NSAttributedString *decorated = decorate(label, value);
    rendering = true;
    @try { originalAttributed(label, selector, decorated ?: value); }
    @finally { rendering = false; }
}
}

BOOL MoggcordInstallPlatformIndicators(void) {
    static BOOL installed = NO;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Method text = class_getInstanceMethod(UILabel.class, @selector(setText:));
        Method attributed = class_getInstanceMethod(UILabel.class, @selector(setAttributedText:));
        if (!text || !attributed) return;
        originalText = reinterpret_cast<TextSetter>(method_getImplementation(text));
        originalAttributed = reinterpret_cast<AttributedSetter>(method_getImplementation(attributed));
        method_setImplementation(text, reinterpret_cast<IMP>(setText));
        method_setImplementation(attributed, reinterpret_cast<IMP>(setAttributedText));
        installed = YES;
    });
    return installed;
}
