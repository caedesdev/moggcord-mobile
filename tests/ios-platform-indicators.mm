/* Copyright (c) 2026 Moggcord contributors. SPDX-License-Identifier: GPL-3.0-or-later */
#import <UIKit/UIKit.h>
#import "../ios/PlatformIndicators.h"
#import "../ios/PlatformIndicatorTokens.h"

static void check(BOOL condition, NSString *message) {
    if (!condition) @throw [NSException exceptionWithName:@"PlatformIndicatorTest" reason:message userInfo:nil];
}

@interface PlatformIndicatorTestApp : UIResponder <UIApplicationDelegate>
@property(nonatomic) UIWindow *window;
@end

@implementation PlatformIndicatorTestApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    (void)application; (void)options;
    NSURL *documents = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
    NSMutableDictionary *report = [NSMutableDictionary dictionary];
    @try {
        check(MoggcordInstallPlatformIndicators(), @"Native label hooks could not load.");
        NSRange range;
        NSArray *tokens = MoggcordPlatformTokens(@"10:42  \u2063mcpi|d2m2\u2063", &range);
        check([tokens isEqual:@[@"d2", @"m2"]], @"Valid devices were not parsed.");
        for (NSString *invalid in @[@"plain text", @"\u2063mcpi|d4\u2063", @"\u2063mcpi|d0d1\u2063",
            @"\u2063mcpi|d0\u2063tail", @"\u2063mcpi|x2\u2063", @"\u2063mcpi|\u2063"]) {
            check(!MoggcordPlatformTokens(invalid, nullptr), @"An invalid suffix became an icon.");
        }
        UILabel *plain = [UILabel new];
        plain.font = [UIFont systemFontOfSize:12];
        plain.text = @"10:42  \u2063mcpi|d2m2\u2063";
        __block NSUInteger count = 0;
        [plain.attributedText enumerateAttribute:NSAttachmentAttributeName inRange:NSMakeRange(0, plain.attributedText.length)
            options:0 usingBlock:^(id value, NSRange attachmentRange, BOOL *stop) {
                (void)attachmentRange; (void)stop;
                if (!value) return;
                check([value isKindOfClass:NSTextAttachment.class] && [(NSTextAttachment *)value image] != nil,
                    @"Device icons are not native image attachments.");
                count++;
            }];
        check(count == 2, @"The timestamp did not contain both device images.");
        check([plain.attributedText.string rangeOfString:@"mcpi"].location == NSNotFound, @"Internal text leaked into the label.");
        plain.text = @"ordinary reused label";
        check([plain.text isEqual:@"ordinary reused label"], @"A reused label kept its old device indicator.");
        NSAttributedString *styled = [[NSAttributedString alloc] initWithString:@"10:42  \u2063mcpi|w0\u2063"
            attributes:@{NSFontAttributeName:[UIFont boldSystemFontOfSize:15], NSUnderlineStyleAttributeName:@1}];
        plain.attributedText = styled;
        check([[plain.attributedText attribute:NSUnderlineStyleAttributeName atIndex:0 effectiveRange:nil] isEqual:@1],
            @"The timestamp lost existing text attributes.");

        self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
        UIViewController *controller = [UIViewController new];
        controller.view.backgroundColor = [UIColor colorWithRed:0.12 green:0.13 blue:0.15 alpha:1];
        self.window.rootViewController = controller;
        [self.window makeKeyAndVisible];
        UIView *preview = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 400, 220)];
        preview.backgroundColor = controller.view.backgroundColor;
        NSArray *names = @[@"Online", @"Idle", @"Do Not Disturb", @"Offline"];
        for (NSUInteger status = 0; status < 4; status++) {
            UILabel *label = [[UILabel alloc] initWithFrame:CGRectMake(22, 18 + status * 48, 360, 32)];
            label.font = [UIFont systemFontOfSize:16];
            label.textColor = UIColor.lightGrayColor;
            label.text = [NSString stringWithFormat:@"%@  10:42  \u2063mcpi|d%luw%lum%luc%luv%lu\u2063",
                names[status], status, status, status, status, status];
            [preview addSubview:label];
        }
        [controller.view addSubview:preview];
        UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:preview.bounds.size];
        UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
            [preview.layer renderInContext:context.CGContext];
        }];
        check([UIImagePNGRepresentation(image) writeToURL:[documents URLByAppendingPathComponent:@"preview.png"] atomically:YES],
            @"The native icon preview could not be saved.");
        report[@"success"] = @YES;
        report[@"attachments"] = @(count);
    } @catch (NSException *error) {
        report[@"success"] = @NO;
        report[@"error"] = error.reason ?: error.name;
    }
    [[NSJSONSerialization dataWithJSONObject:report options:0 error:nil]
        writeToURL:[documents URLByAppendingPathComponent:@"result.json"] atomically:YES];
    return YES;
}
@end

int main(int argc, char *argv[]) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(PlatformIndicatorTestApp.class)); }
}
