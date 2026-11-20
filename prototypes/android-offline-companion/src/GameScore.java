package com.qroker.offline;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class GameScore {
    private static final int[] REWARDS = {10, 5, 4, 3, 2, 1};
    static final long FRESH_MS = 1000;
    private final File file;
    private final List<Round> history = new ArrayList<>();
    private final Set<Integer> recorded = new HashSet<>();
    private int total;
    private int[] cards;
    private long observedAt;

    static final class Round {
        final int key, guess, actual, points;
        Round(int key, int guess, int actual, int points) {
            this.key = key;
            this.guess = guess;
            this.actual = actual;
            this.points = points;
        }
    }

    GameScore(File file) throws IOException {
        this.file = file;
        if (!file.exists()) return;
        for (String line : Files.readAllLines(file.toPath(), StandardCharsets.UTF_8)) {
            String[] fields = line.split(",");
            try {
                if (fields.length != 3) throw new IllegalArgumentException();
                int key = Integer.parseInt(fields[0]);
                int guess = Integer.parseInt(fields[1]);
                int actual = Integer.parseInt(fields[2]);
                if (!validGuess(guess) || !validGuess(actual) || !recorded.add(key))
                    throw new IllegalArgumentException();
                Round round = new Round(key, guess, actual, points(Math.abs(guess - actual)));
                history.add(round);
                total += round.points;
            } catch (IllegalArgumentException e) {
                throw new IOException("Invalid score journal", e);
            }
        }
    }

    static int points(int error) {
        return error < REWARDS.length ? REWARDS[error] : 0;
    }

    static boolean validGuess(int value) {
        return value >= 4 && value <= 52;
    }

    void observe(int[] ids, long time) {
        cards = null;
        if (ids == null || ids.length != 4) return;
        int[] ordered = ids.clone();
        Arrays.sort(ordered);
        if (ordered[0] < 0 || ordered[3] >= 52
                || ordered[0] == ordered[1] || ordered[1] == ordered[2] || ordered[2] == ordered[3]) return;
        cards = ordered;
        observedAt = time;
    }

    private int key() {
        int key = 0;
        for (int id : cards) key = (key << 6) | id;
        return key;
    }

    boolean ready(long now) { return visible(now) && !recorded.contains(key()); }

    boolean visible(long now) { return cards != null && now >= observedAt && now - observedAt <= FRESH_MS; }

    int total() { return total; }

    List<Round> history() { return Collections.unmodifiableList(history); }

    Round submit(int guess, long now) throws IOException {
        if (!validGuess(guess) || !ready(now)) return null;
        int actual = 0;
        for (int card : cards) actual += card % 13 + 1;
        Round round = new Round(key(), guess, actual, points(Math.abs(guess - actual)));
        List<Round> updated = new ArrayList<>(history);
        updated.add(round);
        write(updated);
        history.add(round);
        recorded.add(round.key);
        total += round.points;
        return round;
    }

    void reset() throws IOException {
        write(Collections.emptyList());
        history.clear();
        recorded.clear();
        cards = null;
        total = 0;
    }

    private void write(List<Round> rounds) throws IOException {
        File temporary = new File(file.getParentFile(), file.getName() + ".pending");
        StringBuilder lines = new StringBuilder();
        for (Round round : rounds)
            lines.append(round.key).append(',').append(round.guess).append(',').append(round.actual).append('\n');
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(lines.toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING);
    }
}
