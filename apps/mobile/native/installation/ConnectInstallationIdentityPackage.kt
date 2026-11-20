package com.resicheck.connect.installation

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class ConnectInstallationIdentityPackage(private val projectRef:String) : ReactPackage {
  override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(InstallationModule(context,projectRef))
  override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}

private class InstallationModule(context:ReactApplicationContext,private val projectRef:String) : ReactContextBaseJavaModule(context) {
  @Volatile private var closed=false
  override fun getName()="ConnectInstallationIdentity"
  private fun fail(promise:Promise) { promise.reject("INSTALLATION_UNAVAILABLE","Não foi possível preparar a instalação.") }
  @ReactMethod fun getOrCreate(promise:Promise) {
    if(closed) { fail(promise);return }
    try {
      executor.execute {
        if(closed) { fail(promise);return@execute }
        try {
          val id=InstallationIdentityStore(reactApplicationContext.noBackupFilesDir,projectRef).getOrCreate()
          if(closed) { fail(promise);return@execute }
          promise.resolve(Arguments.createMap().apply { putString("projectRef",projectRef);putString("installationId",id) })
        } catch(_:Exception) { fail(promise) }
      }
    } catch(_:RejectedExecutionException) { fail(promise) }
  }
  override fun invalidate() { closed=true;super.invalidate() }
  companion object {
    // One bounded worker per process; bridge invalidation never cancels another
    // bridge's write or starts a competing replacement while IO is uncertain.
    private val executor=ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(16),{task->Thread(task,"connect-installation-io").apply { isDaemon=true }},ThreadPoolExecutor.AbortPolicy())
  }
}
