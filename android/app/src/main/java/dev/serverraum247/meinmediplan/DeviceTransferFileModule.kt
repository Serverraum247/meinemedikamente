package dev.serverraum247.meinmediplan

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.SecureRandom

class DeviceTransferFileModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var pendingPickPromise: Promise? = null
  private var consumedPendingIntentKey: String? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_TRANSFER_FILE_REQUEST) return

      val promise = pendingPickPromise ?: return
      pendingPickPromise = null

      if (resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return
      }

      val uri: Uri? = data?.data
      if (uri == null) {
        promise.reject("TRANSFER_PICK_ERROR", "Keine Datei ausgewählt.")
        return
      }

      try {
        val content = reactContext.contentResolver.openInputStream(uri)?.use { stream ->
          stream.bufferedReader(Charsets.UTF_8).readText()
        }
        promise.resolve(content)
      } catch (error: Exception) {
        promise.reject("TRANSFER_PICK_ERROR", "Sicheres Paket konnte nicht gelesen werden: ${error.localizedMessage}", error)
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "DeviceTransferFile"

  @ReactMethod
  fun shareTransferFile(fileName: String, content: String, promise: Promise) {
    try {
      val exportDir = File(reactContext.cacheDir, "device-transfer")
      if (!exportDir.exists()) exportDir.mkdirs()
      val transferFile = File(exportDir, safeFileName(fileName))
      transferFile.writeText(content, Charsets.UTF_8)

      val uri = FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        transferFile,
      )

      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/octet-stream"
        putExtra(Intent.EXTRA_SUBJECT, "Mein MediPlan - Sicheres Transferpaket")
        putExtra(
          Intent.EXTRA_TEXT,
          "Im Anhang liegt ein verschlüsseltes Mein MediPlan Transferpaket. Den Sicherheitscode bitte getrennt übermitteln.",
        )
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(shareIntent, "Sicheres Paket teilen").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      reactContext.startActivity(chooser)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("TRANSFER_SHARE_ERROR", "Sicheres Paket konnte nicht geteilt werden: ${error.localizedMessage}", error)
    }
  }

  @ReactMethod
  fun pickTransferFile(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("TRANSFER_PICK_ERROR", "Kein aktives Fenster zum Auswählen gefunden.")
      return
    }
    if (pendingPickPromise != null) {
      promise.reject("TRANSFER_PICK_ERROR", "Es läuft bereits eine Dateiauswahl.")
      return
    }

    pendingPickPromise = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/octet-stream", "text/plain"))
    }
    activity.startActivityForResult(intent, PICK_TRANSFER_FILE_REQUEST)
  }

  @ReactMethod
  fun getPendingTransferFile(promise: Promise) {
    try {
      val activity = reactContext.currentActivity
      val intent = activity?.intent
      val uri = intent?.data
      if (intent?.action != Intent.ACTION_VIEW || uri == null) {
        promise.resolve(null)
        return
      }

      val key = pendingIntentKey(intent, uri)
      if (key == consumedPendingIntentKey) {
        promise.resolve(null)
        return
      }

      val content = readTransferUri(uri)
      if (!looksLikeTransferPackage(content)) {
        promise.resolve(null)
        return
      }

      consumedPendingIntentKey = key
      promise.resolve(content)
    } catch (error: Exception) {
      promise.reject("TRANSFER_PENDING_ERROR", "Sicheres Paket konnte nicht aus dem Anhang gelesen werden: ${error.localizedMessage}", error)
    }
  }

  @ReactMethod
  fun clearPendingTransferFile(promise: Promise) {
    val intent = reactContext.currentActivity?.intent
    val uri = intent?.data
    consumedPendingIntentKey = if (intent != null && uri != null) pendingIntentKey(intent, uri) else consumedPendingIntentKey
    promise.resolve(null)
  }

  @ReactMethod
  fun randomBytes(byteCount: Int, promise: Promise) {
    if (byteCount <= 0 || byteCount > 1024) {
      promise.reject("TRANSFER_RANDOM_ERROR", "Ungültige Anzahl Zufallsbytes.")
      return
    }
    val bytes = ByteArray(byteCount)
    SecureRandom().nextBytes(bytes)
    promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
  }

  private fun safeFileName(value: String): String {
    val sanitized = value
      .replace(Regex("[^A-Za-z0-9._-]"), "-")
      .replace(Regex("-+"), "-")
      .trim('-')
    val base = sanitized.ifBlank { "mein-mediplan-transfer.mmptransfer" }
    return if (base.endsWith(".mmptransfer")) base else "$base.mmptransfer"
  }

  private fun readTransferUri(uri: Uri): String {
    return reactContext.contentResolver.openInputStream(uri)?.use { stream ->
      stream.bufferedReader(Charsets.UTF_8).readText()
    } ?: throw IllegalArgumentException("Die Datei konnte nicht geöffnet werden.")
  }

  private fun looksLikeTransferPackage(content: String): Boolean {
    return content.contains("\"magic\"") && content.contains("MEIN_MEDIPLAN_TRANSFER")
  }

  private fun pendingIntentKey(intent: Intent, uri: Uri): String {
    return "${uri}:${intent.getLongExtra("mmp_opened_at", 0L)}"
  }

  companion object {
    private const val PICK_TRANSFER_FILE_REQUEST = 47241
  }
}
