package com.resicheck.connect.installation

import android.os.SystemClock
import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.channels.FileLock
import java.nio.channels.OverlappingFileLockException
import java.nio.charset.CodingErrorAction
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock

class InstallationUnavailableException : Exception("Installation unavailable")

/** Public random routing metadata only. NEVER use this file for tokens or secrets. */
class InstallationIdentityStore @JvmOverloads constructor(
  private val noBackupRoot: File,
  private val projectRef: String,
  private val io: RecordIo = AtomicRecordIo()
) {
  interface RecordIo {
    fun read(file: File): ByteArray?
    fun write(file: File, bytes: ByteArray)
  }

  /** IO dependency is native-only; the React bridge cannot choose paths or IO. */
  class AtomicRecordIo : RecordIo {
    override fun read(file: File): ByteArray? {
      try {
        AtomicFile(file).openRead().use { input ->
          val buffer=ByteArray(MAX_BYTES+1)
          var total=0
          while(total<buffer.size) {
            val n=input.read(buffer,total,buffer.size-total)
            if(n<0) break
            if(n==0) throw InstallationUnavailableException()
            total+=n
          }
          if(total>MAX_BYTES) throw InstallationUnavailableException()
          return buffer.copyOf(total)
        }
      } catch(_: FileNotFoundException) {
        if(file.exists() || File(file.path+".bak").exists() || File(file.path+".new").exists()) throw InstallationUnavailableException()
        return null
      }
    }
    override fun write(file: File, bytes: ByteArray) {
      if(bytes.size>MAX_BYTES) throw InstallationUnavailableException()
      val atomic=AtomicFile(file)
      var output: FileOutputStream?=null
      try {
        val stream=atomic.startWrite();output=stream
        stream.write(bytes);stream.fd.sync()
        atomic.finishWrite(stream);output=null
      } catch(_: Exception) {
        if(output!=null) try { atomic.failWrite(output) } catch(_: Exception) {}
        throw InstallationUnavailableException()
      }
    }
  }

  init { if(!Regex("[a-z]{20}").matches(projectRef)) throw InstallationUnavailableException() }

  fun getOrCreate(): String {
    var acquired=false
    try {
      acquired=processLock.tryLock(LOCK_WAIT_MS,TimeUnit.MILLISECONDS)
      if(!acquired) throw InstallationUnavailableException()
      val anchor=noBackupRoot.canonicalFile
      if(!anchor.isDirectory) throw InstallationUnavailableException()
      val directory=File(anchor,"connect-installation-v1")
      if(!directory.isDirectory && !directory.mkdir()) throw InstallationUnavailableException()
      if(directory.canonicalFile!=directory.absoluteFile) throw InstallationUnavailableException()
      val record=File(directory,"$projectRef.json")
      val lock=File(directory,"$projectRef.lock")
      for(f in listOf(record,lock,File(record.path+".bak"),File(record.path+".new"))) {
        if(f.canonicalFile!=f.absoluteFile || f.isDirectory) throw InstallationUnavailableException()
      }
      RandomAccessFile(lock,"rw").use { owner ->
        val deadline=SystemClock.elapsedRealtime()+LOCK_WAIT_MS
        var held:FileLock?=null
        while(held==null) {
          try { held=owner.channel.tryLock() } catch(_: OverlappingFileLockException) {}
          if(held==null) {
            if(SystemClock.elapsedRealtime()>=deadline || Thread.currentThread().isInterrupted) throw InstallationUnavailableException()
            Thread.sleep(10)
          }
        }
        try {
          val existing=io.read(record)
          if(existing!=null) return decode(existing)
          val id=UUID.randomUUID().toString()
          val bytes="""{"version":1,"projectRef":"$projectRef","installationId":"$id"}""".toByteArray(Charsets.UTF_8)
          io.write(record,bytes)
          val readback=io.read(record) ?: throw InstallationUnavailableException()
          if(!bytes.contentEquals(readback) || decode(readback)!=id) throw InstallationUnavailableException()
          return id
        } finally { held.release() }
      }
    } catch(_: Exception) {
      throw InstallationUnavailableException()
    } finally { if(acquired) processLock.unlock() }
  }

  private fun decode(bytes:ByteArray):String {
    if(bytes.size>MAX_BYTES) throw InstallationUnavailableException()
    val decoder=Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
    val text=decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
    val pattern=Regex("""\{"version":1,"projectRef":"$projectRef","installationId":"([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"\}""")
    return pattern.matchEntire(text)?.groupValues?.get(1) ?: throw InstallationUnavailableException()
  }
  companion object {
    private const val MAX_BYTES=256
    private const val LOCK_WAIT_MS=500L
    private val processLock=ReentrantLock()
  }
}
