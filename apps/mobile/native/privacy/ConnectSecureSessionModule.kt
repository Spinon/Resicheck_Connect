package com.resicheck.connect.demo

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

/** Internal bridge only. Never prints records, credentials or exception data. */
class ConnectSecureSessionModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val store by lazy { ConnectSecureSessionStore(context) }
  override fun getName() = "ConnectSecureSession"
  private fun run(promise: Promise, action: () -> Unit) {
    try { action() }
    catch (_: ConnectSecureSessionStore.InvalidInput) { promise.reject("SECURE_SESSION_INVALID_INPUT", "Sessão segura indisponível.") }
    catch (_: Throwable) { promise.reject("SECURE_SESSION_UNAVAILABLE", "Não foi possível acessar a sessão segura.") }
  }
  private fun epoch(value: Double): Long {
    if (!ConnectSecureSessionStore.validEpoch(value)) throw ConnectSecureSessionStore.InvalidInput()
    return value.toLong()
  }
  private fun record(value: ReadableMap?): ConnectSecureSessionStore.Record {
    if (value == null || value.toHashMap().keys != setOf("schemaVersion", "projectRef", "userId", "refreshToken")) throw ConnectSecureSessionStore.InvalidInput()
    if (value.getType("schemaVersion") != ReadableType.Number || value.getDouble("schemaVersion") != 1.0 || value.getType("projectRef") != ReadableType.String || value.getType("userId") != ReadableType.String || value.getType("refreshToken") != ReadableType.String) throw ConnectSecureSessionStore.InvalidInput()
    return ConnectSecureSessionStore.Record.create(value.getString("projectRef") ?: throw ConnectSecureSessionStore.InvalidInput(), value.getString("userId") ?: throw ConnectSecureSessionStore.InvalidInput(), value.getString("refreshToken") ?: throw ConnectSecureSessionStore.InvalidInput())
  }
  /** One user-requested invite token; no disk, Keystore record or logging. */
  @ReactMethod fun randomInviteBytes(promise: Promise) {
    val bytes = ByteArray(32)
    try {
      java.security.SecureRandom().nextBytes(bytes)
      val hex = CharArray(64)
      val digits = "0123456789abcdef"
      for (i in bytes.indices) {
        val value = bytes[i].toInt() and 255
        hex[i * 2] = digits[value ushr 4]
        hex[i * 2 + 1] = digits[value and 15]
      }
      val token = String(hex)
      hex.fill(0.toChar())
      promise.resolve(token)
    } catch (_: Throwable) {
      promise.reject("INVITATION_UNAVAILABLE", "Não foi possível criar o convite.")
    } finally { bytes.fill(0) }
  }
  @ReactMethod fun claim(promise: Promise) { run(promise) {
    val claim = store.claim()
    val result = Arguments.createMap().apply {
      putDouble("epoch", claim.epoch.toDouble())
      val record = claim.record
      if (record == null) putNull("record") else putMap("record", Arguments.createMap().apply {
        putInt("schemaVersion", 1);putString("projectRef", record.projectRef);putString("userId", record.userId);putString("refreshToken", record.refreshToken)
      })
    }
    promise.resolve(result)
  } }
  @ReactMethod fun save(expectedEpoch: Double, value: ReadableMap?, promise: Promise) { run(promise) { promise.resolve(store.save(epoch(expectedEpoch), record(value))) } }
  @ReactMethod fun clear(expectedEpoch: Double, promise: Promise) { run(promise) { promise.resolve(store.clear(epoch(expectedEpoch))) } }
}
