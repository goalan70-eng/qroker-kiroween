package com.qroker.offline;

import java.util.ArrayDeque;

/** Matches the exposure for the submission even if its image is delivered first. */
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

    private static final int EARLY_IMAGE_LIMIT = 3;
    private final ArrayDeque<TimedImage<T>> earlyImages = new ArrayDeque<>();
    private long request;
    private long targetTimestamp = Long.MAX_VALUE;

    void request(long id) {
        request = id;
        targetTimestamp = Long.MAX_VALUE;
        earlyImages.clear();
    }

    boolean waiting() { return request != 0; }

    boolean candidate(long timestamp) {
        return waiting() && (targetTimestamp == Long.MAX_VALUE || timestamp == targetTimestamp);
    }

    Match<T> started(long id, long timestamp) {
        if (!waiting() || id != request) return null;
        targetTimestamp = timestamp;
        T match = null;
        for (TimedImage<T> image : earlyImages) {
            if (image.timestamp == timestamp) {
                match = image.image;
                break;
            }
        }
        earlyImages.clear();
        return match == null ? null : matched(match);
    }

    Match<T> arrived(long timestamp, T image) {
        if (!candidate(timestamp)) return null;
        if (targetTimestamp != Long.MAX_VALUE) return matched(image);
        if (earlyImages.size() == EARLY_IMAGE_LIMIT) earlyImages.removeFirst();
        earlyImages.addLast(new TimedImage<>(timestamp, image));
        return null;
    }

    void cancel(long id) {
        if (id == request) request(0);
    }

    private Match<T> matched(T image) {
        Match<T> match = new Match<>(request, image);
        request(0);
        return match;
    }
}
