package com.resicheck.connect.demo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.system.Os
import android.system.OsConstants
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Local private-cache pixel conversion only. No network, Auth, media-store or arbitrary output directory. */
class ConnectImagePreparationModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ConnectImagePreparation"
  private val worker = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private val closed = AtomicBoolean(false)
  override fun invalidate() { closed.set(true); worker.shutdown(); super.invalidate() }
  @ReactMethod fun pngToJpegWhite(sourceUri: String, targetUri: String, expectedBytes: Double, width: Double, height: Double, quality: Double, promise: Promise) {
    if (closed.get() || !busy.compareAndSet(false, true)) { promise.reject("IMAGE_PREPARATION_UNAVAILABLE", "Imagem indisponivel"); return }
    try { worker.execute {
      var decoded: Bitmap? = null
      var matte: Bitmap? = null
      var output: File? = null
      var created = false
      try {
        check(!closed.get())
        check(listOf(expectedBytes,width,height,quality).all { it.isFinite() && it == Math.floor(it) })
        check(expectedBytes in 1.0..12582912.0 && width in 1.0..3508.0 && height in 1.0..3508.0 && width*height <= 16000000.0 && quality == 90.0)
        fun privateFile(value: String): File { val uri=Uri.parse(value); check(uri.scheme=="file" && uri.authority.isNullOrEmpty() && uri.query==null && uri.fragment==null); return File(uri.path ?: error("path")).canonicalFile }
        val source=privateFile(sourceUri)
        val target=privateFile(targetUri)
        val parent=source.parentFile ?: error("parent")
        check(parent == target.parentFile && parent.parentFile == reactApplicationContext.cacheDir.canonicalFile)
        check(Regex("connect-image-[0-9a-fA-F-]{36}").matches(parent.name))
        check(Regex("flatten-source-[0-9a-fA-F-]{36}\\.png").matches(source.name) && Regex("optimized-[0-9a-fA-F-]{36}\\.jpg").matches(target.name))
        val stat=Os.lstat(source.path); check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink==1L && stat.st_size==expectedBytes.toLong())
        check(!target.exists() && source.length()==expectedBytes.toLong())
        val signature=ByteArray(8); FileInputStream(source).use { check(it.read(signature)==8) }
        check(signature.contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)))
        val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }
        BitmapFactory.decodeFile(source.path,bounds)
        check(bounds.outMimeType=="image/png" && bounds.outWidth==width.toInt() && bounds.outHeight==height.toInt())
        val bitmap=BitmapFactory.decodeFile(source.path,BitmapFactory.Options().apply { inPreferredConfig=Bitmap.Config.ARGB_8888 }) ?: error("decode")
        decoded=bitmap
        check(!closed.get() && bitmap.width==width.toInt() && bitmap.height==height.toInt() && source.length()==expectedBytes.toLong())
        var transparent=false
        if(bitmap.hasAlpha()) { val row=IntArray(bitmap.width); for(y in 0 until bitmap.height) { bitmap.getPixels(row,0,bitmap.width,0,y,bitmap.width,1); if(row.any { (it ushr 24)!=255 }) { transparent=true; break } }; row.fill(0) }
        val flattened=Bitmap.createBitmap(bitmap.width,bitmap.height,Bitmap.Config.ARGB_8888)
        matte=flattened
        Canvas(flattened).apply { drawColor(Color.WHITE); drawBitmap(bitmap,0f,0f,null) }
        flattened.setHasAlpha(false)
        check(!closed.get() && target.createNewFile()); output=target; created=true
        FileOutputStream(target).use { check(flattened.compress(Bitmap.CompressFormat.JPEG,quality.toInt(),it)); it.flush() }
        check(!closed.get() && target.length() in 1..12582912L)
        FileInputStream(target).use { check(it.read()==255 && it.read()==216 && it.read()==255) }
        promise.resolve(Arguments.createMap().apply { putString("mime","image/jpeg");putDouble("bytes",target.length().toDouble());putInt("width",bitmap.width);putInt("height",bitmap.height);putBoolean("flattenedTransparency",transparent) })
        created=false
      } catch (_: Throwable) { if(created) try { output?.delete() } catch (_: Throwable) {}; promise.reject("IMAGE_PREPARATION_UNAVAILABLE", "Imagem indisponivel") }
      finally { try { matte?.recycle(); decoded?.recycle() } catch (_: Throwable) {}; busy.set(false) }
    } } catch (_: Throwable) { busy.set(false); promise.reject("IMAGE_PREPARATION_UNAVAILABLE", "Imagem indisponivel") }
  }
}
