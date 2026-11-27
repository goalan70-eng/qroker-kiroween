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
import android.hardware.camera2.CaptureFailure;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
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
import java.util.concurrent.atomic.AtomicInteger;

final class LiveCamera {
    interface Observer { void frame(LiveCamera camera, int[] cards, long acquiredAt, long confirmation); }
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
    private final AtomicInteger decodeJobs = new AtomicInteger();
    private final ConfirmationFrame<Reading> confirmation = new ConfirmationFrame<>(reading -> publish(reading, 0));
    private Handler handler;
    private CameraDevice device;
    private CameraCaptureSession session;
    private CaptureRequest previewRequest;
    private boolean previewReadInFlight;
    private ImageReader imageReader;
    private Surface preview;
    private volatile boolean closed;

    private static final class Reading {
        final int[] cards;
        final long acquiredAt;

        Reading(int[] cards, long acquiredAt) {
            this.cards = cards;
            this.acquiredAt = acquiredAt;
        }
    }

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
                                request.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                if (continuousFocus)
                                    request.set(CaptureRequest.CONTROL_AF_MODE,
                                            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                CaptureRequest display = request.build();
                                request.addTarget(imageReader.getSurface());
                                previewRequest = request.build();
                                session.setRepeatingRequest(display, new CameraCaptureSession.CaptureCallback() {
                                    @Override public void onCaptureCompleted(CameraCaptureSession source,
                                            CaptureRequest request, TotalCaptureResult result) {
                                        schedulePreviewRead(source);
                                    }
                                }, handler);
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

    private final CameraCaptureSession.CaptureCallback previewReadCallback =
            new CameraCaptureSession.CaptureCallback() {
                @Override public void onCaptureCompleted(CameraCaptureSession source, CaptureRequest request,
                                                         TotalCaptureResult result) { previewReadInFlight = false; }
                @Override public void onCaptureFailed(CameraCaptureSession source, CaptureRequest request,
                                                      CaptureFailure failure) { previewReadInFlight = false; }
                @Override public void onCaptureSequenceAborted(CameraCaptureSession source, int sequenceId) {
                    previewReadInFlight = false;
                }
            };

    @SuppressWarnings("deprecation")
    private void schedulePreviewRead(CameraCaptureSession source) {
        // Keep the display live without queuing analysis frames ahead of the confirmation exposure.
        if (closed || source != session || previewReadInFlight || confirmation.waiting() || decodeJobs.get() != 0)
            return;
        try {
            source.capture(previewRequest, previewReadCallback, handler);
            previewReadInFlight = true;
        } catch (CameraAccessException | IllegalStateException | IllegalArgumentException error) {
            fail();
        }
    }

    @SuppressWarnings("deprecation")
    void requestConfirmation(long id) {
        handler.post(() -> {
            if (closed || session == null || previewRequest == null) return;
            confirmation.request(id);
            try {
                session.capture(previewRequest, new CameraCaptureSession.CaptureCallback() {
                    @Override public void onCaptureStarted(CameraCaptureSession source, CaptureRequest request,
                                                           long timestamp, long frameNumber) {
                        publishConfirmation(confirmation.started(id, timestamp));
                    }

                    @Override public void onCaptureFailed(CameraCaptureSession source, CaptureRequest request,
                                                          CaptureFailure failure) {
                        abortConfirmation(id);
                    }

                    @Override public void onCaptureCompleted(CameraCaptureSession source, CaptureRequest request,
                                                             TotalCaptureResult result) {
                        publishConfirmation(confirmation.completed(id));
                    }

                    @Override public void onCaptureSequenceAborted(CameraCaptureSession source, int sequenceId) {
                        abortConfirmation(id);
                    }
                }, handler);
                handler.postDelayed(() -> abortConfirmation(id), GameScore.CONFIRM_MS);
            } catch (CameraAccessException | IllegalStateException | IllegalArgumentException error) {
                fail();
            }
        });
    }

    private void abortConfirmation(long id) {
        confirmation.cancel(id, () -> publish(new Reading(null, SystemClock.elapsedRealtime()), id));
    }

    private void frameAvailable(ImageReader input) {
        boolean confirming = confirmation.waiting();
        try (Image image = confirming ? input.acquireNextImage() : input.acquireLatestImage()) {
            if (image == null || closed) return;
            long timestamp = image.getTimestamp();
            long time = SystemClock.elapsedRealtime();
            if (confirming && !confirmation.needsReading(timestamp)) return;
            if (!confirming && decodeJobs.get() != 0) return;
            if (confirming && decodeJobs.get() >= 6) {
                // Do not confirm across an observation we cannot process in order.
                abortConfirmation(confirmation.requestId());
                return;
            }
            decodeFrame(luminance(image), time, timestamp, confirmation.requestId());
        } catch (RuntimeException error) {
            fail();
        }
    }

    private void publishConfirmation(ConfirmationFrame.Match<Reading> match) {
        if (match != null) publish(match.image, match.id);
    }

    private void publish(Reading reading, long id) {
        main.post(() -> { if (!closed) observer.frame(this, reading.cards, reading.acquiredAt, id); });
    }

    private void decodeFrame(OpticalReader.Frame frame, long acquiredAt, long timestamp, long requestId) {
        decodeJobs.incrementAndGet();
        decode.execute(() -> {
            try {
                if (closed) return;
                Reading reading = new Reading(reader.readAimed(frame), acquiredAt);
                handler.post(() -> {
                    if (closed) return;
                    if (requestId == 0) publish(reading, 0);
                    else if (requestId == confirmation.requestId())
                        publishConfirmation(confirmation.arrived(timestamp, reading));
                });
            } catch (RuntimeException error) {
                fail();
            } finally {
                decodeJobs.decrementAndGet();
            }
        });
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
