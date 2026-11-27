package com.qroker.offline;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import javax.imageio.ImageIO;

public class OfflineTest {
    private static void check(boolean truth, String message) {
        if (!truth) throw new AssertionError(message);
        System.out.println("PASS " + message);
    }

    private static OpticalReader.Frame read(Path file) throws Exception {
        BufferedImage image = ImageIO.read(file.toFile());
        int w = image.getWidth(), h = image.getHeight();
        byte[] pixels = new byte[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = image.getRGB(x, y);
                pixels[y * w + x] = (byte) Math.round(.299 * ((rgb >> 16) & 255)
                        + .587 * ((rgb >> 8) & 255) + .114 * (rgb & 255));
            }
        }
        return new OpticalReader.Frame(w, h, pixels);
    }

    private static OpticalReader.Frame quarterTurn(OpticalReader.Frame frame) {
        byte[] rotated = new byte[frame.data.length];
        for (int y = 0; y < frame.height; y++)
            for (int x = 0; x < frame.width; x++)
                rotated[x * frame.height + frame.height - 1 - y] = (byte) frame.pixel(x, y);
        return new OpticalReader.Frame(frame.height, frame.width, rotated);
    }

    private static OpticalReader.Frame cameraRange(OpticalReader.Frame frame) {
        byte[] pixels = new byte[frame.data.length];
        for (int i = 0; i < pixels.length; i++)
            pixels[i] = (byte) (16 + Math.round(219 * (frame.data[i] & 255) / 255f));
        return new OpticalReader.Frame(frame.width, frame.height, pixels);
    }

    private static OpticalReader.Frame shiftedRight(OpticalReader.Frame frame, int shift) {
        byte[] pixels = new byte[frame.data.length];
        for (int y = 0; y < frame.height; y++)
            System.arraycopy(frame.data, y * frame.width, pixels, y * frame.width + shift, frame.width - shift);
        return new OpticalReader.Frame(frame.width, frame.height, pixels);
    }

    private static void submissionRace(int[] first, int[] replacement) throws Exception {
        String[] labels = {"removed", "replaced"};
        int[][] changes = {null, replacement};
        for (int i = 0; i < changes.length; i++) {
            Path folder = Files.createTempDirectory(Path.of("build"), "qroker-submit-race");
            Path journal = folder.resolve("scores");
            GameScore score = new GameScore(journal.toFile());
            score.observe(first, 100);
            // The camera has the changed scene, but its decoded result is still in flight.
            long request = score.requestSubmission(27, 130);
            ConfirmationFrame<String> camera = new ConfirmationFrame<>(ignored -> {});
            camera.request(request);
            camera.started(request, 3_000);
            check(request != 0 && score.awaitingConfirmation() && camera.arrived(2_999, "preview") == null
                    && score.confirmSubmission(0, 132) == null && !Files.exists(journal),
                    "an in-flight preview cannot confirm a guess before the " + labels[i] + " scene arrives");
            score.observe(changes[i], 145);
            camera.completed(request);
            ConfirmationFrame.Match<String> changed = camera.arrived(3_000, labels[i]);
            check(changed != null && score.confirmSubmission(changed.id, 150) == null
                    && score.history().isEmpty() && score.total() == 0 && !Files.exists(journal),
                    labels[i] + " scene cannot record the old guess");
            score.observe(first, 155);
            check(!score.awaitingConfirmation() && score.confirmSubmission(request, 156) == null,
                    labels[i] + " scene cannot resume the cancelled guess when the cards return");
            Files.delete(folder);
        }
    }

    private static void captureBoundary() {
        java.util.List<String> previews = new java.util.ArrayList<>();
        ConfirmationFrame<String> camera = new ConfirmationFrame<>(previews::add);
        camera.request(1);
        check(camera.arrived(8_000, "earlier request") == null, "frames are not confirmed before the capture-start callback");
        camera.request(2);
        check(camera.started(1, 8_000) == null && camera.arrived(8_500, "preview") == null,
                "a late callback cannot arm the next submission");
        camera.started(2, 9_000);
        camera.completed(2);
        check(camera.arrived(8_999, "preview") == null, "an earlier preview cannot confirm the tagged capture");
        ConfirmationFrame.Match<String> exact = camera.arrived(9_000, "confirmation");
        check(exact != null && exact.id == 2 && "confirmation".equals(exact.image)
                && camera.arrived(9_001, "preview") == null, "only the exact capture can confirm, and only once");
        camera.request(3);
        camera.started(3, 10_000);
        check(camera.arrived(10_001, "restored group") == null,
                "a later restored group cannot stand in for a dropped confirmation capture");
        camera.request(4);
        camera.arrived(11_000, "missing");
        camera.arrived(11_001, "restored");
        check(camera.started(4, 11_000) == null, "exposure start alone cannot confirm the early image");
        ConfirmationFrame.Match<String> early = camera.completed(4);
        check(early != null && early.id == 4 && "missing".equals(early.image),
                "an exact capture delivered early survives a later preview");
        camera.request(5);
        camera.arrived(12_000, "cancelled");
        camera.cancel(5, () -> previews.add("invalid"));
        check(camera.started(5, 12_000) == null && !camera.waiting(),
                "a late callback cannot restore a cancelled capture");
        for (int later : new int[]{0, 2, 3, 4, 30}) {
            camera.request(6);
            previews.clear();
            camera.arrived(12_999, "before");
            camera.arrived(13_000, "exact");
            for (int i = 1; i <= later; i++) camera.arrived(13_000 + i, "later");
            camera.started(6, 13_000);
            var match = camera.completed(6);
            check(match != null && "exact".equals(match.image) && previews.equals(java.util.List.of("before"))
                            && !camera.waiting(), "exact match survives " + later + " later readings");
        }
    }

    private static void confirmationOrder(Path folder, int[] first) throws Exception {
        for (boolean imageFirst : new boolean[]{false, true}) {
            Path path = folder.resolve("late-failure-" + imageFirst);
            GameScore score = new GameScore(path.toFile());
            score.observe(first, 100);
            long id = score.requestSubmission(27, 110);
            var frames = new ConfirmationFrame<int[]>(cards -> score.observe(cards, 115));
            frames.request(id);
            if (imageFirst) frames.arrived(500, first);
            else frames.started(id, 500);
            var premature = imageFirst ? frames.started(id, 500) : frames.arrived(500, first);
            if (premature != null) {
                score.observe(premature.image, 120);
                score.confirmSubmission(premature.id, 120);
            }
            frames.cancel(id, () -> score.observe(null, 121));
            check(!score.awaitingConfirmation() && score.total() == 0 && !Files.exists(path),
                    "failed capture writes no round after a matching image, image first = " + imageFirst);
            score.observe(first, 130);
            long retry = score.requestSubmission(27, 131);
            frames.request(retry);
            frames.started(retry, 600);
            check(frames.arrived(600, first) == null && frames.completed(id) == null,
                    "late success from a cancelled request cannot release the retry image");
            var valid = frames.completed(retry);
            score.observe(valid.image, 140);
            check(score.confirmSubmission(valid.id, 141).points == 10 && frames.completed(retry) == null,
                    "successful retry scores once after capture failure");
            Files.delete(path);
        }
        Path failedFile = folder.resolve("failed-capture");
        GameScore failed = new GameScore(failedFile.toFile());
        var failedCamera = new ConfirmationFrame<int[]>(cards -> failed.observe(cards, 125));
        failed.observe(first, 100);
        long request = failed.requestSubmission(27, 110);
        failedCamera.request(request);
        failedCamera.arrived(1001, null);
        failedCamera.arrived(1002, first);
        failedCamera.cancel(request, () -> failed.observe(null, 125));
        check(!failed.awaitingConfirmation() && !failed.visible(125) && !Files.exists(failedFile),
                "failed capture discards the draft even when a changed scene is still buffered");
        failed.observe(first, 130);
        long retry = failed.requestSubmission(27, 135);
        failedCamera.request(retry);
        failedCamera.cancel(request, () -> failed.observe(null, 136));
        check(failedCamera.requestId() == retry && failed.awaitingConfirmation()
                        && failedCamera.started(request, 1002) == null && failed.confirmSubmission(request, 140) == null,
                "an old failure or callback cannot clear or confirm a new guess");
        int[][] observations = {null, {12, 25, 38, 51}, first};
        for (int order = 0; order < 3; order++) {
            for (int index = 0; index < observations.length; index++) {
                Path path = folder.resolve("order-" + order + "-" + index);
                GameScore score = new GameScore(path.toFile());
                score.observe(first, 100);
                long id = score.requestSubmission(27, 110);
                ConfirmationFrame<int[]> camera = new ConfirmationFrame<>(cards -> score.observe(cards, 120));
                camera.request(id);
                if (order == 0) camera.started(id, 2000);
                camera.arrived(1999, observations[index]);
                if (order == 1) camera.started(id, 2000);
                ConfirmationFrame.Match<int[]> match = camera.arrived(2000, first);
                if (order == 2) {
                    for (int i = 1; i <= 4; i++) camera.arrived(2000 + i, first);
                    match = camera.started(id, 2000);
                }
                if (match != null) throw new AssertionError("capture confirmed before success");
                match = camera.completed(id);
                if (match == null) throw new AssertionError("missing tagged capture");
                score.observe(match.image, 130);
                GameScore.Round round = score.confirmSubmission(match.id, 140);
                boolean unchanged = observations[index] == first;
                check((round != null) == unchanged && score.total() == (unchanged ? 10 : 0)
                                && Files.exists(path) == unchanged,
                        "callback order " + order + ", scene " + index + " scores only uninterrupted groups");
                Files.deleteIfExists(path);
            }
        }
    }

    private static void blockedRecovery(Path folder) throws Exception {
        Path file = folder.resolve("blocked");
        String original = "1136936,27,27\n1136937,28,28\nbroken\n";
        Files.writeString(file, original);
        Path obstruction = Files.createDirectory(folder.resolve("blocked.pending"));
        GameScore score = new GameScore(file.toFile());
        for (int i = 0; i < 3; i++) {
            score = new GameScore(file.toFile());
            check(score.repairPending() && score.total() == 20 && score.history().size() == 2,
                    "readable rounds survive failed repair attempt " + (i + 1));
        }
        try {
            score.reset();
            throw new AssertionError("reset should fail when the journal cannot be written");
        } catch (java.io.IOException expected) {
            check(score.total() == 20 && Files.readString(file).equals(original), "failed reset preserves all scores");
        }
        Path backup;
        try (var files = Files.list(folder)) {
            var copies = files.filter(p -> p.getFileName().toString().startsWith("blocked.recovery-")).toArray(Path[]::new);
            check(copies.length == 1 && Files.readString(copies[0]).equals(original), "failed retries share one original backup");
            backup = copies[0];
        }
        Files.delete(obstruction);
        var reopened = new GameScore(file.toFile());
        check(!reopened.repairPending() && reopened.total() == 20 && Files.readAllLines(file).size() == 2,
                "reopening retries the repair after storage is available");
        Files.delete(file);
        Files.delete(backup);
    }

    private static void journalRecovery(Path folder) throws Exception {
        Path legacyFile = folder.resolve("legacy");
        Path matchingBackup = folder.resolve("legacy.recovery-77889900112233.bak");
        Path otherBackup = folder.resolve("legacy.recovery-11223344556677.bak");
        String oldBytes = "1136936,27,27\nbroken\n";
        Files.writeString(legacyFile, oldBytes);
        Files.writeString(matchingBackup, oldBytes);
        Files.writeString(otherBackup, oldBytes.replace("broken", "older!"));
        GameScore recovered = new GameScore(legacyFile.toFile());
        check(recovered.total() == 10 && !recovered.repairPending()
                        && !Files.exists(folder.resolve("legacy.recovery-1.bak"))
                        && Files.readString(matchingBackup).equals(oldBytes)
                        && Files.readString(otherBackup).equals(oldBytes.replace("broken", "older!")),
                "repair reuses a byte-identical legacy backup and preserves other versions");
        Files.delete(legacyFile);
        Files.delete(matchingBackup);
        Files.delete(otherBackup);
        for (String actual : new String[]{"28", "x", ""}) {
            Path sample = folder.resolve("actual-" + actual);
            Files.writeString(sample, "1136936,27," + actual + "\n1136937,28,28\n");
            var repaired = new GameScore(sample.toFile());
            check(repaired.history().size() == 2 && repaired.total() == 20
                            && Files.readString(sample).equals("1136936,27,27\n1136937,28,28\n"),
                    "correct scores survive damaged sum [" + actual + "]");
            Files.delete(sample);
            Files.delete(sample.resolveSibling(sample.getFileName() + ".recovery-1.bak"));
        }
        blockedRecovery(folder);
        Path path = folder.resolve("damaged");
        String original = "1136936,28,28\n1136937,30,\n0,27,27\n1136936,27,27\n1136937,28,28\n";
        byte[] bytes = original.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(path, bytes);
        GameScore score = new GameScore(path.toFile());
        check(score.history().size() == 2 && score.total() == 15 && score.history().get(0).actual == 27
                && score.takeRecoveryCount() == 4 && score.takeRecoveryCount() == 0,
                "damaged rows are isolated and wrong sums are recomputed from the card IDs");
        Path backup;
        try (java.util.stream.Stream<Path> files = Files.list(folder)) {
            backup = files.filter(p -> p.getFileName().toString().startsWith("damaged.recovery-"))
                    .findFirst().orElseThrow();
        }
        check(Arrays.equals(Files.readAllBytes(backup), bytes), "recovery keeps an exact copy of the original file");
        Path restart = Files.copy(path, folder.resolve("fresh-load"));
        GameScore loaded = new GameScore(restart.toFile());
        check(loaded.takeRecoveryCount() == 0 && loaded.total() == 15
                && Files.readString(path).equals("1136936,28,27\n1136937,28,28\n"),
                "a fresh reader loads the repaired rounds from disk");
        for (Path entry : new Path[]{backup, path, restart}) Files.delete(entry);
        Path unreadable = folder.resolve("unreadable");
        Files.write(unreadable, new byte[]{(byte) 0xff, 10});
        GameScore empty = new GameScore(unreadable.toFile());
        int[] cards = {4, 21, 36, 40};
        empty.observe(cards, 100);
        check(empty.takeRecoveryCount() == 1 && empty.total() == 0
                        && submitConfirmed(empty, cards, 27, 110).points == 10,
                "a file containing only damaged bytes still allows new rounds");
        try (java.nio.file.DirectoryStream<Path> entries = Files.newDirectoryStream(folder, "unreadable*")) {
            for (Path entry : entries) Files.delete(entry);
        }
    }

    private static void sharedScoreboards(Path path, int[] first) throws Exception {
        int[] second = {4, 21, 36, 41};
        GameScore left = new GameScore(path.toFile());
        GameScore right = new GameScore(path.toFile());
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            for (boolean same : new boolean[]{false, true}) {
                left.reset();
                int[] group = same ? first : second;
                left.observe(first, 100);
                right.observe(group, 100);
                long a = left.requestSubmission(27, 110);
                long b = right.requestSubmission(same ? 27 : 28, 110);
                left.observe(first, 120);
                right.observe(group, 120);
                java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
                var one = pool.submit(() -> { gate.await(); return left.confirmSubmission(a, 130); });
                var two = pool.submit(() -> { gate.await(); return right.confirmSubmission(b, 130); });
                gate.countDown();
                int recorded = (one.get() == null ? 0 : 1) + (two.get() == null ? 0 : 1);
                int expected = same ? 1 : 2;
                check(recorded == expected && left.total() == expected * 10 && right.total() == left.total()
                                && Files.readAllLines(path).size() == expected,
                        "simultaneous submissions preserve all distinct rounds, same group = " + same);
            }
            right.observe(second, 150);
            left.reset();
            check(!right.visible(151) && right.requestSubmission(28, 152) == 0 && left.total() == 0,
                    "a fresh camera reading from the previous game cannot start a submission");
            check(right.observeForDraft(second, 153) && !right.observeForDraft(second, 154),
                    "the first reading after reset replaces the old draft even for identical cards");
            long pending = right.requestSubmission(28, 155);
            left.reset();
            right.observe(second, 160);
            check(pending != 0 && right.confirmSubmission(pending, 165) == null && Files.size(path) == 0
                            && submitConfirmed(right, second, 28, 170).points == 10 && left.total() == 10,
                    "reset in another scoreboard cancels old guesses and permits new ones");
        } finally {
            pool.shutdownNow();
        }
        Files.delete(path);
    }

    private static void resetConfirmation(Path path, int[] first) throws Exception {
        GameScore home = new GameScore(path.toFile());
        GameScore other = new GameScore(path.toFile());
        int[] second = {4, 21, 36, 41};
        for (boolean replaced : new boolean[]{false, true}) {
            home.observe(first, 100);
            submitConfirmed(home, first, 27, 110);
            var displayed = home.history();
            if (replaced) other.reset();
            int[] group = replaced ? first : second;
            other.observe(group, 200);
            submitConfirmed(other, group, replaced ? 27 : 28, 210);
            byte[] saved = Files.readAllBytes(path);
            check(!home.resetIfUnchanged(displayed) && home.total() == (replaced ? 10 : 20)
                            && Arrays.equals(saved, Files.readAllBytes(path)),
                    "old reset confirmation preserves newer scores, replacement game = " + replaced);
            check(home.resetIfUnchanged(home.history()) && other.history().isEmpty() && Files.size(path) == 0,
                    "a newly reviewed scoreboard can still start a new game");
        }
        Files.delete(path);
    }

    private static void frameGaps(Path folder, int[] cards) throws Exception {
        for (int gap : new int[]{999, 1000, 1001, 1500}) {
            Path path = folder.resolve("frame-gap-" + gap);
            GameScore score = new GameScore(path.toFile());
            score.observe(cards, 100);
            long request = score.requestSubmission(27, 110);
            long next = 100 + gap;
            boolean expired = gap >= GameScore.FRESH_MS;
            check(score.visible(next) == !expired, "previous observation freshness at gap " + gap);
            check(score.observeForDraft(cards, next) == expired, "draft expiration at gap " + gap);
            GameScore.Round round = score.confirmSubmission(request, next);
            check((round == null) == expired && score.total() == (expired ? 0 : 10),
                    "confirmation respects uninterrupted observation at gap " + gap);
            if (expired) check(submitConfirmed(score, cards, 27, next + 1).points == 10,
                    "a new guess works after the interrupted reading at gap " + gap);
            Files.delete(path);
        }
    }

    private static GameScore.Round submitConfirmed(GameScore score, int[] group, int guess, long time)
            throws Exception {
        long request = score.requestSubmission(guess, time);
        score.observe(group, time + 30);
        return score.confirmSubmission(request, time + 40);
    }

    public static void main(String[] args) throws Exception {
        Path fixtures = Path.of(args[0]);
        OpticalReader reader = new OpticalReader();
        OpticalReader.Frame full = read(fixtures.resolve("live-full.png"));
        OpticalReader.Frame missing = read(fixtures.resolve("live-missing.png"));
        int[] found = reader.read(full);
        int[] expected = {4, 21, 36, 40};
        check(Arrays.equals(reader.readAimed(full), expected), "centered guide reads all four card IDs");
        for (int shift : new int[]{150, 400}) {
            OpticalReader.Frame neighbor = shiftedRight(full, shift);
            check(Arrays.equals(reader.read(neighbor), expected), "the offset control contains a readable group");
            check(reader.readAimed(neighbor) == null, "a readable group away from the crosshair is rejected");
        }
        check(Arrays.equals(found, expected), "60 degree dim frame matches all four card IDs");
        check(reader.read(missing) == null, "next frame with one card missing is rejected");
        for (int turn = 1; turn <= 3; turn++) {
            full = quarterTurn(full);
            missing = quarterTurn(missing);
            check(Arrays.equals(reader.readAimed(full), expected) && reader.readAimed(missing) == null,
                    "centered and missing groups at " + (turn * 90) + " degrees");
            check(Arrays.equals(reader.read(full), expected), "read camera orientation " + (turn * 90) + " degrees");
            check(reader.read(missing) == null, "reject missing card at orientation " + (turn * 90) + " degrees");
        }
        check(Arrays.equals(reader.read(cameraRange(full)), expected), "read limited-range camera luminance");
        check(reader.read(cameraRange(missing)) == null, "reject missing card in limited-range luminance");
        check(reader.read(new OpticalReader.Frame(640, 480, new byte[640 * 480])) == null, "blank frame is rejected");
        submissionRace(found, new int[]{12, 25, 38, 51});
        captureBoundary();
        Path path = Files.createTempDirectory(Path.of("build"), "qroker-score-test").resolve("scores");
        confirmationOrder(path.getParent(), found);
        journalRecovery(path.getParent());
        frameGaps(path.getParent(), found);
        sharedScoreboards(path.resolveSibling("shared"), found);
        resetConfirmation(path.resolveSibling("dialog-reset"), found);
        GameScore score = new GameScore(path.toFile());
        score.observe(found, 100);
        check(score.ready(100), "complete group enables guessing");
        score.observe(null, 120);
        check(!score.ready(120) && score.requestSubmission(27, 120) == 0, "missing group invalidates the unsubmitted guess");
        score.observe(found, 150);
        check(!score.ready(1151), "old frame cannot accept a guess");
        score.observe(found, 1200);
        long expired = score.requestSubmission(27, 1200);
        check(expired != 0 && score.requestSubmission(27, 1201) == 0 && !Files.exists(path),
                "rapid repeated presses leave a single pending request and no record");
        score.observe(found, 3200);
        check(score.confirmSubmission(expired, 3200) == null && !score.awaitingConfirmation() && !Files.exists(path),
                "a late capture cannot score a timed-out submission");
        long cancelled = score.requestSubmission(27, 3201);
        check(score.cancelSubmission(cancelled) && score.confirmSubmission(cancelled, 3202) == null,
                "timeout cancellation invalidates its callback");
        long sameGroup = score.requestSubmission(27, 3203);
        check(score.confirmSubmission(expired, 3204) == null && score.awaitingConfirmation(),
                "a previous confirmation cannot consume a new request");
        score.observe(new int[]{21, 4, 40, 36}, 3233);
        GameScore.Round round = score.confirmSubmission(sameGroup, 3243);
        check(round != null && round.actual == 27 && round.points == 10 && score.total() == 10, "return 27 and award ten points");
        check(score.confirmSubmission(sameGroup, 3244) == null && score.history().size() == 1,
                "duplicate confirmation cannot append another round");
        GameScore reopened = new GameScore(path.toFile());
        reopened.observe(new int[]{21, 4, 40, 36}, 3300);
        check(reopened.total() == 10 && reopened.history().size() == 1 && !reopened.ready(3300)
                && reopened.requestSubmission(27, 3300) == 0, "reloaded record prevents double scoring");
        int[] next = {4, 21, 36, 41};
        reopened.observe(next, 3350);
        check(submitConfirmed(reopened, next, 31, 3350).points == 3 && reopened.total() == 13,
                "next group adds points to prior total");
        int[] equalSum = {5, 20, 36, 40};
        reopened.observe(equalSum, 3400);
        check(submitConfirmed(reopened, equalSum, 27, 3400).actual == 27 && reopened.total() == 23,
                "a different four-card code with the same sum gets its own round");
        check(Arrays.equals(new int[]{10, 5, 4, 3, 2, 1, 0}, java.util.stream.IntStream.rangeClosed(0, 6)
                .map(GameScore::points).toArray()), "all seven score thresholds match");
        reopened.reset();
        reopened.observe(found, 3500);
        check(reopened.ready(3500), "a new game allows codes from the previous scoreboard");
        check(new GameScore(path.toFile()).total() == 0, "explicit clearing persists");
        Files.delete(path);
        Files.delete(path.getParent());
    }
}
