package com.resicheck.connect.demo

import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/** Isolated opt-in activity for the reusable curtain candidate; original stays untouched. */
class PrivacyActivity : ReactActivity() {
  private var curtain: ConnectPrivacyCurtain?=null
  val privacyCurtain: ConnectPrivacyCurtain get()=curtain ?: throw IllegalStateException("Privacy unavailable")
  override fun onCreate(savedInstanceState: Bundle?) { setTheme(R.style.AppTheme);super.onCreate(null);volumeControlStream=AudioManager.STREAM_MUSIC;curtain=ConnectPrivacyCurtain(this) }
  override fun onContentChanged() { super.onContentChanged();curtain?.onContentChanged() }
  override fun onResume() { super.onResume();curtain?.onResume() }
  override fun onPause() { curtain?.onPause();super.onPause() }
  override fun onWindowFocusChanged(hasFocus: Boolean) { if(!hasFocus) curtain?.onFocus(false);super.onWindowFocusChanged(hasFocus);if(hasFocus)curtain?.onFocus(true) }
  override fun onDestroy() { curtain?.onDestroy();super.onDestroy();curtain=null }
  override fun getMainComponentName(): String = "main"
  override fun createReactActivityDelegate(): ReactActivityDelegate = ReactActivityDelegateWrapper(this,BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,object:DefaultReactActivityDelegate(this,mainComponentName,fabricEnabled){})
  override fun invokeDefaultOnBackPressed() { if(Build.VERSION.SDK_INT<=Build.VERSION_CODES.R){if(!moveTaskToBack(false))super.invokeDefaultOnBackPressed();return};super.invokeDefaultOnBackPressed() }
}
