package com.resicheck.connect.inputprobe;

import android.app.Activity;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.InputType;
import android.view.View;
import android.view.KeyEvent;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Local synthetic input control. No network, persistence, microphone or permissions. */
public final class MainActivity extends Activity {
    private EditText input;
    private TextView stats;
    private int changes, inserted, removed, previousLength, regressions;
    private int preDown, preUp, activityDown, activityUp, editDown, editUp;
    private final class ProbeEditText extends EditText {
        ProbeEditText() { super(MainActivity.this); }
        @Override public boolean onKeyPreIme(int code, KeyEvent event) {
            if (code == KeyEvent.KEYCODE_A) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) preDown++;
                if (event.getAction() == KeyEvent.ACTION_UP) preUp++;
            }
            return super.onKeyPreIme(code,event);
        }
        @Override public boolean onKeyDown(int code, KeyEvent event) {
            if (code == KeyEvent.KEYCODE_A) editDown++;
            return super.onKeyDown(code,event);
        }
        @Override public boolean onKeyUp(int code, KeyEvent event) {
            if (code == KeyEvent.KEYCODE_A) editUp++;
            return super.onKeyUp(code,event);
        }
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_A) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) activityDown++;
            if (event.getAction() == KeyEvent.ACTION_UP) activityUp++;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 90, 24, 24);
        root.setFitsSystemWindows(true);
        TextView title = new TextView(this);
        title.setText("SYNTHETIC INPUT DIAGNOSTIC - Android EditText only");
        root.addView(title);
        stats = new TextView(this);
        stats.setTextIsSelectable(true);
        root.addView(stats);
        input = new ProbeEditText();
        input.setContentDescription("Synthetic native probe input");
        input.setHint("Synthetic ASCII only");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMinLines(4);
        input.setMaxLines(6);
        root.addView(input, new LinearLayout.LayoutParams(-1, -2));
        input.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                changes++;
                inserted += count;
                removed += before;
                if (s.length() < previousLength) regressions++;
                previousLength = s.length();
            }
            public void afterTextChanged(Editable s) { }
        });
        Button reset = new Button(this);
        reset.setText("Clear synthetic probe");
        reset.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                input.setText(""); changes=inserted=removed=previousLength=regressions=0;
                preDown=preUp=activityDown=activityUp=editDown=editUp=0;
                updateStats(); input.requestFocus();
            }
        });
        root.addView(reset);
        Button read = new Button(this);
        read.setText("Read synthetic statistics");
        read.setFocusable(false);
        read.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { updateStats(); }
        });
        root.addView(read);
        updateStats();
        setContentView(root);
    }
    private void updateStats() {
        String data = "length=" + input.length() + " changes=" + changes + " inserted=" + inserted + " removed=" + removed + " regressions=" + regressions + " preDown=" + preDown + " preUp=" + preUp + " activityDown=" + activityDown + " activityUp=" + activityUp + " editDown=" + editDown + " editUp=" + editUp;
        stats.setText(data);
        stats.setContentDescription("Probe stats " + data);
    }
}
