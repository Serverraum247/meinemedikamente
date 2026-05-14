package dev.serverraum247.meinmediplan

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppRuntimeConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppRuntimeConfig"

  override fun getConstants(): MutableMap<String, Any> =
    mutableMapOf("internalPremiumTestMode" to BuildConfig.INTERNAL_PREMIUM_TEST_MODE)
}
