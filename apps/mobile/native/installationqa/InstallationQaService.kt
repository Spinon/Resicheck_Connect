package com.resicheck.connect.demo

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Bundle
import android.os.IBinder
import android.os.Parcel
import com.resicheck.connect.installation.InstallationIdentityStore
import java.io.File

// Offline QA-only second process. Not included by production/previous builders.
// Public UUID moves only through this in-memory Binder response, never UI/logs.
class InstallationQaService : Service() {
  override fun onBind(intent:Intent?):IBinder = object:Binder() {
    override fun onTransact(code:Int,data:Parcel,reply:Parcel?,flags:Int):Boolean {
      if(code!=1 || reply==null)return super.onTransact(code,data,reply,flags)
      val output=Bundle()
      try {
        val root=File(noBackupFilesDir,"installation-core-qa")
        val store=InstallationIdentityStore(root,"abcdefghijklmnopqrst")
        output.putString("value",store.getOrCreate())
        output.putInt("pid",android.os.Process.myPid())
        output.putBoolean("ok",true)
      } catch(_:Throwable){output.putBoolean("ok",false)}
      reply.writeNoException();reply.writeBundle(output);return true
    }
  }
}
