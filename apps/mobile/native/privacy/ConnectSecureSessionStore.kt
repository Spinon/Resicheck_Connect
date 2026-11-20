package com.resicheck.connect.demo

import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Process
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONException
import org.json.JSONObject

/** Internal refresh credential store. No password, access JWT, profile or chat
 * data belongs here. Claims fence old React owners; every accepted mutation is
 * synchronous/confirmed on disk. This backend has no React or network dependency.
 * Single default application process only; not a multiprocess SharedPrefs API. */
class ConnectSecureSessionStore(context: Context) {
  companion object {
    const val PROJECT_REF = "ibdlvlwdzmsrbqadrudb"
    const val PREFERENCES_NAME = "connect_secure_session_v1"
    const val KEY_ALIAS = "com.resicheck.connect.session.v1"
    const val MAX_EPOCH = 9007199254740991L
    private const val EPOCH = "epoch"
    private const val IV = "iv"
    private const val CIPHERTEXT = "ciphertext"
    private const val MAX_CIPHER_BYTES = 9216
    private val gate = Any()
    // SharedPrefs may update its process cache even when commit reports false.
    // Never continue with that cache as if a mutation had become durable.
    private var failedInProcess = false
    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    private val jwtShape = Regex("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
    private val recordKeys = setOf("schemaVersion", "projectRef", "userId", "refreshToken")
    private val storageKeys = setOf(EPOCH, IV, CIPHERTEXT)
    private val aad = "ResiCheckConnect|$PROJECT_REF|secure-session|1".toByteArray(StandardCharsets.UTF_8)

    fun validEpoch(value: Double): Boolean = value.isFinite() && value >= 1.0 && value <= MAX_EPOCH.toDouble() && value == Math.floor(value)
  }

  class Unavailable : RuntimeException("Secure session unavailable")
  class InvalidInput : IllegalArgumentException("Secure session input unavailable")
  private class CorruptRecord : RuntimeException()

  class Record private constructor(val userId: String, val refreshToken: String) {
    val schemaVersion: Int get() = 1
    val projectRef: String get() = PROJECT_REF
    override fun toString() = "SecureSessionRecord(redacted)"
    internal fun json(): JSONObject = JSONObject().put("schemaVersion", 1).put("projectRef", PROJECT_REF).put("userId", userId).put("refreshToken", refreshToken)
    companion object {
      fun create(projectRef: String, userId: String, refreshToken: String): Record {
        if (projectRef != PROJECT_REF || !uuid.matches(userId) || refreshToken.isEmpty() || refreshToken.length > 8192 || refreshToken.toByteArray(StandardCharsets.UTF_8).size > 8192 || refreshToken.startsWith("sb_") || jwtShape.matches(refreshToken) || !StandardCharsets.UTF_8.newEncoder().canEncode(refreshToken) || refreshToken.any { it.isWhitespace() || Character.isISOControl(it) }) throw InvalidInput()
        return Record(userId, refreshToken)
      }
      fun fromJson(value: JSONObject): Record {
        if (value.keys().asSequence().toSet() != recordKeys) throw InvalidInput()
        val schema = value.get("schemaVersion")
        val project = value.get("projectRef")
        val user = value.get("userId")
        val refresh = value.get("refreshToken")
        if (schema !is Number || schema.toDouble() != 1.0 || project !is String || user !is String || refresh !is String) throw InvalidInput()
        return create(project, user, refresh)
      }
    }
  }
  class Claim(val epoch: Long, val record: Record?) {
    override fun toString() = "SecureSessionClaim(redacted)"
  }

  private val appContext = context.applicationContext
  private val preferences: SharedPreferences by lazy { appContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE) }

  private fun ready() {
    if (failedInProcess) throw Unavailable()
    val ownProcess = appContext.applicationInfo.processName
    val currentProcess = if (Build.VERSION.SDK_INT >= 28) Application.getProcessName() else {
      val manager = appContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      manager?.runningAppProcesses?.firstOrNull { it.pid == Process.myPid() }?.processName
    }
    if (ownProcess.isNullOrEmpty() || currentProcess.isNullOrEmpty() || currentProcess != ownProcess) throw Unavailable()
  }
  private fun epoch(): Long {
    val raw = preferences.all[EPOCH] ?: return 0L
    if (raw !is Long || raw < 0L || raw > MAX_EPOCH) throw Unavailable()
    return raw
  }
  private fun next(value: Long): Long {
    if (value < 0L || value >= MAX_EPOCH) throw Unavailable()
    return value + 1L
  }
  private fun committed(editor: SharedPreferences.Editor) {
    try {
      if (!editor.commit()) { failedInProcess = true; throw Unavailable() }
    } catch (_: Throwable) { failedInProcess = true; throw Unavailable() }
  }
  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private fun existingKey(): SecretKey {
    val value = keyStore().getKey(KEY_ALIAS, null) ?: throw CorruptRecord()
    if (value !is SecretKey || value.algorithm != KeyProperties.KEY_ALGORITHM_AES || value.encoded != null) throw CorruptRecord()
    return value
  }
  private fun encryptionKey(): SecretKey {
    val store = keyStore()
    if (store.containsAlias(KEY_ALIAS)) return existingKey()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .setUserAuthenticationRequired(false)
        .build())
    }.generateKey()
  }
  /** crypto-shred first: even an uncertain prefs commit must not leave an old
   * refresh decryptable after a successful key deletion and a process restart. */
  private fun erase(nextEpoch: Long) {
    var keyDeleted = false
    var diskCommitted = false
    try { keyStore().deleteEntry(KEY_ALIAS); keyDeleted = true } catch (_: Throwable) { }
    try { diskCommitted = preferences.edit().clear().putLong(EPOCH, nextEpoch).commit() } catch (_: Throwable) { }
    if (!keyDeleted || !diskCommitted) { failedInProcess = true; throw Unavailable() }
  }
  private fun decodeRecord(): Record? {
    if (!storageKeys.containsAll(preferences.all.keys)) throw CorruptRecord()
    val ivText = try { preferences.getString(IV, null) } catch (_: ClassCastException) { throw CorruptRecord() }
    val cipherText = try { preferences.getString(CIPHERTEXT, null) } catch (_: ClassCastException) { throw CorruptRecord() }
    if (ivText == null && cipherText == null) return null
    if (ivText == null || cipherText == null || ivText.length > 32 || cipherText.length > 16384) throw CorruptRecord()
    val iv: ByteArray
    val encrypted: ByteArray
    try { iv = Base64.decode(ivText, Base64.NO_WRAP); encrypted = Base64.decode(cipherText, Base64.NO_WRAP) } catch (_: IllegalArgumentException) { throw CorruptRecord() }
    if (iv.size != 12 || encrypted.size < 16 || encrypted.size > MAX_CIPHER_BYTES) throw CorruptRecord()
    var plain: ByteArray? = null
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, existingKey(), GCMParameterSpec(128, iv))
      cipher.updateAAD(aad)
      plain = cipher.doFinal(encrypted)
      val json = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(plain)).toString()
      return Record.fromJson(JSONObject(json))
    } catch (_: AEADBadTagException) { throw CorruptRecord() }
      catch (_: KeyPermanentlyInvalidatedException) { throw CorruptRecord() }
      catch (_: CharacterCodingException) { throw CorruptRecord() }
      catch (_: JSONException) { throw CorruptRecord() }
      catch (_: InvalidInput) { throw CorruptRecord() }
    finally { plain?.fill(0) }
  }

  fun claim(): Claim = synchronized(gate) {
    ready()
    val acquired = next(epoch())
    val record = try { decodeRecord() } catch (_: CorruptRecord) {
      // Auth must perform a new verified login after damaged/missing-key data.
      // Transient keystore/IO failures are NOT classified as corruption here.
      erase(acquired)
      return@synchronized Claim(acquired, null)
    }
    committed(preferences.edit().putLong(EPOCH, acquired))
    Claim(acquired, record)
  }
  fun save(expectedEpoch: Long, record: Record): Boolean = synchronized(gate) {
    ready()
    if (expectedEpoch < 1L || expectedEpoch > MAX_EPOCH) throw InvalidInput()
    if (epoch() != expectedEpoch) return@synchronized false
    // Re-admit even backend callers; no mutable or foreign-project record.
    Record.create(record.projectRef, record.userId, record.refreshToken)
    val plain = record.json().toString().toByteArray(StandardCharsets.UTF_8)
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
      cipher.updateAAD(aad)
      val encrypted = cipher.doFinal(plain)
      val iv = cipher.iv
      if (iv.size != 12 || encrypted.size > MAX_CIPHER_BYTES) throw Unavailable()
      committed(preferences.edit().clear().putLong(EPOCH, expectedEpoch).putString(IV, Base64.encodeToString(iv, Base64.NO_WRAP)).putString(CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP)))
      true
    } finally { plain.fill(0) }
  }
  fun clear(expectedEpoch: Long): Boolean = synchronized(gate) {
    ready()
    if (expectedEpoch < 1L || expectedEpoch > MAX_EPOCH) throw InvalidInput()
    val current = epoch()
    if (current != expectedEpoch) return@synchronized false
    // Exhaustion must still crypto-shred a matching owner, even though no next
    // JS-safe owner can be issued. Report unavailable rather than reuse an epoch.
    if (current == MAX_EPOCH) { erase(current); failedInProcess = true; throw Unavailable() }
    erase(next(current))
    true
  }
}
