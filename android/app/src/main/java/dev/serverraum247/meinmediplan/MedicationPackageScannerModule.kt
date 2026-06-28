package dev.serverraum247.meinmediplan

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

class MedicationPackageScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var pendingPromise: Promise? = null
  private var pendingImageUri: Uri? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != SCAN_PACKAGE_REQUEST) return
      val promise = pendingPromise ?: return
      val uri = pendingImageUri
      pendingPromise = null
      pendingImageUri = null

      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(Arguments.createMap().apply { putBoolean("cancelled", true) })
        return
      }

      processImage(uri, promise)
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "MedicationPackageScanner"

  @ReactMethod
  fun scanPackage(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("PACKAGE_SCAN_NO_ACTIVITY", "Kein aktives Fenster zum Scannen gefunden.")
      return
    }
    if (pendingPromise != null) {
      promise.reject("PACKAGE_SCAN_RUNNING", "Es läuft bereits ein Packungs-Scan.")
      return
    }

    try {
      val imageFile = File.createTempFile("medication-package-", ".jpg", File(reactContext.cacheDir, "package-scans").apply { mkdirs() })
      val uri = FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.fileprovider", imageFile)
      pendingPromise = promise
      pendingImageUri = uri

      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_OUTPUT, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      }
      activity.startActivityForResult(intent, SCAN_PACKAGE_REQUEST)
    } catch (error: Exception) {
      pendingPromise = null
      pendingImageUri = null
      promise.reject("PACKAGE_SCAN_START_ERROR", "Packungs-Scan konnte nicht gestartet werden: ${error.localizedMessage}", error)
    }
  }

  private fun processImage(uri: Uri, promise: Promise) {
    try {
      val image = InputImage.fromFilePath(reactContext, uri)
      val barcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
          .setBarcodeFormats(
            Barcode.FORMAT_DATA_MATRIX,
            Barcode.FORMAT_CODE_39,
            Barcode.FORMAT_CODE_128,
            Barcode.FORMAT_EAN_13,
            Barcode.FORMAT_EAN_8,
            Barcode.FORMAT_QR_CODE,
          )
          .build(),
      )
      val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      barcodeScanner.process(image)
        .continueWithTask { barcodeTask ->
          val barcodes = if (barcodeTask.isSuccessful) barcodeTask.result else emptyList()
          textRecognizer.process(image).continueWith { textTask ->
            val result = Arguments.createMap()
            val barcodeArray = Arguments.createArray()
            barcodes.forEach { barcode ->
              val value = barcode.rawValue ?: return@forEach
              barcodeArray.pushMap(Arguments.createMap().apply {
                putString("value", value)
                putString("format", formatName(barcode.format))
              })
            }
            val text = if (textTask.isSuccessful) textTask.result else null
            val textLines = Arguments.createArray()
            text?.textBlocks?.forEach { block ->
              block.lines.forEach { line ->
                textLines.pushString(line.text)
              }
            }
            result.putArray("barcodes", barcodeArray)
            result.putArray("textLines", textLines)
            result.putString("text", text?.text ?: "")
            result.putString("source", "photo")
            result
          }
        }
        .addOnSuccessListener { result -> promise.resolve(result) }
        .addOnFailureListener { error ->
          promise.reject("PACKAGE_SCAN_PROCESS_ERROR", "Packung konnte nicht ausgewertet werden: ${error.localizedMessage}", error)
        }
    } catch (error: Exception) {
      promise.reject("PACKAGE_SCAN_PROCESS_ERROR", "Packung konnte nicht gelesen werden: ${error.localizedMessage}", error)
    }
  }

  private fun formatName(format: Int): String =
    when (format) {
      Barcode.FORMAT_DATA_MATRIX -> "data-matrix"
      Barcode.FORMAT_CODE_39 -> "code-39"
      Barcode.FORMAT_CODE_128 -> "code-128"
      Barcode.FORMAT_EAN_13 -> "ean-13"
      Barcode.FORMAT_EAN_8 -> "ean-8"
      Barcode.FORMAT_QR_CODE -> "qr"
      else -> "unknown"
    }

  companion object {
    private const val SCAN_PACKAGE_REQUEST = 48210
  }
}
