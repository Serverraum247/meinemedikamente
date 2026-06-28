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

@interface RCT_EXTERN_MODULE(AppRuntimeConfig, NSObject)
@end

@interface RCT_EXTERN_MODULE(MedicationVisionScanner, NSObject)

RCT_EXTERN_METHOD(scanMedicationPackage:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(MedicationPackageScanner, NSObject)

RCT_EXTERN_METHOD(scanPackage:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(MedicationPlanShare, NSObject)

RCT_EXTERN_METHOD(sharePdf:(NSString *)title
                  body:(NSString *)body
                  fileName:(NSString *)fileName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(DeviceTransferFile, NSObject)

RCT_EXTERN_METHOD(shareTransferFile:(NSString *)fileName
                  content:(NSString *)content
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pickTransferFile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPendingTransferFile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearPendingTransferFile:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(randomBytes:(nonnull NSNumber *)byteCount
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
