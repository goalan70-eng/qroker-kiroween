package com.qroker.offline;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Size;
import android.view.Surface;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class LiveCamera {
    interface Observer { void frame(LiveCamera camera, int[] cards, long acquiredAt); }
    interface Failure { void error(LiveCamera camera); }

    final int width, height, sensorRotation;
    private final CameraManager manager;
    private final String selectedId;
    private final boolean continuousFocus;
    private final OpticalReader reader;
    private final SurfaceTexture texture;
    private final Handler main;
    private final Observer observer;
    private final Failure failure;
    private final HandlerThread cameraThread = new HandlerThread("qroker-camera");
    private final ExecutorService decode = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private Handler handler;
    private CameraDevice device;
    private CameraCaptureSession session;
    private ImageReader imageReader;
    private Surface preview;
    private volatile boolean closed;

    LiveCamera(Context context, SurfaceTexture texture, OpticalReader reader, Handler main,
               Observer observer, Failure failure) throws CameraAccessException {
        this.texture = texture;
        this.reader = reader;
        this.main = main;
        this.observer = observer;
        this.failure = failure;
        manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        String id = null;
        Size size = null;
        int rotation = 0;
        boolean focus = false;
        for (String candidate : manager.getCameraIdList()) {
            CameraCharacteristics info = manager.getCameraCharacteristics(candidate);
            Integer facing = info.get(CameraCharacteristics.LENS_FACING);
            if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) continue;
            StreamConfigurationMap streams = info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (streams == null) continue;
            size = analysisSize(streams.getOutputSizes(ImageFormat.YUV_420_888),
                    streams.getOutputSizes(SurfaceTexture.class));
            if (size == null) continue;
            id = candidate;
            Integer angle = info.get(CameraCharacteristics.SENSOR_ORIENTATION);
            rotation = angle == null ? 0 : angle;
            int[] modes = info.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
            if (modes != null)
                for (int mode : modes) if (mode == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE) focus = true;
            break;
        }
        if (id == null) throw new IllegalStateException("No supported rear camera");
        selectedId = id;
        width = size.getWidth();
        height = size.getHeight();
        sensorRotation = rotation;
        continuousFocus = focus;
    }

    private static Size analysisSize(Size[] yuv, Size[] previews) {
        if (yuv == null || previews == null) return null;
        Size best = null;
        double bestDistance = Double.POSITIVE_INFINITY;
        for (Size size : yuv) {
            if (!Arrays.asList(previews).contains(size)) continue;
            int length = Math.max(size.getWidth(), size.getHeight());
            if (length > 1920 || length < 320) continue;
            double distance = Math.abs(length - 1280) + .12 * Math.abs(size.getWidth() - 4.0 * size.getHeight() / 3);
            if (distance < bestDistance) { best = size; bestDistance = distance; }
        }
        return best;
    }

    @SuppressLint("MissingPermission")
    void start() throws CameraAccessException {
        texture.setDefaultBufferSize(width, height);
        cameraThread.start();
        handler = new Handler(cameraThread.getLooper());
        preview = new Surface(texture);
        imageReader = ImageReader.newInstance(width, height, ImageFormat.YUV_420_888, 3);
        imageReader.setOnImageAvailableListener(this::frameAvailable, handler);
        manager.openCamera(selectedId, new CameraDevice.StateCallback() {
            @Override public void onOpened(CameraDevice open) {
                if (closed) { open.close(); return; }
                device = open;
                configure();
            }

            @Override public void onDisconnected(CameraDevice open) { open.close(); fail(); }
            @Override public void onError(CameraDevice open, int error) { open.close(); fail(); }
        }, handler);
    }

    @SuppressWarnings("deprecation")
    private void configure() {
        try {
            device.createCaptureSession(Arrays.asList(preview, imageReader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                        @Override public void onConfigured(CameraCaptureSession configured) {
                            if (closed) { configured.close(); return; }
                            session = configured;
                            try {
                                CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                request.addTarget(preview);
                                request.addTarget(imageReader.getSurface());
                                request.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                if (continuousFocus)
                                    request.set(CaptureRequest.CONTROL_AF_MODE,
                                            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                session.setRepeatingRequest(request.build(), null, handler);
                            } catch (CameraAccessException | IllegalStateException error) {
                                fail();
                            }
                        }

                        @Override public void onConfigureFailed(CameraCaptureSession configured) { fail(); }
                    }, handler);
        } catch (CameraAccessException | IllegalStateException | IllegalArgumentException error) {
            fail();
        }
    }

    private void frameAvailable(ImageReader input) {
        try (Image image = input.acquireLatestImage()) {
            if (image == null || closed || !busy.compareAndSet(false, true)) return;
            long time = SystemClock.elapsedRealtime();
            OpticalReader.Frame frame = luminance(image);
            decode.execute(() -> {
                try {
                    int[] cards = reader.read(frame);
                    main.post(() -> { if (!closed) observer.frame(this, cards, time); });
                } catch (RuntimeException error) {
                    fail();
                } finally {
                    busy.set(false);
                }
            });
        } catch (RuntimeException error) {
            busy.set(false);
            fail();
        }
    }

    private static OpticalReader.Frame luminance(Image image) {
        Image.Plane plane = image.getPlanes()[0];
        int w = image.getWidth(), h = image.getHeight();
        ByteBuffer buffer = plane.getBuffer();
        int start = buffer.position(), row = plane.getRowStride(), step = plane.getPixelStride();
        byte[] pixels = new byte[w * h];
        if (step == 1 && row == w) {
            buffer.get(pixels);
        } else {
            for (int y = 0; y < h; y++) {
                int base = start + y * row;
                if (step == 1) {
                    buffer.position(base);
                    buffer.get(pixels, y * w, w);
                } else {
                    for (int x = 0; x < w; x++) pixels[y * w + x] = buffer.get(base + x * step);
                }
            }
        }
        return new OpticalReader.Frame(w, h, pixels);
    }

    private void fail() { main.post(() -> { if (!closed) failure.error(this); }); }

    void close() {
        closed = true;
        if (handler == null) { decode.shutdownNow(); return; }
        handler.post(() -> {
            if (session != null) session.close();
            if (device != null) device.close();
            if (imageReader != null) imageReader.close();
            if (preview != null) preview.release();
            decode.shutdownNow();
            cameraThread.quitSafely();
        });
    }
}
