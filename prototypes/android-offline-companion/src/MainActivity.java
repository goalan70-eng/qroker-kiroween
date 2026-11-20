package com.qroker.offline;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int CAMERA_PERMISSION = 1;
    private static final int BACKGROUND = 0xff12191a, PANEL = 0xff202a2b, INK = 0xfff0f5f2;
    private static final int MUTED = 0xffa9beb7, ACCENT = 0xffa9e6c4;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final OpticalReader recognizer = new OpticalReader();
    private GameScore game;
    private LiveCamera camera;
    private TextureView preview;
    private TextView total, scanStatus, heading, result;
    private LinearLayout history, form;
    private EditText guess;
    private Button permission, submit, reset;
    private boolean resumed, canOpenCamera = true;
    private int[] displayed;
    private long newestFrame;
    private final Runnable expiration = this::expire;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        try {
            game = new GameScore(new File(getFilesDir(), "personal-game.csv"));
        } catch (IOException e) {
            canOpenCamera = false;
        }
        createScreen();
        if (game == null) {
            scanStatus.setText("저장된 기록을 읽을 수 없습니다");
            reset.setEnabled(false);
        } else {
            showHistory();
        }
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private TextView text(String value, int size, int color) {
        TextView label = new TextView(this);
        label.setText(value);
        label.setTextSize(size);
        label.setTextColor(color);
        return label;
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable box = new GradientDrawable();
        box.setColor(color);
        box.setCornerRadius(dp(radius));
        return box;
    }

    private LinearLayout column() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private void add(LinearLayout parent, View view, int height, int gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, height < 0 ? height : dp(height));
        lp.topMargin = dp(gap);
        parent.addView(view, lp);
    }

    private void createScreen() {
        ScrollView page = new ScrollView(this);
        page.setFillViewport(true);
        page.setBackgroundColor(BACKGROUND);
        LinearLayout body = column();
        body.setPadding(dp(18), dp(14), dp(18), dp(20));
        body.setFocusableInTouchMode(true);
        page.addView(body);
        setContentView(page);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("QRoker", 28, INK);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        total = text("총점 0점", 21, ACCENT);
        total.setTypeface(Typeface.DEFAULT_BOLD);
        top.addView(total);
        add(body, top, -2, 0);

        FrameLayout viewfinder = new FrameLayout(this);
        viewfinder.setBackground(background(PANEL, 16));
        viewfinder.setClipToOutline(true);
        preview = new TextureView(this);
        preview.setContentDescription("카드 판독 카메라 미리보기");
        viewfinder.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        permission = new Button(this);
        permission.setText("카메라 권한 허용");
        permission.setOnClickListener(v -> authorize());
        permission.setVisibility(View.GONE);
        viewfinder.addView(permission, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        add(body, viewfinder, 275, 12);
        page.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            int hidden = page.getRootView().getHeight() - page.getHeight();
            int height = dp(hidden > dp(120) ? 145 : 275);
            if (viewfinder.getLayoutParams().height == height) return;
            viewfinder.getLayoutParams().height = height;
            viewfinder.requestLayout();
        });

        scanStatus = text("카드 네 장의 모서리를 맞대세요", 15, MUTED);
        scanStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(body, scanStatus, -2, 9);

        form = column();
        form.setBackground(background(PANEL, 14));
        form.setPadding(dp(14), dp(10), dp(14), dp(8));
        heading = text("", 18, INK);
        add(form, heading, -2, 0);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        guess = new EditText(this);
        guess.setSingleLine(true);
        guess.setTextColor(INK);
        guess.setHintTextColor(MUTED);
        guess.setHint("예측한 합계 (4~52)");
        guess.setInputType(InputType.TYPE_CLASS_NUMBER);
        guess.setFilters(new InputFilter[]{new InputFilter.LengthFilter(2)});
        guess.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        guess.setOnEditorActionListener((v, id, event) -> {
            boolean done = id == android.view.inputmethod.EditorInfo.IME_ACTION_DONE;
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (!done && !enter) return false;
            if (event == null || event.getAction() == KeyEvent.ACTION_UP) saveGuess();
            return true;
        });
        row.addView(guess, new LinearLayout.LayoutParams(0, dp(48), 1));
        submit = new Button(this);
        submit.setText("확정");
        submit.setTextColor(0xff10261b);
        submit.setBackgroundTintList(ColorStateList.valueOf(ACCENT));
        submit.setOnClickListener(v -> saveGuess());
        row.addView(submit);
        add(form, row, -2, 2);
        form.setVisibility(View.GONE);
        add(body, form, -2, 10);
        result = text("", 17, ACCENT);
        result.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        result.setVisibility(View.GONE);
        add(body, result, -2, 8);

        LinearLayout historyHeader = new LinearLayout(this);
        historyHeader.setGravity(Gravity.CENTER_VERTICAL);
        TextView historyTitle = text("개인 기록", 20, INK);
        historyTitle.setTypeface(Typeface.DEFAULT_BOLD);
        historyHeader.addView(historyTitle, new LinearLayout.LayoutParams(0, -2, 1));
        reset = new Button(this);
        reset.setText("기록 삭제");
        reset.setOnClickListener(v -> confirmReset());
        historyHeader.addView(reset);
        add(body, historyHeader, -2, 14);
        history = column();
        add(body, history, -2, 2);

        preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int w, int h) { startCamera(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int w, int h) { transformPreview(); }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { stopCamera(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
        });
    }

    private void authorize() {
        if (askedPermission() && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
            startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.parse("package:" + getPackageName())));
        } else {
            getPreferences(0).edit().putBoolean("asked_camera", true).apply();
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
    }

    private boolean askedPermission() { return getPreferences(0).getBoolean("asked_camera", false); }

    @Override public void onRequestPermissionsResult(int request, String[] names, int[] grants) {
        super.onRequestPermissionsResult(request, names, grants);
        if (request == CAMERA_PERMISSION) startCamera();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        startCamera();
    }

    @Override protected void onPause() {
        resumed = false;
        stopCamera();
        super.onPause();
    }

    private void startCamera() {
        if (!resumed || !preview.isAvailable() || camera != null || !canOpenCamera) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            scanStatus.setText("카드 판독에 카메라 권한이 필요합니다");
            permission.setVisibility(View.VISIBLE);
            return;
        }
        permission.setVisibility(View.GONE);
        scanStatus.setText("카메라 시작 중");
        try {
            camera = new LiveCamera(this, preview.getSurfaceTexture(), recognizer, main,
                    this::onReading, this::cameraError);
            transformPreview();
            camera.start();
        } catch (Exception error) {
            cameraError(camera);
        }
    }

    private void cameraError(LiveCamera source) {
        if (source != camera) return;
        stopCamera();
        scanStatus.setText("카메라를 열 수 없습니다");
        permission.setText("다시 시도");
        permission.setOnClickListener(v -> {
            permission.setText("카메라 권한 허용");
            permission.setOnClickListener(button -> authorize());
            startCamera();
        });
        permission.setVisibility(View.VISIBLE);
    }

    private void transformPreview() {
        if (camera == null || preview.getWidth() == 0 || preview.getHeight() == 0) return;
        int w = preview.getWidth(), h = preview.getHeight();
        int display = getWindowManager().getDefaultDisplay().getRotation() * 90;
        int turn = ((camera.sensorRotation - display + 360) % 360) / 90;
        int pw = (turn % 2 == 0) ? camera.width : camera.height;
        int ph = (turn % 2 == 0) ? camera.height : camera.width;
        float scale = Math.min((float) w / pw, (float) h / ph);
        float x = (w - pw * scale) / 2, y = (h - ph * scale) / 2;
        float[] from = {0, 0, w, 0, w, h, 0, h};
        float[] corners = {x, y, w - x, y, w - x, h - y, x, h - y};
        float[] to = new float[8];
        for (int i = 0; i < 4; i++) {
            to[2 * i] = corners[2 * ((i + turn) % 4)];
            to[2 * i + 1] = corners[2 * ((i + turn) % 4) + 1];
        }
        Matrix matrix = new Matrix();
        matrix.setPolyToPoly(from, 0, to, 0, 4);
        preview.setTransform(matrix);
    }

    private void stopCamera() {
        LiveCamera old = camera;
        camera = null;
        if (old != null) old.close();
        main.removeCallbacks(expiration);
        if (game != null) showReading(null, SystemClock.elapsedRealtime());
    }

    private void onReading(LiveCamera source, int[] ids, long time, long confirmation) {
        if (source != camera) return;
        long now = SystemClock.elapsedRealtime();
        boolean fresh = now - time < GameScore.FRESH_MS;
        newestFrame = time;
        showReading(fresh ? ids : null, time);
        main.removeCallbacks(expiration);
        if (fresh && ids != null)
            main.postDelayed(expiration, GameScore.FRESH_MS + 1 - (now - time));
        if (fresh && confirmation != 0) recordConfirmedGuess(confirmation);
    }

    private void expire() {
        long now = SystemClock.elapsedRealtime();
        if (now - newestFrame >= GameScore.FRESH_MS) showReading(null, now);
    }

    private void showReading(int[] ids, long time) {
        if (!Arrays.equals(displayed, ids)) {
            guess.setText("");
            result.setVisibility(View.GONE);
            displayed = ids;
        }
        game.observe(ids, time);
        updateReading();
    }

    private void updateReading() {
        long now = SystemClock.elapsedRealtime();
        boolean ready = game.ready(now);
        boolean pending = game.awaitingConfirmation();
        if (pending) scanStatus.setText("카드 네 장을 다시 확인하고 있습니다");
        else if (ready) scanStatus.setText("카드 네 장을 읽었습니다");
        else if (game.visible(now)) scanStatus.setText("이미 기록한 조합입니다");
        else scanStatus.setText("카드 네 장의 모서리를 맞대세요");
        form.setVisibility(ready ? View.VISIBLE : View.GONE);
        submit.setEnabled(ready && !pending);
        guess.setEnabled(!pending);
        if (ready) heading.setText((game.history().size() + 1) + "번째 추측");
    }

    private void saveGuess() {
        long now = SystemClock.elapsedRealtime();
        if (game.awaitingConfirmation()) return;
        if (camera == null || !game.ready(now)) {
            showReading(null, SystemClock.elapsedRealtime());
            return;
        }
        int value;
        try {
            value = Integer.parseInt(guess.getText().toString());
        } catch (NumberFormatException e) {
            value = -1;
        }
        if (!GameScore.validGuess(value)) { guess.setError("4~52 사이의 숫자를 입력하세요"); return; }
        long request = game.requestSubmission(value, now);
        if (request == 0) return;
        updateReading();
        camera.requestConfirmation(request);
        main.postDelayed(() -> {
            if (game.cancelSubmission(request)) updateReading();
        }, GameScore.CONFIRM_MS);
    }

    private void recordConfirmedGuess(long request) {
        try {
            GameScore.Round round = game.confirmSubmission(request, SystemClock.elapsedRealtime());
            if (round == null) { updateReading(); return; }
            ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE))
                    .hideSoftInputFromWindow(guess.getWindowToken(), 0);
            result.setText("정답 " + round.actual + "   ·   +" + round.points + "점");
            result.setVisibility(View.VISIBLE);
            updateReading();
            showHistory();
        } catch (IOException e) {
            updateReading();
            Toast.makeText(this, "기록을 저장하지 못했습니다. 다시 시도하세요.", Toast.LENGTH_LONG).show();
        }
    }

    private void showHistory() {
        total.setText("총점 " + game.total() + "점");
        history.removeAllViews();
        List<GameScore.Round> rounds = game.history();
        reset.setEnabled(!rounds.isEmpty());
        if (rounds.isEmpty()) add(history, text("아직 점수 기록이 없습니다", 15, MUTED), -2, 4);
        for (int i = rounds.size() - 1; i >= 0; i--) {
            GameScore.Round round = rounds.get(i);
            TextView line = text((i + 1) + "번째   예측 " + round.guess + "   정답 " + round.actual
                    + "   +" + round.points + "점", 15, INK);
            line.setPadding(dp(12), dp(10), dp(12), dp(10));
            line.setBackground(background(PANEL, 10));
            add(history, line, -2, 4);
        }
    }

    private void confirmReset() {
        new AlertDialog.Builder(this).setTitle("개인 기록을 삭제할까요?")
                .setMessage("이 기기의 추측 기록과 총점이 삭제됩니다.")
                .setNegativeButton("취소", null).setPositiveButton("삭제", (dialog, which) -> {
                    try {
                        game.reset();
                        showReading(null, SystemClock.elapsedRealtime());
                        showHistory();
                    } catch (IOException e) {
                        Toast.makeText(this, "기록을 삭제하지 못했습니다.", Toast.LENGTH_LONG).show();
                    }
                }).show();
    }
}
