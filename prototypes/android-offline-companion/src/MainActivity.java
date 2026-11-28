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
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.TextureView;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.ImageButton;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.IOException;
import java.util.List;

public final class MainActivity extends Activity implements LiveCamera.Observer {
    private static final int CAMERA_PERMISSION = 1;
    private static final int FELT = 0xff183d33, PAPER = 0xfffffdf7, STOCK = 0xfff7f1df;
    private static final int RULE = 0xffb7ad92, INK = 0xff1a1a1a, MUTED = 0xff57574e;
    private static final int PRINT_RED = 0xff922c37, GOLD = 0xfff8d38a;
    private static final Typeface DISPLAY = Typeface.create("serif", Typeface.BOLD);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final OpticalReader recognizer = new OpticalReader();
    private GameScore game;
    private List<GameScore.Round> displayedRounds;
    private LiveCamera camera;
    private TextureView preview;
    private FrameLayout viewfinder;
    private TextView total, scanStatus, result;
    private LinearLayout scanner, frames;
    private HorizontalScrollView scoreStrip;
    private Button scan, lockButton, permission;
    private AlertDialog prediction;
    private EditText guess;
    private Bundle predictionToRestore;
    private long nextCapture, activeCapture, captureGeneration;
    private boolean resumed, scanning;
    private static final String CAMERA_SETTINGS = "cameraSettingsNeeded";
    private AimGuide guide;
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
        getWindow().setStatusBarColor(FELT);
        getWindow().setNavigationBarColor(FELT);
        createScreen();
        if (state != null && state.containsKey("draftKey")) {
            predictionToRestore = state;
        } else if (state != null && state.getBoolean("aiming")) {
            scan.post(() -> {
                if (scan.isEnabled() && game != null && !scanning) openScanner(false);
            });
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putBoolean("aiming", scanning && prediction == null);
        if (prediction != null && game.lockIsCurrent()) {
            state.putInt("draftKey", game.lockedKey());
            state.putLong("draftGame", game.lockedGeneration());
            state.putString("draftGuess", guess.getText().toString());
        }
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
                stroke.setColor(layer == 0 ? 0xcc12231e : isActivated() ? GOLD : Color.WHITE);
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

    private ImageButton headerAction(LinearLayout header, int icon, int label) {
        ImageButton button = new ImageButton(this, null, android.R.attr.borderlessButtonStyle);
        button.setImageResource(icon);
        button.setContentDescription(getString(label));
        button.setPadding(0, 0, 0, 0);
        button.setScaleType(ImageView.ScaleType.CENTER);
        header.addView(button, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return button;
    }

    private void helpSection(LinearLayout content, int title, int description) {
        TextView heading = text(getString(title), 18, FELT);
        heading.setTypeface(DISPLAY, Typeface.BOLD);
        if (android.os.Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
        add(content, heading, -2, 12);
        add(content, text(getString(description), 16, INK), -2, 4);
    }

    private void helpFigure(LinearLayout content, int illustration, int caption) {
        ImageView image = new ImageView(this);
        image.setImageResource(illustration);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setMaxHeight(dp(150));
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        add(content, image, -2, 10);
        add(content, text(getString(caption), 14, FELT), -2, 4);
    }

    private void showGameHelp() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column();
        content.setPadding(dp(22), 0, dp(22), dp(12));
        scroll.addView(content);
        helpSection(content, R.string.help_goal_title, R.string.help_goal_body);
        helpFigure(content, R.drawable.help_hand, R.string.help_hand_caption);
        helpSection(content, R.string.help_turn_title, R.string.help_turn_body);
        helpFigure(content, R.drawable.help_placement, R.string.help_placement_caption);
        helpFigure(content, R.drawable.help_code, R.string.help_code_caption);
        helpSection(content, R.string.help_score_title, R.string.help_score_body);
        helpSection(content, R.string.help_end_title, R.string.help_end_body);
        helpSection(content, R.string.help_app_title, R.string.help_app_body);
        new AlertDialog.Builder(this).setTitle(R.string.game_help_title).setView(scroll)
                .setPositiveButton(R.string.close, null)
                .setOnDismissListener(dialog -> showAimArea()).show();
    }

    private void createScreen() {
        ScrollView page = new ScrollView(this);
        page.setFillViewport(true);
        page.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{STOCK, 0xffdce4d4}));
        LinearLayout body = column();
        body.setPadding(dp(18), dp(14), dp(18), dp(20));
        body.setFocusableInTouchMode(true);
        page.addView(body);
        setContentView(page);

        scanner = column();
        scanner.setVisibility(View.GONE);

        LinearLayout cover = column();
        GradientDrawable felt = new GradientDrawable(GradientDrawable.Orientation.TR_BL,
                new int[]{0xff306454, FELT});
        felt.setCornerRadius(dp(14));
        felt.setStroke(dp(1), 0xff788875);
        cover.setBackground(felt);
        cover.setPadding(dp(16), dp(8), dp(8), dp(14));
        add(body, cover, -2, 0);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(getString(R.string.scoreboard), 30, STOCK);
        title.setTypeface(DISPLAY);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton help = headerAction(header, R.drawable.ic_help, R.string.game_help_title);
        help.setOnClickListener(v -> {
            cancelPendingCapture();
            showGameHelp();
        });
        ImageButton menu = headerAction(header, R.drawable.ic_more, R.string.score_menu);
        menu.setOnClickListener(v -> {
            cancelPendingCapture();
            PopupMenu options = new PopupMenu(this, menu);
            options.getMenu().add(getString(R.string.new_game)).setEnabled(game != null && !game.history().isEmpty())
                    .setOnMenuItemClickListener(item -> { confirmReset(); return true; });
            boolean korean = "ko".equals(getResources().getConfiguration().getLocales().get(0).getLanguage());
            String[] languages = {"English", "한국어"};
            int selected = korean ? 1 : 0;
            options.getMenu().add(getString(R.string.language_current, languages[selected])).setOnMenuItemClickListener(item -> {
                new AlertDialog.Builder(this)
                        .setTitle(R.string.language_title)
                        .setSingleChoiceItems(languages, selected, (dialog, choice) -> {
                            dialog.dismiss();
                            if (choice == selected) return;
                            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                                    .putString(LANGUAGE, choice == 1 ? "ko" : "en").apply();
                            recreate();
                        })
                        .setNegativeButton(R.string.cancel, null).show();
                return true;
            });
            options.setOnDismissListener(popup -> showAimArea());
            options.show();
        });
        add(cover, header, -2, 0);
        LinearLayout summary = new LinearLayout(this);
        summary.setGravity(Gravity.CENTER_VERTICAL);
        total = text(getString(R.string.total_score, 0), 24, GOLD);
        total.setTypeface(DISPLAY);
        summary.addView(total, new LinearLayout.LayoutParams(0, -2, 1));
        ImageView jester = new ImageView(this);
        jester.setImageResource(R.drawable.jester_cards);
        jester.setScaleType(ImageView.ScaleType.FIT_CENTER);
        jester.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams card = new LinearLayout.LayoutParams(dp(69), dp(69));
        card.rightMargin = dp(12);
        summary.addView(jester, card);
        add(cover, summary, -2, 2);

        LinearLayout board = new LinearLayout(this);
        GradientDrawable sheet = background(PAPER, 10);
        sheet.setStroke(dp(1), RULE);
        board.setBackground(sheet);
        board.setPadding(dp(5), dp(12), dp(5), dp(12));
        board.setElevation(dp(2));
        board.addView(scoreColumn(getString(R.string.round), getString(R.string.earned), getString(R.string.total), false));
        scoreStrip = new HorizontalScrollView(this);
        frames = new LinearLayout(this);
        scoreStrip.addView(frames);
        board.addView(scoreStrip, new LinearLayout.LayoutParams(0, -2, 1));
        add(body, board, -2, 14);
        scan = new Button(this);
        scan.setText(getString(R.string.scan));
        scan.setTextColor(new ColorStateList(new int[][]{{-android.R.attr.state_enabled}, {}},
                new int[]{0xff5f5f5f, PAPER}));
        scan.setBackgroundTintList(new ColorStateList(new int[][]{{-android.R.attr.state_enabled}, {}},
                new int[]{0xffe6e4dc, FELT}));
        scan.setAllCaps(false);
        scan.setTextSize(17);
        viewfinder = new FrameLayout(this);
        scan.setOnClickListener(v -> {
            if (scanning) {
                finishScan();
                return;
            }
            openScanner(true);
        });
        scan.setMinHeight(dp(52));
        add(body, scan, -2, 14);
        add(body, scanner, -2, 8);
        result = text("", 16, MUTED);
        result.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(body, result, -2, 8);

        viewfinder.setBackground(background(0xff101820, 12));
        viewfinder.setClipToOutline(true);
        preview = new TextureView(this);
        preview.setContentDescription(getString(R.string.preview));
        viewfinder.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        guide = new AimGuide();
        guide.setVisibility(View.GONE);
        viewfinder.addView(guide, new FrameLayout.LayoutParams(-1, -1));
        permission = new Button(this);
        permission.setMinHeight(dp(48));
        permission.setVisibility(View.GONE);
        viewfinder.addView(permission, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        lockButton = new Button(this);
        lockButton.setText(R.string.lock_code);
        lockButton.setAllCaps(false);
        lockButton.setVisibility(View.GONE);
        lockButton.setOnClickListener(v -> {
            if (camera == null || activeCapture != 0) return;
            activeCapture = ++nextCapture;
            captureGeneration = game.generation();
            lockButton.setEnabled(false);
            scanStatus.setText(R.string.locking);
            camera.captureCode(activeCapture);
        });
        viewfinder.addView(lockButton, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
        add(scanner, viewfinder, 275, 0);
        scanStatus = text("", 17, INK);
        scanStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(scanner, scanStatus, -2, 12);
        preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int w, int h) { startCamera(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int w, int h) { transformPreview(); }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { stopCamera(); return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
        });
    }

    private void openScanner(boolean requestPermission) {
        scanning = true;
        scan.setText(R.string.close_camera);
        int height = findViewById(android.R.id.content).getHeight();
        if (height == 0) height = getResources().getDisplayMetrics().heightPixels;
        viewfinder.getLayoutParams().height = Math.min(dp(275), height / 2);
        scanner.setVisibility(View.VISIBLE);
        // Wait for the inline panel to be laid out, then scroll just enough to show it.
        viewfinder.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override public boolean onPreDraw() {
                viewfinder.getViewTreeObserver().removeOnPreDrawListener(this);
                showAimArea();
                return true;
            }
        });
        if (requestPermission && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED && !needsCameraSettings())
            authorize();
        else startCamera();
    }

    private void showAimArea() {
        if (scanning && scanner.getVisibility() == View.VISIBLE && viewfinder.getHeight() > 0) {
            viewfinder.requestRectangleOnScreen(new Rect(0, 0, viewfinder.getWidth(), viewfinder.getHeight()), true);
        }
    }

    private void authorize() {
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
    }

    @Override public void onRequestPermissionsResult(int request, String[] names, int[] grants) {
        super.onRequestPermissionsResult(request, names, grants);
        if (request != CAMERA_PERMISSION) return;
        if (grants.length > 0) {
            boolean useSettings = grants[0] == PackageManager.PERMISSION_DENIED
                    && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA);
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(CAMERA_SETTINGS, useSettings).apply();
        }
        startCamera();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (game == null) openScoreboard();
        if (prediction != null && !game.lockIsCurrent()) {
            finishScan();
            Toast.makeText(this, R.string.lock_expired, Toast.LENGTH_LONG).show();
        } else if (game != null) showHistory();
        if (game != null && predictionToRestore != null) {
            Bundle draft = predictionToRestore;
            predictionToRestore = null;
            if (game.restoreLock(draft.getInt("draftKey"), draft.getLong("draftGame", -1)) == GameScore.LockResult.LOCKED) {
                scanning = true;
                scan.setText(R.string.close_camera);
                openPrediction();
                guess.setText(draft.getString("draftGuess", ""));
                guess.setSelection(guess.length());
            } else {
                Toast.makeText(this, R.string.lock_expired, Toast.LENGTH_LONG).show();
            }
        }
        startCamera();
    }

    @Override protected void onPause() {
        resumed = false;
        stopCamera();
        super.onPause();
    }

    private boolean needsCameraSettings() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(CAMERA_SETTINGS, false)
                && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA);
    }

    private void startCamera() {
        if (!scanning || prediction != null || !resumed || !preview.isAvailable() || camera != null || game == null) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            scanStatus.setText(getString(R.string.permission_needed));
            boolean offerPermissionSettings = needsCameraSettings();
            permission.setText(offerPermissionSettings ? R.string.allow_settings : R.string.allow_camera);
            permission.setOnClickListener(v -> {
                if (offerPermissionSettings) {
                    startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            android.net.Uri.parse("package:" + getPackageName())));
                } else authorize();
            });
            permission.setVisibility(View.VISIBLE);
            return;
        }
        permission.setVisibility(View.GONE);
        if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(CAMERA_SETTINGS, false)) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(CAMERA_SETTINGS).apply();
        }
        scanStatus.setText(getString(R.string.starting));
        try {
            camera = new LiveCamera(this, preview.getSurfaceTexture(), recognizer, main,
                    this, this::cameraError);
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
        int displayDegrees = preview.getDisplay().getRotation() * 90;
        // TextureView already orients the sensor buffer, then stretches it to its own bounds.
        boolean sensorSwapsAxes = camera.sensorRotation % 180 != 0;
        int bufferWidth = sensorSwapsAxes ? camera.height : camera.width;
        int bufferHeight = sensorSwapsAxes ? camera.width : camera.height;
        boolean displaySwapsAxes = displayDegrees % 180 != 0;
        int orientedWidth = displaySwapsAxes ? bufferHeight : bufferWidth;
        int orientedHeight = displaySwapsAxes ? bufferWidth : bufferHeight;
        float scale = Math.min((float) w / orientedWidth, (float) h / orientedHeight);
        Matrix matrix = new Matrix();
        matrix.setScale(bufferWidth * scale / w, bufferHeight * scale / h, w / 2f, h / 2f);
        matrix.postRotate(-displayDegrees, w / 2f, h / 2f);
        preview.setTransform(matrix);
        guide.half = OpticalReader.aimSide(camera.width, camera.height) * scale / 2;
        guide.invalidate();
    }

    @Override public void onBackPressed() {
        if (scanning) finishScan();
        else super.onBackPressed();
    }

    private void cancelPendingCapture() {
        if (activeCapture == 0) return;
        activeCapture = 0;
        lockButton.setEnabled(true);
        scanStatus.setText(R.string.aim);
    }

    private void finishScan() {
        scanning = false;
        game.discardLock();
        closePrediction();
        stopCamera();
        scanner.setVisibility(View.GONE);
        scan.setText(R.string.scan);
        showHistory();
    }

    private void stopCamera() {
        LiveCamera old = camera;
        camera = null;
        if (old != null) old.close();
        activeCapture = 0;
        lockButton.setVisibility(View.GONE);
        guide.setVisibility(View.GONE);
    }

    @Override public void ready(LiveCamera source) {
        if (source != camera || !scanning) return;
        guide.setVisibility(View.VISIBLE);
        lockButton.setEnabled(true);
        lockButton.setVisibility(View.VISIBLE);
        scanStatus.setText(R.string.aim);
    }

    @Override public void captured(LiveCamera source, long requestId, int[] ids) {
        if (source != camera || requestId == 0 || requestId != activeCapture) return;
        activeCapture = 0;
        GameScore.LockResult result = game.lockCaptured(ids, captureGeneration);
        if (result == GameScore.LockResult.LOCKED) {
            stopCamera();
            openPrediction();
            scanner.setVisibility(View.GONE);
        } else {
            int message = result == GameScore.LockResult.DUPLICATE ? R.string.duplicate
                    : result == GameScore.LockResult.GAME_CHANGED ? R.string.lock_expired : R.string.lock_failed;
            scanStatus.setText(message);
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
            lockButton.setEnabled(true);
        }
    }

    private void closePrediction() {
        if (prediction != null) prediction.dismiss();
        prediction = null;
        guess = null;
    }

    @Override protected void onDestroy() {
        closePrediction();
        super.onDestroy();
    }

    private void openPrediction() {
        LinearLayout field = column();
        field.setPadding(dp(24), dp(4), dp(24), 0);
        guess = new EditText(this);
        guess.setSingleLine(true);
        // Offer a numeric keyboard while preserving pasted signs and decimal points for validation.
        guess.setRawInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_SIGNED
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        guess.setHint(getString(R.string.guess_hint));
        guess.setImeOptions(EditorInfo.IME_ACTION_DONE);
        guess.setOnEditorActionListener((v, id, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (id != EditorInfo.IME_ACTION_DONE && !enter) return false;
            if (event == null || event.getAction() == KeyEvent.ACTION_UP) saveGuess();
            return true;
        });
        add(field, guess, -2, 0);
        prediction = new AlertDialog.Builder(this)
                .setTitle(R.string.guess_title)
                .setMessage(getString(R.string.guess_prompt))
                .setView(field)
                .setNegativeButton(getString(R.string.cancel), (dialog, which) -> finishScan())
                .setNeutralButton(R.string.rescan, (dialog, which) -> {
                    finishScan();
                    scan.performClick();
                })
                .setPositiveButton(getString(R.string.confirm), null)
                .create();
        prediction.setOnCancelListener(dialog -> finishScan());
        prediction.setCanceledOnTouchOutside(false);
        prediction.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        prediction.show();
        Button confirm = prediction.getButton(AlertDialog.BUTTON_POSITIVE);
        guess.requestFocus();
        confirm.setOnClickListener(v -> saveGuess());
    }

    private void saveGuess() {
        if (prediction == null) return;
        int value;
        try {
            value = Integer.parseInt(guess.getText().toString().trim());
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
        try {
            GameScore.Round round = game.scoreLocked(value);
            finishScan();
            if (round == null) Toast.makeText(this, R.string.lock_expired, Toast.LENGTH_LONG).show();
        } catch (IOException error) {
            prediction.setMessage(getString(R.string.save_error));
        }
    }

    private LinearLayout scoreColumn(String number, String earned, String cumulative, boolean latest) {
        LinearLayout col = column();
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(2), 0, dp(2), 0);
        int columnWidth = Math.max(dp(44), Math.min(dp(64),
                (getResources().getDisplayMetrics().widthPixels - dp(44)) / 6));
        if (latest) col.setBackground(background(0xffe5eee2, 6));
        String[] values = {number, earned, cumulative};
        for (int i = 0; i < values.length; i++) {
            if (i == 2) {
                View rule = new View(this);
                rule.setBackgroundColor(RULE);
                col.addView(rule, new LinearLayout.LayoutParams(-1, dp(1)));
            }
            int cellColor = i == 2 ? FELT : MUTED;
            if (i == 1 && latest) cellColor = PRINT_RED;
            TextView cell = text(values[i], i == 2 ? 19 : 14, cellColor);
            cell.setGravity(Gravity.CENTER);
            cell.setPadding(0, dp(4), 0, dp(4));
            if (i == 2) cell.setTypeface(DISPLAY);
            cell.setMinWidth(columnWidth - dp(4));
            col.addView(cell, new LinearLayout.LayoutParams(-2, -2));
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
                    cancelPendingCapture();
                    new AlertDialog.Builder(this).setTitle(roundTitle)
                        .setMessage(getString(R.string.round_detail, round.guess, round.points))
                        .setPositiveButton(getString(R.string.close), null)
                        .setOnDismissListener(dialog -> showAimArea()).show();
                });
            }
            frames.addView(col);
        }
        total.setText(getString(R.string.total_score, cumulative));
        if (!rounds.isEmpty()) {
            GameScore.Round last = rounds.get(rounds.size() - 1);
            result.setText(getString(R.string.last_round, rounds.size(), last.guess, last.points));
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
                        if (cleared && scanning) finishScan();
                        else showHistory();
                        if (!cleared) Toast.makeText(this, R.string.reset_changed, Toast.LENGTH_LONG).show();
                    }
                    catch (IOException e) { Toast.makeText(this, getString(R.string.reset_error), Toast.LENGTH_LONG).show(); }
                }).show();
    }
}
