package com.resicheck.connect.demo

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.widget.ProgressBar
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.content.res.ColorStateList
import android.widget.FrameLayout
import android.widget.TextView
import java.util.concurrent.atomic.AtomicLong

/** Android main-window privacy barrier; not memory erasure or screenshot policy. */
class ConnectPrivacyCurtain(private val activity: Activity) {
  data class State(val epoch: Long, val covered: Boolean, val resumed:Boolean, val focused:Boolean, val heldRootCount:Int, val lastReleaseDecision:String)
  private data class Saved(val view: View, val params: ViewGroup.LayoutParams, val accessibility: Int)
  private class Release(val callback: (Boolean) -> Unit) { var done = false }
  companion object {
    private val sequence = AtomicLong(0)
    private const val MAX_EPOCH = 9007199254740991L
    const val COVER_TAG = "connect-native-privacy-cover"
    const val READY_PREFIX = "connect-private-ready-"
  }
  private val main = Handler(Looper.getMainLooper())
  private val root = activity.findViewById<ViewGroup>(android.R.id.content)
  private val saved = ArrayList<Saved>()
  private val pending = ArrayList<Release>()
  var requestRetry: (() -> Unit)? = null
  private val coverView = FrameLayout(activity).apply {
    tag = COVER_TAG
    setBackgroundColor(Color.rgb(245,249,246))
    isClickable = true
    isFocusable = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = "ResiCheck Connect, tela protegida"
    elevation = 1000f
    addView(LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      val padding = (24f * activity.resources.displayMetrics.density).toInt()
      setPadding(padding,padding,padding,padding)
      addView(TextView(activity).apply {
        text = "ResiCheck Connect"
        textSize = 22f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        gravity = Gravity.CENTER
        setTextColor(Color.rgb(24,92,69))
      }, LinearLayout.LayoutParams(-1,-2))
      addView(TextView(activity).apply {
        text = "Empresas ao seu alcance."
        textSize = 14f
        gravity = Gravity.CENTER
        setTextColor(Color.rgb(82,103,90))
      }, LinearLayout.LayoutParams(-1,-2).apply { topMargin = padding / 4 })
      addView(ProgressBar(activity, null, android.R.attr.progressBarStyleSmall).apply {
        isIndeterminate = true
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "Carregando"
        indeterminateTintList = ColorStateList.valueOf(Color.rgb(24,92,69))
      }, LinearLayout.LayoutParams(padding,padding).apply { topMargin = padding + padding / 2; gravity = Gravity.CENTER_HORIZONTAL })
      addView(Button(activity).apply {
        text = "Tentar novamente"
        textSize = 16f
        minHeight = (48f * activity.resources.displayMetrics.density).toInt()
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        isAllCaps = false
        background = GradientDrawable().apply {
          setColor(Color.rgb(255,255,255))
          cornerRadius = 12f * activity.resources.displayMetrics.density
          setStroke((activity.resources.displayMetrics.density).toInt().coerceAtLeast(1), Color.rgb(183,201,191))
        }
        setTextColor(Color.rgb(24,92,69))
        setOnClickListener {
          // Request a fresh guarded handshake. Keep private roots hidden; never release
          // the curtain. Background/blur/stale Activity cannot dispatch input.
          if(covered && eligible(epoch)) requestRetry?.invoke()
        }
      }, LinearLayout.LayoutParams((160f * activity.resources.displayMetrics.density).toInt(),-2).apply { topMargin = padding; gravity = Gravity.CENTER_HORIZONTAL })
    }, FrameLayout.LayoutParams(-1,-1))
  }
  private var epoch = 0L
  private var covered = true
  private var resumed = false
  private var focused = false
  private var destroyed = false
  private var exhausted = false
  private var lastReleaseDecision = "none"
  init { cover() }
  private fun ui() { check(Looper.myLooper() === Looper.getMainLooper()) }
  fun getState(): State { ui(); return State(epoch,covered,resumed,focused,saved.size,lastReleaseDecision) }
  private fun finish(job: Release, value: Boolean) {
    if(job.done) return
    job.done = true
    pending.remove(job)
    job.callback(value)
  }
  private fun invalidate() {
    if(sequence.get() >= MAX_EPOCH) { exhausted = true; epoch = MAX_EPOCH }
    else epoch = sequence.incrementAndGet()
    for(job in pending.toList()) finish(job,false)
  }
  private fun detachAndCover() {
    val children = (0 until root.childCount).map { root.getChildAt(it) }.filter { it !== coverView }
    for(child in children) {
      if(saved.none { it.view === child }) saved.add(Saved(child,child.layoutParams,child.importantForAccessibility))
      root.removeView(child)
    }
    if(coverView.parent !== root) {
      (coverView.parent as? ViewGroup)?.removeView(coverView)
      root.addView(coverView,FrameLayout.LayoutParams(-1,-1))
    }
    coverView.visibility = View.VISIBLE
    coverView.bringToFront()
    covered = true
  }
  private fun prepareUnderCover() {
    if(destroyed || exhausted || !resumed || !focused || !covered) return
    for(entry in saved) {
      entry.view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      if(entry.view.parent == null) root.addView(entry.view,0,entry.params)
    }
    coverView.bringToFront()
    root.requestLayout()
  }
  fun cover(): State {
    ui()
    invalidate()
    detachAndCover()
    prepareUnderCover()
    return getState()
  }
  fun invalidateOwned(expected: Long): Boolean {
    ui()
    if(destroyed || expected!=epoch) return false
    cover()
    return true
  }
  fun onResume() { ui(); resumed=true; focused=activity.hasWindowFocus();prepareUnderCover() }
  fun onPause() { ui(); resumed=false; cover() }
  fun onFocus(value: Boolean) { ui(); focused=value; if(!value) cover() else prepareUnderCover() }
  fun onContentChanged() {
    ui()
    if(!covered) { cover(); return }
    // A replacement content tree cannot inherit a release for the old surface.
    if(coverView.parent !== root) { invalidate(); saved.clear() }
    detachAndCover();prepareUnderCover()
  }
  fun onDestroy() { ui(); destroyed=true; requestRetry=null; resumed=false; focused=false; invalidate(); saved.clear() }
  private fun eligible(expected: Long): Boolean = !destroyed && !exhausted && resumed && focused && activity.hasWindowFocus() && expected==epoch
  private fun marker(view: View, expected: Long): Boolean {
    if(view === coverView) return false
    if(view.getTag(com.facebook.react.R.id.view_tag_native_id) == READY_PREFIX+expected.toString()
      && view.isAttachedToWindow && view.isLaidOut && view.width>0 && view.height>0) return true
    if(view is ViewGroup) for(i in 0 until view.childCount) if(marker(view.getChildAt(i),expected)) return true
    return false
  }
  /** Holds the opaque cover until current React marker is mounted and two frames pass. */
  fun release(expected: Long, callback: (Boolean)->Unit) {
    ui()
    if(!eligible(expected)) { lastReleaseDecision="epoch-or-lifecycle-denied";callback(false); return }
    if(!covered) { lastReleaseDecision="already-visible";callback(true); return }
    val job=Release(callback)
    pending.add(job)
    val deadline=SystemClock.uptimeMillis()+2500
    fun valid(): Boolean = !job.done && eligible(expected) && covered
    fun commit() {
      if(!valid() || !marker(root,expected)) { lastReleaseDecision="frame-guard-denied";finish(job,false); return }
      root.removeView(coverView)
      for(entry in saved) entry.view.importantForAccessibility=entry.accessibility
      saved.clear()
      covered=false
      lastReleaseDecision="released-current-marker"
      finish(job,true)
    }
    fun poll() {
      if(job.done) return
      if(!valid() || SystemClock.uptimeMillis()>deadline) { lastReleaseDecision=if(!valid()) "epoch-or-lifecycle-denied" else "marker-timeout";finish(job,false); return }
      if(marker(root,expected)) { lastReleaseDecision="marker-seen-awaiting-frames";root.postOnAnimation { if(valid()) root.postOnAnimation { commit() } else finish(job,false) } }
      else main.postDelayed({ poll() },16)
    }
    // Deadline also resolves if frame callbacks stop after a lifecycle transition.
    main.postDelayed({ if(!job.done) { lastReleaseDecision="frame-deadline";finish(job,false) } },2600)
    poll()
  }
}
