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

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"MeineMedikamente";
  self.initialProps = @{};

  // Dependency Provider fuer RN 0.85
  self.dependencyProvider = [[RCTAppDependencyProvider alloc] init];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
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

@end
