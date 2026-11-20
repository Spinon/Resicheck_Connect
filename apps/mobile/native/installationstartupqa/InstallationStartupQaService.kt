package com.resicheck.connect.demo

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Bundle
import android.os.IBinder
import android.os.Parcel
import android.util.AtomicFile
import com.resicheck.connect.installation.InstallationIdentityStore
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock

// QA-only, non-exported process. No production/reset API or raw ID output.
class InstallationStartupQaService : Service() {
  private var lockOwner:RandomAccessFile?=null
  private var held:FileLock?=null
  private fun releaseLock(){held?.release();held=null;lockOwner?.close();lockOwner=null}
  override fun onDestroy(){releaseLock();super.onDestroy()}
  override fun onBind(intent:Intent?):IBinder = object:Binder() {
    override fun onTransact(code:Int,data:Parcel,reply:Parcel?,flags:Int):Boolean {
      if(code !in 1..3 || reply==null)return super.onTransact(code,data,reply,flags)
      val output=Bundle()
      try {
        when(code){
          1->{
            val dir=File(noBackupFilesDir,"startup-core-qa/lock/connect-installation-v1")
            if(!dir.mkdirs()&&!dir.isDirectory)throw IllegalStateException()
            lockOwner=RandomAccessFile(File(dir,"abcdefghijklmnopqrst.lock"),"rw")
            held=lockOwner!!.channel.lock();output.putBoolean("held",held!!.isValid)
          }
          2->releaseLock()
          3->{
            val root=File(noBackupFilesDir,"startup-core-qa/partial")
            if(!root.mkdirs()&&!root.isDirectory)throw IllegalStateException()
            val actual=InstallationIdentityStore.AtomicRecordIo()
            val partial=object:InstallationIdentityStore.RecordIo {
              override fun read(file:File):ByteArray?=actual.read(file)
              override fun write(file:File,bytes:ByteArray){
                val output=AtomicFile(file).startWrite()
                output.write(bytes,0,minOf(24,bytes.size));output.fd.sync()
                // Intentionally terminate this QA process before finishWrite.
                android.os.Process.killProcess(android.os.Process.myPid())
                throw IllegalStateException()
              }
            }
            InstallationIdentityStore(root,"abcdefghijklmnopqrst",partial).getOrCreate()
            throw IllegalStateException()
          }
        }
        output.putInt("pid",android.os.Process.myPid());output.putBoolean("ok",true)
      }catch(_:Throwable){output.putBoolean("ok",false)}
      reply.writeNoException();reply.writeBundle(output);return true
    }
  }
}
