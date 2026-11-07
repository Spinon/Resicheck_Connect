package com.resicheck.connect.selectionprobe;

import android.app.Activity;
import android.content.res.Configuration;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.InputType;
import android.util.Log;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Emulator-only synthetic control. Logs counts/indices, never text or clipboard. */
public abstract class ProbeActivity extends Activity {
    private static int instances;
    private final int instance = ++instances;
    private int configurations, sequence;
    private ProbeInput input;
    private boolean ready;

    protected void record(String event, String extra, int first, int second, boolean stack) {
        if (!ready) return;
        try {
            JSONObject value = new JSONObject();
            value.put("event", event).put("sequence", ++sequence).put("elapsedMs", SystemClock.elapsedRealtime());
            value.put("activity", getClass().getSimpleName()).put("activityInstance", instance).put("configurations", configurations);
            value.put("inputInstance", System.identityHashCode(input)).put("length", input.length());
            value.put("selectionStart", input.getSelectionStart()).put("selectionEnd", input.getSelectionEnd()).put("focused", input.hasFocus());
            value.put("width", input.getWidth()).put("height", input.getHeight()).put("inputType", input.getInputType());
            if (extra != null) value.put(extra + "First", first).put(extra + "Second", second);
            if (stack) {
                StringBuilder frames = new StringBuilder();
                StackTraceElement[] trace = new Throwable().getStackTrace();
                for (int i=0; i<Math.min(trace.length, 18); i++) frames.append(trace[i].toString()).append("\n");
                value.put("stack", frames.toString());
            }
            Log.i("ConnectSelectionProbe", value.toString());
        } catch (Exception error) { throw new IllegalStateException("Synthetic probe logging failed", error); }
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(24,90,24,24); root.setFitsSystemWindows(true);
        TextView title = new TextView(this); title.setText("SYNTHETIC SELECTION CONTROL - " + getClass().getSimpleName()); root.addView(title);
        TextView notice = new TextView(this); notice.setText("Local indices/counts only. No accounts, network or clipboard."); root.addView(notice);
        input = new ProbeInput(); input.setId(1001); // Stable ID allows Android's normal view-state restoration.
        input.setContentDescription("Synthetic selection probe input"); input.setHint("Synthetic ASCII only");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMinLines(4); input.setMaxLines(6); root.addView(input,new LinearLayout.LayoutParams(-1,-2));
        setContentView(root); ready=true; record("activity-create", "savedState", saved==null?0:1, 0, false);
    }
    @Override public void onConfigurationChanged(Configuration config) {
        record("activity-config-before",null,0,0,false); super.onConfigurationChanged(config); configurations++; record("activity-config-after",null,0,0,false);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); record("window-focus","windowFocus",focus?1:0,0,false); }
    @Override protected void onDestroy() { record("activity-destroy",null,0,0,false); super.onDestroy(); }
    private final class ProbeInput extends EditText {
        private int previousStart=-1, previousEnd=-1;
        ProbeInput() { super(ProbeActivity.this); }
        @Override protected void onSelectionChanged(int start,int end) {
            super.onSelectionChanged(start,end);
            boolean collapsed=previousStart!=previousEnd && previousStart>=0 && start==end;
            record("selection-changed","previousSelection",previousStart,previousEnd,collapsed);
            previousStart=start;previousEnd=end;
        }
        @Override protected void onSizeChanged(int width,int height,int oldWidth,int oldHeight) { super.onSizeChanged(width,height,oldWidth,oldHeight);record("input-size","oldSize",oldWidth,oldHeight,false); }
        @Override protected void onConfigurationChanged(Configuration config) { record("input-config-before",null,0,0,false);super.onConfigurationChanged(config);record("input-config-after",null,0,0,false); }
        @Override public InputConnection onCreateInputConnection(EditorInfo info) {
            InputConnection base=super.onCreateInputConnection(info);record("input-connection-created","initialSelection",info.initialSelStart,info.initialSelEnd,false);
            if(base==null)return null;
            return new InputConnectionWrapper(base,false) {
                @Override public boolean setSelection(int start,int end) { record("ic-set-selection-before","requestedSelection",start,end,false);boolean answer=super.setSelection(start,end);record("ic-set-selection-after","requestedSelection",start,end,false);return answer; }
                @Override public boolean finishComposingText() { record("ic-finish-composing-before",null,0,0,false);boolean answer=super.finishComposingText();record("ic-finish-composing-after",null,0,0,false);return answer; }
            };
        }
    }
}
