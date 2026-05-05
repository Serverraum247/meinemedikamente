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
