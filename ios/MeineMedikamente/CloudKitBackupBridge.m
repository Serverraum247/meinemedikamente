//
//  CloudKitBackupBridge.m
//
//  Objective-C Bridge fuer CloudKitBackup Swift Module.
//  Registriert die nativen Methoden bei React Native.
//

#import <React-Core/React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CloudKitBackup, NSObject)

RCT_EXTERN_METHOD(createBackup:(NSString *)jsonString
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restoreBackup:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getBackupInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteBackup:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
