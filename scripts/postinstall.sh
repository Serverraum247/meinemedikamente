#!/bin/bash
# Postinstall: Fix fuer react-native-sqlite-storage build.gradle
# jcenter() wurde in Gradle 9.x entfernt
# Wird nach jedem 'npm install' automatisch ausgefuehrt

SQLITE_GRADLE="node_modules/react-native-sqlite-storage/platforms/android/build.gradle"

if [ -f "$SQLITE_GRADLE" ]; then
  sed -i '' 's/jcenter()/mavenCentral()/g' "$SQLITE_GRADLE"
  sed -i '' "s/classpath 'com.android.tools.build:gradle:3.1.4'/classpath 'com.android.tools.build:gradle:7.4.2'/" "$SQLITE_GRADLE"
  echo "[postinstall] react-native-sqlite-storage build.gradle patched (jcenter -> mavenCentral)"
fi

# Fix: @react-native-firebase/firestore fehlender RCT-Import (RN 0.85 Prebuilt Pods)
FIRESTORE_COMMON="node_modules/@react-native-firebase/firestore/ios/RNFBFirestore/RNFBFirestoreCommon.h"
if [ -f "$FIRESTORE_COMMON" ]; then
  if ! grep -q "React-Core/React/RCTBridgeModule" "$FIRESTORE_COMMON"; then
    sed -i '' '1s/^/#import <React-Core\/React\/RCTBridgeModule.h>\n/' "$FIRESTORE_COMMON"
    echo "[postinstall] RNFBFirestoreCommon.h: RCT-Import hinzugefuegt"
  fi
fi

FIRESTORE_COLLECTION="node_modules/@react-native-firebase/firestore/ios/RNFBFirestore/RNFBFirestoreCollectionModule.h"
if [ -f "$FIRESTORE_COLLECTION" ]; then
  if ! grep -q "React-Core/React/RCTBridgeModule" "$FIRESTORE_COLLECTION"; then
    sed -i '' '1s/^/#import <React-Core\/React\/RCTBridgeModule.h>\n/' "$FIRESTORE_COLLECTION"
    echo "[postinstall] RNFBFirestoreCollectionModule.h: RCT-Import hinzugefuegt"
  fi
fi
