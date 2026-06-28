/**
 * AppDelegate.mm – React Native 0.85 App Delegate (Objective-C++)
 *
 * Verwendet RCTAppDelegate (deprecated aber funktional fuer RN 0.85).
 * Workaround fuer Prebuilt Pods Modul-Aufloesungsprobleme.
 */

#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React-RCTAppDelegate/RCTAppDelegate.h>
#import "RCTAppDependencyProvider.h"

static NSString * const MMPPendingTransferPackageKey = @"MMPPendingTransferPackage";

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"MeineMedikamente";
  self.initialProps = @{};

  // Dependency Provider fuer RN 0.85
  self.dependencyProvider = [[RCTAppDependencyProvider alloc] init];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  BOOL didStoreTransfer = [self storePendingTransferPackageFromURL:url];
  return didStoreTransfer;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (BOOL)storePendingTransferPackageFromURL:(NSURL *)url
{
  if (url == nil) {
    return NO;
  }

  BOOL didAccess = [url startAccessingSecurityScopedResource];
  NSError *error = nil;
  NSString *content = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];
  if (didAccess) {
    [url stopAccessingSecurityScopedResource];
  }

  if (content == nil || [content rangeOfString:@"MEIN_MEDIPLAN_TRANSFER"].location == NSNotFound) {
    return NO;
  }

  [[NSUserDefaults standardUserDefaults] setObject:content forKey:MMPPendingTransferPackageKey];
  [[NSUserDefaults standardUserDefaults] synchronize];
  return YES;
}

@end
