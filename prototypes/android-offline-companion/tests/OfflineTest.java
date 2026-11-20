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
            ConfirmationFrame camera = new ConfirmationFrame();
            camera.request(request);
            camera.started(request, 3_000);
            check(request != 0 && score.awaitingConfirmation() && camera.take(2_999) == 0
                    && score.confirmSubmission(0, 132) == null && !Files.exists(journal),
                    "an in-flight preview cannot confirm a guess before the " + labels[i] + " scene arrives");
            score.observe(changes[i], 145);
            check(score.confirmSubmission(camera.take(3_001), 150) == null
                    && score.history().isEmpty() && score.total() == 0 && !Files.exists(journal),
                    labels[i] + " scene cannot record the old guess");
            score.observe(first, 155);
            check(!score.awaitingConfirmation() && score.confirmSubmission(request, 156) == null,
                    labels[i] + " scene cannot resume the cancelled guess when the cards return");
            Files.delete(folder);
        }
    }

    private static void captureBoundary() {
        ConfirmationFrame camera = new ConfirmationFrame();
        camera.request(1);
        check(camera.take(8_000) == 0, "frames before the capture-start callback cannot confirm");
        camera.request(2);
        camera.started(1, 8_000);
        check(camera.take(8_500) == 0, "a late callback cannot arm the next submission");
        camera.started(2, 9_000);
        check(camera.take(8_999) == 0 && camera.take(9_000) == 2 && camera.take(9_001) == 0,
                "only the first frame at or after the tagged capture can confirm");
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
        check(Arrays.equals(found, expected), "60 degree dim frame matches all four card IDs");
        check(reader.read(missing) == null, "next frame with one card missing is rejected");
        for (int turn = 1; turn <= 3; turn++) {
            full = quarterTurn(full);
            missing = quarterTurn(missing);
            check(Arrays.equals(reader.read(full), expected), "read camera orientation " + (turn * 90) + " degrees");
            check(reader.read(missing) == null, "reject missing card at orientation " + (turn * 90) + " degrees");
        }
        check(Arrays.equals(reader.read(cameraRange(full)), expected), "read limited-range camera luminance");
        check(reader.read(cameraRange(missing)) == null, "reject missing card in limited-range luminance");
        check(reader.read(new OpticalReader.Frame(640, 480, new byte[640 * 480])) == null, "blank frame is rejected");
        submissionRace(found, new int[]{12, 25, 38, 51});
        captureBoundary();
        Path path = Files.createTempDirectory(Path.of("build"), "qroker-score-test").resolve("scores");
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
        check(Arrays.equals(new int[]{10, 5, 4, 3, 2, 1, 0}, java.util.stream.IntStream.rangeClosed(0, 6)
                .map(GameScore::points).toArray()), "all seven score thresholds match");
        reopened.reset();
        check(new GameScore(path.toFile()).total() == 0, "explicit clearing persists");
        Files.delete(path);
        Files.delete(path.getParent());
    }
}
