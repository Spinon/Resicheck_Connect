package com.resicheck.connect.demo

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager

class ConnectPrivacyPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ConnectPrivacyModule(context), ConnectSecureSessionModule(context), ConnectAudioDigestModule(context), ConnectConversationCacheModule(context), ConnectImagePreparationModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*,*>> = emptyList()
}
class ConnectPrivacyModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ConnectPrivacyCurtain"
  private fun run(promise: Promise, action: (ConnectPrivacyCurtain)->Unit) {
    UiThreadUtil.runOnUiThread {
      try {
        val owner=reactApplicationContext.currentActivity as? PrivacyActivity ?: throw IllegalStateException()
        owner.privacyCurtain.requestRetry = {
          if (reactApplicationContext.hasActiveReactInstance())
            reactApplicationContext.emitDeviceEvent("connectPrivacyRetry", null)
        }
        action(owner.privacyCurtain)
      } catch(_: Throwable) { promise.reject("PRIVACY_UNAVAILABLE","Tela protegida") }
    }
  }
  private fun value(state: ConnectPrivacyCurtain.State) = Arguments.createMap().apply { putDouble("epoch",state.epoch.toDouble());putBoolean("covered",state.covered) }
  @ReactMethod fun getState(promise: Promise) { run(promise) { promise.resolve(value(it.getState())) } }
  @ReactMethod fun cover(promise: Promise) { run(promise) { promise.resolve(value(it.cover())) } }
  @ReactMethod fun invalidate(epoch: Double,promise: Promise) {
    if(!epoch.isFinite() || epoch<0 || epoch>9007199254740991.0 || epoch!=Math.floor(epoch)) { promise.resolve(false);return }
    run(promise) { promise.resolve(it.invalidateOwned(epoch.toLong())) }
  }
  @ReactMethod fun release(epoch: Double,promise: Promise) {
    if(!epoch.isFinite() || epoch<0 || epoch>9007199254740991.0 || epoch!=Math.floor(epoch)) { promise.resolve(false);return }
    run(promise) { it.release(epoch.toLong()) { allowed -> promise.resolve(allowed) } }
  }
}

/** Pure bounded byte digest. No storage, Auth state, microphone or network access. */
class ConnectAudioDigestModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ConnectAudioDigest"
  @ReactMethod fun sha256Hex(value: String, promise: Promise) {
    var bytes: ByteArray? = null
    var digest: ByteArray? = null
    try {
      if (value.isEmpty() || value.length > 2097152 || value.length % 2 != 0 || !value.all { it in '0'..'9' || it in 'a'..'f' }) throw IllegalArgumentException()
      val held = ByteArray(value.length / 2)
      bytes = held
      for (i in held.indices) held[i] = ((Character.digit(value[i * 2], 16) shl 4) or Character.digit(value[i * 2 + 1], 16)).toByte()
      val result = java.security.MessageDigest.getInstance("SHA-256").digest(held)
      digest = result
      val alphabet = "0123456789abcdef"
      val hex = CharArray(result.size * 2)
      for (i in result.indices) { val v = result[i].toInt() and 255; hex[i * 2] = alphabet[v ushr 4]; hex[i * 2 + 1] = alphabet[v and 15] }
      promise.resolve(String(hex))
      hex.fill('0')
    } catch (_: Throwable) { promise.reject("AUDIO_DIGEST_UNAVAILABLE", "Áudio indisponível.") }
    finally { bytes?.fill(0); digest?.fill(0) }
  }
  @ReactMethod fun sha256ImageHex(value: String, promise: Promise) {
    var bytes: ByteArray? = null
    var digest: ByteArray? = null
    try {
      if (value.isEmpty() || value.length > 8388608 || value.length % 2 != 0 || !value.all { it in '0'..'9' || it in 'a'..'f' }) throw IllegalArgumentException()
      val held = ByteArray(value.length / 2)
      bytes = held
      for (i in held.indices) held[i] = ((Character.digit(value[i * 2], 16) shl 4) or Character.digit(value[i * 2 + 1], 16)).toByte()
      val result = java.security.MessageDigest.getInstance("SHA-256").digest(held)
      digest = result
      val alphabet = "0123456789abcdef"
      val hex = CharArray(result.size * 2)
      for (i in result.indices) { val v = result[i].toInt() and 255; hex[i * 2] = alphabet[v ushr 4]; hex[i * 2 + 1] = alphabet[v and 15] }
      promise.resolve(String(hex))
      hex.fill('0')
    } catch (_: Throwable) { promise.reject("IMAGE_DIGEST_UNAVAILABLE", "Imagem indisponível.") }
    finally { bytes?.fill(0); digest?.fill(0) }
  }
}
