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
        Path path = Files.createTempDirectory(Path.of("build"), "qroker-score-test").resolve("scores");
        GameScore score = new GameScore(path.toFile());
        score.observe(found, 100);
        check(score.ready(100), "complete group enables guessing");
        score.observe(null, 120);
        check(!score.ready(120) && score.submit(27, 120) == null, "missing group invalidates the unsubmitted guess");
        score.observe(found, 150);
        check(!score.ready(1151), "old frame cannot accept a guess");
        score.observe(found, 1200);
        GameScore.Round round = score.submit(27, 1200);
        check(round != null && round.actual == 27 && round.points == 10 && score.total() == 10, "return 27 and award ten points");
        GameScore reopened = new GameScore(path.toFile());
        reopened.observe(new int[]{21, 4, 40, 36}, 1300);
        check(reopened.total() == 10 && reopened.history().size() == 1 && !reopened.ready(1300)
                && reopened.submit(27, 1300) == null, "reloaded record prevents double scoring");
        reopened.observe(new int[]{4, 21, 36, 41}, 1350);
        check(reopened.submit(31, 1350).points == 3 && reopened.total() == 13,
                "next group adds points to prior total");
        check(Arrays.equals(new int[]{10, 5, 4, 3, 2, 1, 0}, java.util.stream.IntStream.rangeClosed(0, 6)
                .map(GameScore::points).toArray()), "all seven score thresholds match");
        reopened.reset();
        check(new GameScore(path.toFile()).total() == 0, "explicit clearing persists");
        Files.delete(path);
        Files.delete(path.getParent());
    }
}
