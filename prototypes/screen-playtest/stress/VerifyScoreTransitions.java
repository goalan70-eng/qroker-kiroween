package com.qroker.offline;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** Exercises the companion's submission checks with decoded browser captures. */
public final class VerifyScoreTransitions {
    private static final int[] SAMPLE = {4, 21, 36, 40};
    private static final int[] SAME_SUM = {0, 3, 24, 35};
    private static final int[] DIFFERENT_SUM = {1, 16, 23, 28};

    private static void check(boolean result, String message) {
        if (!result) throw new AssertionError(message);
    }

    private static int[] decode(OpticalReader reader, Path file, int[] expected) throws Exception {
        int[] ids = reader.read(VerifyScreen.frame(file));
        check(Arrays.equals(ids, expected), "Unexpected cards: " + file);
        return ids;
    }

    private static void rejectsChange(Path file, int[] first, int[] changed, String name) throws Exception {
        var score = new GameScore(file.toFile());
        var camera = new ConfirmationFrame<int[]>();
        score.observe(first, 100);
        long request = score.requestSubmission(27, 110);
        check(request != 0, "Original group should accept input");
        camera.request(request);
        // Use a container so a successfully acquired frame can hold a null decoded result.
        int[] image = changed == null ? new int[0] : changed;
        check(camera.started(request, 10_000) == null, "Capture starts before its image arrives");
        var matched = camera.arrived(10_000, image);
        check(matched != null && matched.id == request, "The confirmation image must match its own capture");
        score.observe(matched.image.length == 0 ? null : matched.image, 120);
        check(!score.awaitingConfirmation(), "A changed reading must cancel the pending guess");
        if (changed == null) check(!score.ready(120), "A missing card must close guessing");
        check(score.confirmSubmission(matched.id, 125) == null, "Changed reading used a stale guess");
        score.observe(first, 130);
        check(score.confirmSubmission(matched.id, 135) == null, "Restored cards revived a stale guess");
        check(score.total() == 0 && score.history().isEmpty() && !Files.exists(file), "Stale score was persisted");
        System.out.println("PASS " + name);
    }

    private static void rejectsDroppedCapture(Path file, int[] first) throws Exception {
        var score = new GameScore(file.toFile());
        var camera = new ConfirmationFrame<int[]>();
        score.observe(first, 100);
        long request = score.requestSubmission(27, 110);
        check(request != 0, "Original group should accept input");
        camera.request(request);
        camera.started(request, 10_000);
        check(camera.arrived(10_001, first) == null, "A later frame cannot replace a dropped capture");
        score.observe(first, 120);
        check(score.cancelSubmission(request), "Dropped capture must time out");
        camera.cancel(request);
        check(camera.arrived(10_000, first) == null, "A late image after timeout must be ignored");
        check(score.confirmSubmission(request, 2115) == null && !Files.exists(file), "Dropped capture wrote a score");
        System.out.println("PASS dropped confirmation and later return of the original group");
    }

    private static void acceptsFreshCapture(Path file, int[] first) throws Exception {
        var score = new GameScore(file.toFile());
        score.observe(first, 100);
        long request = score.requestSubmission(27, 110);
        score.observe(first, 120);
        var round = score.confirmSubmission(request, 125);
        check(round != null && round.actual == 27 && round.points == 10, "A fresh, matching guess should score");
        var restored = new GameScore(file.toFile());
        check(restored.total() == 10 && restored.history().size() == 1, "Fresh result was not retained");
        System.out.println("PASS fresh matching confirmation and score persistence");
    }

    public static void main(String[] args) throws Exception {
        Path browser = Path.of(args[0]);
        Path isolation = Path.of(args[1]);
        var reader = new OpticalReader();
        int[] first = decode(reader, browser.resolve("web-sample.png"), SAMPLE);
        int[] removed = decode(reader, browser.resolve("web-missing.png"), null);
        int[] same = decode(reader, browser.resolve("web-game.png"), SAME_SUM);
        int[] other = decode(reader, isolation.resolve("web-game.png"), DIFFERENT_SUM);
        check(Arrays.stream(first).map(id -> id % 13 + 1).sum() ==
                Arrays.stream(same).map(id -> id % 13 + 1).sum(), "Expected two groups with the same sum");
        Path journal = Files.createTempDirectory(Path.of(args[2]), "stress-score-").resolve("journal.csv");
        try {
            rejectsChange(journal, first, removed, "card removed before confirmation");
            rejectsChange(journal, first, same, "different cards with the same sum of 27");
            rejectsChange(journal, first, other, "different cards with a sum of 20");
            rejectsDroppedCapture(journal, first);
            acceptsFreshCapture(journal, first);
        } finally {
            Files.deleteIfExists(journal);
            Files.deleteIfExists(journal.resolveSibling("journal.csv.pending"));
            Files.delete(journal.getParent());
        }
    }
}
