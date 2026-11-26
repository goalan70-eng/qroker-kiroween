package com.qroker.offline;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
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
import android.view.WindowManager;
import android.view.TextureView;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.HorizontalScrollView;
import android.widget.PopupMenu;
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
    private TextView total, scanStatus, result;
    private LinearLayout home, scanner, frames;
    private HorizontalScrollView scoreStrip;
    private Button scan, permission, menu;
    private AlertDialog prediction;
    private EditText guess;
    private boolean resumed, scanning;
    private AimGuide guide;
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
            // Keep the journal intact if it cannot be read.
        }
        createScreen();
        if (game == null) {
            result.setText("저장된 기록을 읽을 수 없습니다");
            scan.setEnabled(false);
            menu.setEnabled(false);
        } else {
            showHistory();
        }
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    /** The corners are an aiming aid. They do not restrict the area the decoder reads. */
    private final class AimGuide extends View {
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);

        AimGuide() {
            super(MainActivity.this);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            stroke.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override protected void onDraw(Canvas canvas) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float half = Math.min(cx, cy) * .53f;
            float tip = Math.min(dp(17), half * .3f);
            for (int layer = 0; layer < 2; layer++) {
                stroke.setColor(layer == 0 ? 0xaa12231e : isActivated() ? ACCENT : Color.WHITE);
                stroke.setStrokeWidth(dp(layer == 0 ? 4 : 2));
                for (int x = -1; x <= 1; x += 2) for (int y = -1; y <= 1; y += 2) {
                    float a = cx + x * half, b = cy + y * half;
                    canvas.drawLine(a, b, a - x * tip, b, stroke);
                    canvas.drawLine(a, b, a, b - y * tip, stroke);
                }
            }
        }
    }

    private void setLabel(TextView label, String value) {
        if (!android.text.TextUtils.equals(label.getText(), value)) label.setText(value);
    }

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

        home = column();
        scanner = column();
        scanner.setVisibility(View.GONE);
        add(body, home, -2, 0);
        add(body, scanner, -2, 0);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("내 점수판", 24, INK);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        total = text("총점 0점", 20, ACCENT);
        header.addView(total);
        menu = new Button(this, null, android.R.attr.borderlessButtonStyle);
        menu.setText("⋮");
        menu.setTextSize(24);
        menu.setContentDescription("점수판 메뉴");
        header.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(48)));
        menu.setOnClickListener(v -> {
            PopupMenu options = new PopupMenu(this, menu);
            options.getMenu().add("새 게임").setEnabled(!game.history().isEmpty());
            options.setOnMenuItemClickListener(item -> { confirmReset(); return true; });
            options.show();
        });
        add(home, header, -2, 0);

        LinearLayout board = new LinearLayout(this);
        board.setBackground(background(PANEL, 12));
        board.setPadding(dp(4), dp(8), dp(4), dp(8));
        board.addView(scoreColumn("회차", "획득", "누계", false));
        scoreStrip = new HorizontalScrollView(this);
        frames = new LinearLayout(this);
        scoreStrip.addView(frames);
        board.addView(scoreStrip, new LinearLayout.LayoutParams(0, -2, 1));
        add(home, board, -2, 8);
        scan = new Button(this);
        scan.setText("코드 인식");
        scan.setTextColor(0xff10261b);
        scan.setBackgroundTintList(ColorStateList.valueOf(ACCENT));
        scan.setOnClickListener(v -> {
            scanning = true;
            home.setVisibility(View.GONE);
            scanner.setVisibility(View.VISIBLE);
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED && !askedPermission())
                authorize();
            else startCamera();
        });
        add(home, scan, 52, 14);
        result = text("", 16, MUTED);
        result.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(home, result, -2, 8);

        FrameLayout viewfinder = new FrameLayout(this);
        viewfinder.setBackground(background(PANEL, 16));
        viewfinder.setClipToOutline(true);
        preview = new TextureView(this);
        preview.setContentDescription("카드 판독 카메라 미리보기");
        viewfinder.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        guide = new AimGuide();
        guide.setVisibility(View.GONE);
        viewfinder.addView(guide, new FrameLayout.LayoutParams(-1, -1));
        permission = new Button(this);
        permission.setText("카메라 권한 허용");
        permission.setOnClickListener(v -> authorize());
        permission.setVisibility(View.GONE);
        viewfinder.addView(permission, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        add(scanner, viewfinder, 275, 0);
        scanStatus = text("", 17, INK);
        scanStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(scanner, scanStatus, -2, 12);
        Button cancelScan = new Button(this);
        cancelScan.setText("점수판으로");
        cancelScan.setOnClickListener(v -> finishScan());
        add(scanner, cancelScan, 48, 12);

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
        if (!scanning || !resumed || !preview.isAvailable() || camera != null || game == null) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            scanStatus.setText("카드 판독에 카메라 권한이 필요합니다");
            permission.setText("카메라 권한 허용");
            permission.setOnClickListener(v -> authorize());
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
        permission.setOnClickListener(v -> startCamera());
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

    @Override public void onBackPressed() {
        if (scanning) finishScan();
        else super.onBackPressed();
    }

    private void finishScan() {
        scanning = false;
        stopCamera();
        scanner.setVisibility(View.GONE);
        home.setVisibility(View.VISIBLE);
    }

    private void stopCamera() {
        LiveCamera old = camera;
        camera = null;
        if (old != null) old.close();
        main.removeCallbacks(expiration);
        newestFrame = 0;
        displayed = null;
        if (game != null) game.observe(null, SystemClock.elapsedRealtime());
        closePrediction();
        guide.setVisibility(View.GONE);
    }

    private void onReading(LiveCamera source, int[] ids, long time, long confirmation) {
        if (source != camera || !scanning || time < newestFrame) return;
        long now = SystemClock.elapsedRealtime();
        boolean fresh = now - time < GameScore.FRESH_MS;
        newestFrame = time;
        main.removeCallbacks(expiration);
        if (fresh && ids != null)
            main.postDelayed(expiration, GameScore.FRESH_MS + 1 - (now - time));
        showReading(fresh ? ids : null, time);
        if (fresh && confirmation != 0) recordConfirmedGuess(confirmation);
    }

    private void expire() {
        long now = SystemClock.elapsedRealtime();
        if (now - newestFrame >= GameScore.FRESH_MS) showReading(null, now);
    }

    private void showReading(int[] ids, long time) {
        if (!Arrays.equals(displayed, ids)) closePrediction();
        displayed = ids;
        game.observe(ids, time);
        long now = SystemClock.elapsedRealtime();
        guide.setVisibility(View.VISIBLE);
        guide.setActivated(game.visible(now));
        if (game.ready(now)) {
            setLabel(scanStatus, "카드 네 장을 읽었습니다");
            if (prediction == null) openPrediction();
        } else {
            closePrediction();
            setLabel(scanStatus, game.visible(now) ? "이미 기록한 조합입니다. 다른 코드를 비춰 주세요."
                    : "네 장이 만나는 가운데 무늬를 비춰 주세요.");
        }
    }

    private void closePrediction() {
        if (prediction != null) prediction.dismiss();
        prediction = null;
        guess = null;
    }

    private void openPrediction() {
        LinearLayout field = column();
        field.setPadding(dp(24), dp(4), dp(24), 0);
        guess = new EditText(this);
        guess.setSingleLine(true);
        guess.setInputType(InputType.TYPE_CLASS_NUMBER);
        guess.setFilters(new InputFilter[]{new InputFilter.LengthFilter(2)});
        guess.setHint("예측 합계 (4~52)");
        guess.setImeOptions(EditorInfo.IME_ACTION_DONE);
        guess.setOnEditorActionListener((v, id, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (id != EditorInfo.IME_ACTION_DONE && !enter) return false;
            if (event == null || event.getAction() == KeyEvent.ACTION_UP) saveGuess();
            return true;
        });
        add(field, guess, -2, 0);
        prediction = new AlertDialog.Builder(this)
                .setTitle((game.history().size() + 1) + "회차 예측")
                .setMessage("같은 코드를 비춘 채 네 장의 합계를 입력하세요.")
                .setView(field)
                .setNegativeButton("취소", (dialog, which) -> finishScan())
                .setPositiveButton("확정", null)
                .create();
        prediction.setOnCancelListener(dialog -> finishScan());
        prediction.setCanceledOnTouchOutside(false);
        prediction.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        prediction.show();
        prediction.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> saveGuess());
        guess.requestFocus();
    }

    private void saveGuess() {
        long now = SystemClock.elapsedRealtime();
        if (prediction == null || camera == null || game.awaitingConfirmation()) return;
        if (!game.ready(now)) { showReading(null, now); return; }
        int value;
        try {
            value = Integer.parseInt(guess.getText().toString());
        } catch (NumberFormatException e) {
            value = -1;
        }
        if (!GameScore.validGuess(value)) { guess.setError("4~52 사이의 숫자를 입력하세요"); return; }
        long request = game.requestSubmission(value, now);
        if (request == 0) return;
        prediction.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        guess.setEnabled(false);
        prediction.setMessage("같은 조합인지 확인하고 있습니다.");
        camera.requestConfirmation(request);
        main.postDelayed(() -> {
            if (game.cancelSubmission(request)) allowRetry("코드를 비춘 채 다시 확정해 주세요.");
        }, GameScore.CONFIRM_MS);
    }

    private void allowRetry(String message) {
        if (prediction == null) return;
        guess.setEnabled(true);
        prediction.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
        prediction.setMessage(message);
    }

    private void recordConfirmedGuess(long request) {
        try {
            boolean pending = game.awaitingConfirmation();
            GameScore.Round round = game.confirmSubmission(request, SystemClock.elapsedRealtime());
            if (round == null) {
                if (pending && !game.awaitingConfirmation()) allowRetry("코드를 비춘 채 다시 확정해 주세요.");
                return;
            }
            finishScan();
            showHistory();
        } catch (IOException e) {
            allowRetry("저장하지 못했습니다. 다시 확정해 주세요.");
        }
    }

    private LinearLayout scoreColumn(String number, String earned, String cumulative, boolean latest) {
        LinearLayout col = column();
        col.setPadding(dp(2), 0, dp(2), 0);
        int columnWidth = Math.max(dp(44), Math.min(dp(64),
                (getResources().getDisplayMetrics().widthPixels - dp(44)) / 6));
        if (latest) col.setBackground(background(0xff32483e, 6));
        String[] values = {number, earned, cumulative};
        for (int i = 0; i < values.length; i++) {
            TextView cell = text(values[i], i == 2 ? 18 : 14, i == 2 ? INK : MUTED);
            cell.setGravity(Gravity.CENTER);
            if (i == 2) cell.setTypeface(Typeface.DEFAULT_BOLD);
            col.addView(cell, new LinearLayout.LayoutParams(columnWidth - dp(4), -2));
        }
        return col;
    }

    private void showHistory() {
        List<GameScore.Round> rounds = game.history();
        total.setText("총점 " + game.total() + "점");
        frames.removeAllViews();
        int cumulative = 0;
        for (int i = 0; i < Math.max(5, rounds.size()); i++) {
            GameScore.Round round = i < rounds.size() ? rounds.get(i) : null;
            if (round != null) cumulative += round.points;
            LinearLayout col = scoreColumn((i + 1) + "", round == null ? "–" : "+" + round.points,
                    round == null ? "–" : String.valueOf(cumulative), i == rounds.size() - 1);
            if (round != null) {
                String roundTitle = (i + 1) + "회차";
                col.setContentDescription(roundTitle + ", 획득 " + round.points + "점, 누계 " + cumulative + "점");
                col.setFocusable(true);
                col.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle(roundTitle)
                        .setMessage("내 예측 " + round.guess + "   정답 " + round.actual + "   +" + round.points + "점")
                        .setPositiveButton("닫기", null).show());
            }
            frames.addView(col);
        }
        if (!rounds.isEmpty()) {
            GameScore.Round last = rounds.get(rounds.size() - 1);
            result.setText(rounds.size() + "회차 · 내 예측 " + last.guess + "   정답 " + last.actual + "   +" + last.points + "점");
            View latest = frames.getChildAt(rounds.size() - 1);
            scoreStrip.post(() -> scoreStrip.scrollTo(Math.max(0, latest.getRight() - scoreStrip.getWidth()), 0));
        } else {
            result.setText("");
            scoreStrip.scrollTo(0, 0);
        }
    }

    private void confirmReset() {
        new AlertDialog.Builder(this).setTitle("새 게임을 시작할까요?")
                .setMessage("이번 게임의 점수와 인식한 코드 기록을 지웁니다.")
                .setNegativeButton("취소", null).setPositiveButton("새 게임", (dialog, which) -> {
                    try { game.reset(); showHistory(); }
                    catch (IOException e) { Toast.makeText(this, "기록을 지우지 못했습니다.", Toast.LENGTH_LONG).show(); }
                }).show();
    }
}
