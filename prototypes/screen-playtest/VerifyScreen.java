package com.qroker.offline;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import javax.imageio.ImageIO;

public final class VerifyScreen {
    private static OpticalReader.Frame frame(Path file) throws Exception {
        BufferedImage image = ImageIO.read(file.toFile());
        int width = image.getWidth(), height = image.getHeight();
        byte[] luma = new byte[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                luma[y * width + x] = (byte) Math.round(.299 * ((rgb >> 16) & 255)
                        + .587 * ((rgb >> 8) & 255) + .114 * (rgb & 255));
            }
        }
        return new OpticalReader.Frame(width, height, luma);
    }

    public static void main(String[] args) throws Exception {
        Path files = Path.of(args[0]);
        var reader = new OpticalReader();
        var frames = new HashMap<String, int[]>();
        for (String row : Files.readAllLines(files.resolve("expected.tsv"))) {
            String[] fields = row.split("\t");
            int[] expected = fields[1].equals("-") ? null :
                    Arrays.stream(fields[1].split(",")).mapToInt(Integer::parseInt).sorted().toArray();
            int[] actual = reader.read(frame(files.resolve(fields[0])));
            if (!Arrays.equals(expected, actual)) throw new AssertionError(
                    fields[0] + ": expected " + Arrays.toString(expected) + ", read " + Arrays.toString(actual));
            String jpeg = fields[0].replace(".png", ".jpg");
            int[] encoded = reader.read(frame(files.resolve(jpeg)));
            if (!Arrays.equals(expected, encoded)) throw new AssertionError(jpeg + " disagreed with the browser capture");
            frames.put(fields[0], actual);
            System.out.println(fields[0] + (actual == null ? " rejected" :
                    " sum " + Arrays.stream(actual).map(id -> id % 13 + 1).sum()));
        }
        Path temp = Files.createTempDirectory(files, "score-test-");
        Path journal = temp.resolve("scores.csv");
        try {
            int[] sample = frames.get("web-sample.png"), game = frames.get("web-game.png");
            if (Arrays.equals(sample, game)) throw new AssertionError("Expected two distinct sets of cards");
            var score = new GameScore(journal.toFile());
            score.observe(sample, 100);
            long pending = score.requestSubmission(27, 110);
            if (pending == 0) throw new AssertionError("Sample did not open guessing");
            score.observe(frames.get("web-missing.png"), 120);
            if (score.confirmSubmission(pending, 120) != null || score.total() != 0) {
                throw new AssertionError("Stale score was accepted after removing a card");
            }
            score.observe(sample, 200);
            long first = score.requestSubmission(27, 210);
            score.observe(sample, 220);
            if (score.confirmSubmission(first, 220).points != 10) throw new AssertionError("Sample score");
            score.observe(game, 300);
            int realSum = Arrays.stream(game).map(id -> id % 13 + 1).sum();
            int guess = realSum > 4 ? realSum - 1 : realSum + 1;
            long second = score.requestSubmission(guess, 310);
            score.observe(game, 320);
            if (score.confirmSubmission(second, 320).points != 5) throw new AssertionError("Game score");
            var restored = new GameScore(journal.toFile());
            restored.observe(game, 400);
            if (restored.total() != 15 || restored.history().size() != 2 || restored.ready(400)) {
                throw new AssertionError("Restored score or duplicate guard");
            }
            System.out.println("PASS stale guess canceled, total 15 restored, same cards cannot score twice");
        } finally {
            Files.deleteIfExists(journal);
            Files.deleteIfExists(temp.resolve("scores.csv.pending"));
            Files.delete(temp);
        }
    }
}
