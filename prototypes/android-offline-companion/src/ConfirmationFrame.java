package com.qroker.offline;

/** Matches a pending submission to an image from the new capture or a later one. */
final class ConfirmationFrame {
    private long request;
    private long firstTimestamp = Long.MAX_VALUE;

    void request(long id) {
        request = id;
        firstTimestamp = Long.MAX_VALUE;
    }

    void started(long id, long timestamp) {
        if (id == request) firstTimestamp = timestamp;
    }

    long take(long timestamp) {
        if (request == 0 || firstTimestamp == Long.MAX_VALUE || timestamp < firstTimestamp) return 0;
        long id = request;
        request = 0;
        return id;
    }
}
