package dev.serverraum247.meinmediplan

import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class MedicationPlanShareModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MedicationPlanShare"

  @ReactMethod
  fun sharePdf(title: String, body: String, fileName: String, promise: Promise) {
    try {
      val exportDir = File(reactContext.cacheDir, "exports")
      if (!exportDir.exists()) exportDir.mkdirs()
      val pdfFile = File(exportDir, safeFileName(fileName))

      createPdf(title, body, pdfFile)

      val uri = FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        pdfFile,
      )

      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/pdf"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(shareIntent, title).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      reactContext.startActivity(chooser)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PDF_SHARE_ERROR", "PDF konnte nicht geteilt werden: ${error.localizedMessage}", error)
    }
  }

  private fun createPdf(title: String, body: String, outputFile: File) {
    val document = PdfDocument()
    val pageWidth = 595
    val pageHeight = 842
    val margin = 48f
    val maxTextWidth = pageWidth - (margin * 2)

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      textSize = 20f
      color = 0xFF1A1A2E.toInt()
    }
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
      textSize = 12f
      color = 0xFF222222.toInt()
    }

    var pageNumber = 1
    var page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
    var canvas: Canvas = page.canvas
    var y = margin

    fun newPage() {
      document.finishPage(page)
      pageNumber += 1
      page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
      canvas = page.canvas
      y = margin
    }

    canvas.drawText(title, margin, y, titlePaint)
    y += 34f

    for (paragraph in body.split('\n')) {
      val wrappedLines = wrapLine(paragraph, textPaint, maxTextWidth)
      for (line in wrappedLines) {
        if (y > pageHeight - margin) newPage()
        canvas.drawText(line, margin, y, textPaint)
        y += if (line.isBlank()) 10f else 18f
      }
    }

    document.finishPage(page)
    outputFile.outputStream().use { stream -> document.writeTo(stream) }
    document.close()
  }

  private fun wrapLine(line: String, paint: Paint, maxWidth: Float): List<String> {
    if (line.isBlank()) return listOf("")
    val words = line.split(' ')
    val lines = mutableListOf<String>()
    var current = ""

    for (word in words) {
      val candidate = if (current.isBlank()) word else "$current $word"
      if (paint.measureText(candidate) <= maxWidth) {
        current = candidate
      } else {
        if (current.isNotBlank()) lines.add(current)
        current = word
      }
    }
    if (current.isNotBlank()) lines.add(current)
    return lines
  }

  private fun safeFileName(value: String): String {
    val sanitized = value
      .replace("ß", "ss")
      .replace("ẞ", "SS")
      .replace(Regex("[^A-Za-z0-9 ._-]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
    return if (sanitized.endsWith(".pdf")) sanitized else "$sanitized.pdf"
  }
}
