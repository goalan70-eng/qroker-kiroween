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
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.TextureView;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
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
    private List<GameScore.Round> displayedRounds;
    private LiveCamera camera;
    private TextureView preview;
    private TextView total, scanStatus, result;
    private LinearLayout scanner, frames;
    private HorizontalScrollView scoreStrip;
    private Button scan, permission, permissionSettings, menu;
    private AlertDialog prediction;
    private int predictionRound;
    private EditText guess;
    private long waitingForInputSince = -1;
    private boolean resumed, scanning;
    private boolean offerPermissionSettings;
    private AimGuide guide;
    private int[] displayed;
    private long newestFrame;
    private final Runnable expiration = this::expire;

    private static final String PREFS = "interface";
    private static final String LANGUAGE = "language";

    @Override protected void attachBaseContext(Context base) {
        String language = base.getSharedPreferences(PREFS, MODE_PRIVATE).getString(LANGUAGE, "en");
        android.content.res.Configuration config = new android.content.res.Configuration(base.getResources().getConfiguration());
        config.setLocale("ko".equals(language) ? java.util.Locale.KOREAN : java.util.Locale.ENGLISH);
        super.attachBaseContext(base.createConfigurationContext(config));
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        createScreen();
    }

    private void openScoreboard() {
        try {
            game = new GameScore(new File(getFilesDir(), "personal-game.csv"));
        } catch (IOException e) {
            total.setVisibility(View.GONE);
            result.setText(getString(R.string.history_unreadable));
            scan.setEnabled(false);
            return;
        }
        total.setVisibility(View.VISIBLE);
        scan.setEnabled(true);
        int recovered = game.takeRecoveryCount();
        if (game.repairPending()) new AlertDialog.Builder(this)
                .setTitle(getString(R.string.recovery_pending))
                .setMessage(getString(R.string.recovery_pending_detail))
                .setPositiveButton(getString(R.string.ok), null).show();
        else if (recovered > 0) new AlertDialog.Builder(this)
                .setTitle(getString(R.string.recovered))
                .setMessage(getString(R.string.recovered_detail, recovered))
                .setPositiveButton(getString(R.string.ok), null).show();
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private final class AimGuide extends View {
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float half;

        AimGuide() {
            super(MainActivity.this);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            stroke.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override protected void onDraw(Canvas canvas) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float tip = Math.min(dp(17), half * .3f);
            for (int layer = 0; layer < 2; layer++) {
                stroke.setColor(layer == 0 ? 0xaa12231e : isActivated() ? ACCENT : Color.WHITE);
                stroke.setStrokeWidth(dp(layer == 0 ? 4 : 2));
                canvas.drawLine(cx - dp(4), cy, cx + dp(4), cy, stroke);
                canvas.drawLine(cx, cy - dp(4), cx, cy + dp(4), stroke);
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

        scanner = column();
        scanner.setVisibility(View.GONE);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(getString(R.string.scoreboard), 24, INK);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        total = text(getString(R.string.total_score, 0), 20, ACCENT);
        header.addView(total);
        Button help = new Button(this, null, android.R.attr.borderlessButtonStyle);
        help.setText("?");
        help.setTextSize(22);
        help.setContentDescription(getString(R.string.game_help_title));
        header.addView(help, new LinearLayout.LayoutParams(dp(48), dp(48)));
        help.setOnClickListener(v -> {
            if (scanning) finishScan();
            new AlertDialog.Builder(this)
                    .setTitle(R.string.game_help_title)
                    .setMessage(R.string.game_help_body)
                    .setPositiveButton(R.string.close, null).show();
        });
        menu = new Button(this, null, android.R.attr.borderlessButtonStyle);
        menu.setText("⋮");
        menu.setTextSize(24);
        menu.setContentDescription(getString(R.string.score_menu));
        header.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(48)));
        menu.setOnClickListener(v -> {
            if (scanning) finishScan();
            PopupMenu options = new PopupMenu(this, menu);
            options.getMenu().add(getString(R.string.new_game)).setEnabled(game != null && !game.history().isEmpty())
                    .setOnMenuItemClickListener(item -> { confirmReset(); return true; });
            boolean korean = "ko".equals(getResources().getConfiguration().getLocales().get(0).getLanguage());
            options.getMenu().add(korean ? "English" : "한국어").setOnMenuItemClickListener(item -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(LANGUAGE, korean ? "en" : "ko").apply();
                recreate();
                return true;
            });
            options.show();
        });
        add(body, header, -2, 0);

        LinearLayout board = new LinearLayout(this);
        board.setBackground(background(PANEL, 12));
        board.setPadding(dp(4), dp(8), dp(4), dp(8));
        board.addView(scoreColumn(getString(R.string.round), getString(R.string.earned), getString(R.string.total), false));
        scoreStrip = new HorizontalScrollView(this);
        frames = new LinearLayout(this);
        scoreStrip.addView(frames);
        board.addView(scoreStrip, new LinearLayout.LayoutParams(0, -2, 1));
        add(body, board, -2, 8);
        scan = new Button(this);
        scan.setText(getString(R.string.scan));
        scan.setTextColor(0xff10261b);
        scan.setBackgroundTintList(ColorStateList.valueOf(ACCENT));
        scan.setOnClickListener(v -> {
            if (scanning) {
                finishScan();
                return;
            }
            scanning = true;
            scan.setText(R.string.close_camera);
            scanner.setVisibility(View.VISIBLE);
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED && !offerPermissionSettings)
                authorize();
            else startCamera();
        });
        add(body, scan, 52, 14);
        add(body, scanner, -2, 8);
        result = text("", 16, MUTED);
        result.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(body, result, -2, 8);

        FrameLayout viewfinder = new FrameLayout(this);
        viewfinder.setBackground(background(PANEL, 16));
        viewfinder.setClipToOutline(true);
        preview = new TextureView(this);
        preview.setContentDescription(getString(R.string.preview));
        viewfinder.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        guide = new AimGuide();
        guide.setVisibility(View.GONE);
        viewfinder.addView(guide, new FrameLayout.LayoutParams(-1, -1));
        permission = new Button(this);
        permission.setVisibility(View.GONE);
        viewfinder.addView(permission, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        add(scanner, viewfinder, 275, 0);
        scanStatus = text("", 17, INK);
        scanStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(scanner, scanStatus, -2, 12);
        permissionSettings = new Button(this);
        permissionSettings.setText(getString(R.string.allow_settings));
        permissionSettings.setVisibility(View.GONE);
        permissionSettings.setOnClickListener(v -> startActivity(new android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + getPackageName()))));
        add(scanner, permissionSettings, 48, 8);

        preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int w, int h) { startCamera(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int w, int h) { transformPreview(); }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { stopCamera(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
        });
    }

    private void authorize() {
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
    }

    @Override public void onRequestPermissionsResult(int request, String[] names, int[] grants) {
        super.onRequestPermissionsResult(request, names, grants);
        if (request != CAMERA_PERMISSION) return;
        offerPermissionSettings = grants.length > 0 && grants[0] == PackageManager.PERMISSION_DENIED
                && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA);
        startCamera();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (game == null) openScoreboard();
        if (game != null) showHistory();
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
            scanStatus.setText(getString(R.string.permission_needed));
            permissionSettings.setVisibility(offerPermissionSettings ? View.VISIBLE : View.GONE);
            permission.setText(R.string.allow_camera);
            permission.setOnClickListener(v -> authorize());
            permission.setVisibility(offerPermissionSettings ? View.GONE : View.VISIBLE);
            return;
        }
        permission.setVisibility(View.GONE);
        permissionSettings.setVisibility(View.GONE);
        offerPermissionSettings = false;
        scanStatus.setText(getString(R.string.starting));
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
        scanStatus.setText(getString(R.string.camera_error));
        permission.setText(getString(R.string.retry));
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
        guide.half = OpticalReader.aimSide(camera.width, camera.height) * scale / 2;
        guide.invalidate();
    }

    @Override public void onBackPressed() {
        if (scanning) finishScan();
        else super.onBackPressed();
    }

    private void finishScan() {
        scanning = false;
        stopCamera();
        scanner.setVisibility(View.GONE);
        scan.setText(R.string.scan);
        showHistory();
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
        if (confirmation != 0 && ids == null && !game.cancelSubmission(confirmation)) return;
        long now = SystemClock.elapsedRealtime();
        boolean fresh = now - time < GameScore.FRESH_MS;
        newestFrame = time;
        main.removeCallbacks(expiration);
        if (fresh && ids != null)
            main.postDelayed(expiration, GameScore.FRESH_MS - (now - time));
        showReading(fresh ? ids : null, time);
        if (fresh && confirmation != 0) recordConfirmedGuess(confirmation);
    }

    private void expire() {
        long now = SystemClock.elapsedRealtime();
        if (now - newestFrame >= GameScore.FRESH_MS) showReading(null, now);
    }

    private void showReading(int[] ids, long time) {
        boolean discardDraft = game.observeForDraft(ids, time);
        if (discardDraft || !Arrays.equals(displayed, ids)) closePrediction();
        displayed = ids;
        long now = SystemClock.elapsedRealtime();
        guide.setVisibility(View.VISIBLE);
        guide.setActivated(game.visible(now));
        if (game.ready(now)) {
            setLabel(scanStatus, getString(R.string.found));
            int nextRound = game.history().size() + 1;
            if (prediction == null) {
                openPrediction(nextRound);
                return;
            }
            if (predictionRound != nextRound) {
                predictionRound = nextRound;
                prediction.setTitle(getString(R.string.guess_title, nextRound));
            }
            if (waitingForInputSince >= 0 && time > waitingForInputSince) {
                // The first dialog and keyboard can take longer to open than a frame remains valid.
                waitingForInputSince = -1;
                prediction.setMessage(getString(R.string.guess_prompt));
                guess.setEnabled(true);
                prediction.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                guess.requestFocus();
                getSystemService(InputMethodManager.class).showSoftInput(guess, InputMethodManager.SHOW_IMPLICIT);
            }
        } else {
            closePrediction();
            setLabel(scanStatus, game.visible(now) ? getString(R.string.duplicate)
                    : getString(R.string.aim));
        }
    }

    private void closePrediction() {
        if (prediction != null) prediction.dismiss();
        prediction = null;
        guess = null;
        waitingForInputSince = -1;
    }

    private void openPrediction(int nextRound) {
        predictionRound = nextRound;
        LinearLayout field = column();
        field.setPadding(dp(24), dp(4), dp(24), 0);
        guess = new EditText(this);
        guess.setSingleLine(true);
        // Offer a numeric keyboard while preserving pasted signs and decimal points for validation.
        guess.setRawInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_SIGNED
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        guess.setHint(getString(R.string.guess_hint));
        guess.setEnabled(false);
        guess.setImeOptions(EditorInfo.IME_ACTION_DONE);
        guess.setOnEditorActionListener((v, id, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (id != EditorInfo.IME_ACTION_DONE && !enter) return false;
            if (event == null || event.getAction() == KeyEvent.ACTION_UP) saveGuess();
            return true;
        });
        add(field, guess, -2, 0);
        prediction = new AlertDialog.Builder(this)
                .setTitle(getString(R.string.guess_title, nextRound))
                .setMessage(getString(R.string.preparing_guess))
                .setView(field)
                .setNegativeButton(getString(R.string.cancel), (dialog, which) -> finishScan())
                .setPositiveButton(getString(R.string.confirm), null)
                .create();
        prediction.setOnCancelListener(dialog -> finishScan());
        prediction.setCanceledOnTouchOutside(false);
        prediction.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        prediction.show();
        Button confirm = prediction.getButton(AlertDialog.BUTTON_POSITIVE);
        confirm.setEnabled(false);
        confirm.setOnClickListener(v -> saveGuess());
        waitingForInputSince = SystemClock.elapsedRealtime();
    }

    private void saveGuess() {
        long now = SystemClock.elapsedRealtime();
        if (prediction == null || waitingForInputSince >= 0 || camera == null || game.awaitingConfirmation()) return;
        if (!game.ready(now)) { showReading(null, now); return; }
        int value;
        try {
            value = Integer.parseInt(guess.getText().toString());
        } catch (NumberFormatException e) {
            value = -1;
        }
        if (!GameScore.validGuess(value)) {
            guess.getText().clear();
            guess.requestFocus();
            guess.setError(getString(R.string.invalid_guess));
            getSystemService(InputMethodManager.class).showSoftInput(guess, InputMethodManager.SHOW_IMPLICIT);
            return;
        }
        long request = game.requestSubmission(value, now);
        if (request == 0) return;
        prediction.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        guess.setEnabled(false);
        prediction.setMessage(getString(R.string.checking));
        camera.requestConfirmation(request);
        main.postDelayed(() -> {
            if (game.cancelSubmission(request)) showReading(null, SystemClock.elapsedRealtime());
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
                if (pending && !game.awaitingConfirmation()) showReading(null, SystemClock.elapsedRealtime());
                return;
            }
            finishScan();
        } catch (IOException e) {
            allowRetry(getString(R.string.save_error));
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
        displayedRounds = rounds;
        frames.removeAllViews();
        int cumulative = 0;
        for (int i = 0; i < Math.max(5, rounds.size()); i++) {
            GameScore.Round round = i < rounds.size() ? rounds.get(i) : null;
            if (round != null) cumulative += round.points;
            LinearLayout col = scoreColumn((i + 1) + "", round == null ? "–" : "+" + round.points,
                    round == null ? "–" : String.valueOf(cumulative), i == rounds.size() - 1);
            if (round != null) {
                String roundTitle = getString(R.string.round_title, i + 1);
                col.setContentDescription(getString(R.string.round_description, roundTitle, round.points, cumulative));
                col.setFocusable(true);
                col.setOnClickListener(v -> {
                    if (scanning) finishScan();
                    new AlertDialog.Builder(this).setTitle(roundTitle)
                        .setMessage(getString(R.string.round_detail, round.guess, round.actual, round.points))
                        .setPositiveButton(getString(R.string.close), null).show();
                });
            }
            frames.addView(col);
        }
        total.setText(getString(R.string.total_score, cumulative));
        if (!rounds.isEmpty()) {
            GameScore.Round last = rounds.get(rounds.size() - 1);
            result.setText(getString(R.string.last_round, rounds.size(), last.guess, last.actual, last.points));
            View latest = frames.getChildAt(rounds.size() - 1);
            scoreStrip.post(() -> scoreStrip.scrollTo(Math.max(0, latest.getRight() - scoreStrip.getWidth()), 0));
        } else {
            result.setText("");
            scoreStrip.scrollTo(0, 0);
        }
    }

    private void confirmReset() {
        final List<GameScore.Round> reviewed = displayedRounds;
        new AlertDialog.Builder(this).setTitle(getString(R.string.reset))
                .setMessage(getString(R.string.reset_detail))
                .setNegativeButton(getString(R.string.cancel), null).setPositiveButton(getString(R.string.new_game), (dialog, which) -> {
                    try {
                        boolean cleared = game.resetIfUnchanged(reviewed);
                        showHistory();
                        if (!cleared) Toast.makeText(this, R.string.reset_changed, Toast.LENGTH_LONG).show();
                    }
                    catch (IOException e) { Toast.makeText(this, getString(R.string.reset_error), Toast.LENGTH_LONG).show(); }
                }).show();
    }
}
