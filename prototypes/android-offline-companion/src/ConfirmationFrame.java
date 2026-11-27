package com.qroker.offline;

import java.util.ArrayDeque;
import java.util.function.Consumer;

/** Releases the matching exposure only after Camera2 reports successful capture. */
final class ConfirmationFrame<T> {
    static final class Match<T> {
        final long id;
        final T image;

        Match(long id, T image) {
            this.id = id;
            this.image = image;
        }
    }

    private static final class TimedImage<T> {
        final long timestamp;
        final T image;

        TimedImage(long timestamp, T image) {
            this.timestamp = timestamp;
            this.image = image;
        }
    }

    // The camera retains only decoded card IDs here, for the duration of one timed request.
    private final ArrayDeque<TimedImage<T>> earlyImages = new ArrayDeque<>();
    private final Consumer<T> preview;
    private long request;
    private long targetTimestamp = Long.MAX_VALUE;
    private T targetImage;
    private boolean captureCompleted;

    ConfirmationFrame(Consumer<T> preview) { this.preview = preview; }

    void request(long id) {
        request = id;
        targetTimestamp = Long.MAX_VALUE;
        targetImage = null;
        captureCompleted = false;
        earlyImages.clear();
    }

    boolean waiting() { return request != 0; }
    long requestId() { return request; }
    boolean needsReading(long timestamp) { return timestamp <= targetTimestamp; }

    Match<T> started(long id, long timestamp) {
        if (!waiting() || id != request) return null;
        targetTimestamp = timestamp;
        for (TimedImage<T> image : earlyImages) {
            if (image.timestamp < timestamp) preview.accept(image.image);
            if (image.timestamp == timestamp) targetImage = image.image;
        }
        earlyImages.clear();
        return takeCompletedMatch();
    }

    Match<T> arrived(long timestamp, T image) {
        if (!waiting()) return null;
        if (timestamp == targetTimestamp) {
            targetImage = image;
            return takeCompletedMatch();
        }
        if (targetTimestamp != Long.MAX_VALUE) {
            if (timestamp < targetTimestamp) preview.accept(image);
            return null;
        }
        earlyImages.addLast(new TimedImage<>(timestamp, image));
        return null;
    }

    void cancel(long id, Runnable onCancelled) {
        if (!waiting() || id != request) return;
        request(0);
        onCancelled.run();
    }

    Match<T> completed(long id) {
        if (!waiting() || id != request) return null;
        captureCompleted = true;
        return takeCompletedMatch();
    }

    private Match<T> takeCompletedMatch() {
        if (!captureCompleted || targetImage == null) return null;
        Match<T> match = new Match<>(request, targetImage);
        request(0);
        return match;
    }
}
