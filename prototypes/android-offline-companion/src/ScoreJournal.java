package com.qroker.offline;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.nio.file.DirectoryStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.WeakHashMap;

/** All scoreboards in the app process share the committed rounds, but not their camera sessions. */
final class ScoreJournal {
    private static final WeakHashMap<File, WeakReference<ScoreJournal>> openFiles = new WeakHashMap<>();
    private final File file;
    private final Set<Integer> keys = new HashSet<>();
    private List<GameScore.Round> rounds = Collections.emptyList();
    private int total;
    private long generation;
    private int recoveredRows;
    private boolean repairPending;

    static synchronized ScoreJournal open(File path) throws IOException {
        File file = path.getCanonicalFile();
        WeakReference<ScoreJournal> ref = openFiles.get(file);
        ScoreJournal journal = ref == null ? null : ref.get();
        if (journal == null) {
            journal = new ScoreJournal(file);
            // Replace a stale weak key with the File held by the new live journal.
            openFiles.remove(file);
            openFiles.put(file, new WeakReference<>(journal));
        }
        journal.retryRepair();
        return journal;
    }

    private ScoreJournal(File file) throws IOException {
        this.file = file;
        if (!file.exists()) return;
        List<GameScore.Round> loaded = new ArrayList<>();
        HashMap<Integer, Integer> reconstructed = new HashMap<>();
        // The journal contains only ASCII numbers. A damaged byte must affect only its own row.
        for (String line : Files.readAllLines(file.toPath(), StandardCharsets.ISO_8859_1)) {
            String[] fields = line.split(",", -1);
            try {
                if (fields.length != 3) throw new NumberFormatException();
                int key = Integer.parseInt(fields[0]);
                int guess = Integer.parseInt(fields[1]);
                int sum = GameScore.sumFromKey(key);
                if (sum < 0 || !GameScore.validGuess(guess)) {
                    recoveredRows++;
                    continue;
                }
                GameScore.Round round = new GameScore.Round(key, guess, sum);
                boolean intact = Integer.toString(sum).equals(fields[2]);
                if (!keys.add(key)) {
                    // Prefer an intact entry to one reconstructed from an unreadable sum.
                    Integer index = intact ? reconstructed.remove(key) : null;
                    if (index != null) loaded.set(index, round);
                    else recoveredRows++;
                    continue;
                }
                if (!intact) {
                    recoveredRows++;
                    try { Integer.parseInt(fields[2]); }
                    catch (NumberFormatException unreadable) { reconstructed.put(key, loaded.size()); }
                }
                loaded.add(round);
            } catch (NumberFormatException incomplete) {
                recoveredRows++;
            }
        }
        rounds = Collections.unmodifiableList(loaded);
        for (GameScore.Round round : rounds) total += round.points;
        repairPending = recoveredRows != 0;
    }

    private synchronized void retryRepair() {
        if (!repairPending) return;
        try { write(rounds); }
        catch (IOException unavailable) { /* Keep the readable rounds and retry on the next open or write. */ }
    }

    synchronized boolean repairPending() { return repairPending; }

    synchronized int takeRecoveryCount() {
        int count = recoveredRows;
        recoveredRows = 0;
        return count;
    }

    synchronized long generation() { return generation; }
    synchronized boolean contains(int key) { return keys.contains(key); }
    synchronized int total() { return total; }
    synchronized List<GameScore.Round> history() { return rounds; }

    synchronized boolean append(GameScore.Round round, long expectedGeneration) throws IOException {
        if (generation != expectedGeneration || keys.contains(round.key)) return false;
        List<GameScore.Round> updated = new ArrayList<>(rounds);
        updated.add(round);
        write(updated);
        rounds = Collections.unmodifiableList(updated);
        keys.add(round.key);
        total += round.points;
        return true;
    }

    synchronized boolean resetIfUnchanged(List<GameScore.Round> displayed) throws IOException {
        // Each committed change publishes a new immutable history. An identical total can belong to a new game.
        if (rounds != displayed) return false;
        reset();
        return true;
    }

    synchronized void reset() throws IOException {
        write(Collections.emptyList());
        rounds = Collections.emptyList();
        keys.clear();
        total = 0;
        generation++;
    }

    private void write(List<GameScore.Round> updated) throws IOException {
        if (repairPending) preserveOriginal();
        File temporary = new File(file.getParentFile(), file.getName() + ".pending");
        StringBuilder lines = new StringBuilder();
        for (GameScore.Round round : updated)
            lines.append(round.key).append(',').append(round.guess).append(',').append(round.actual).append('\n');
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(lines.toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING);
        repairPending = false;
    }

    private void preserveOriginal() throws IOException {
        byte[] original = Files.readAllBytes(file.toPath());
        Path source = file.toPath();
        String prefix = file.getName() + ".recovery-";
        // Previous releases also used random suffixes for backups.
        try (DirectoryStream<Path> backups = Files.newDirectoryStream(source.getParent(), path -> {
            String name = path.getFileName().toString();
            return name.startsWith(prefix) && name.endsWith(".bak");
        })) {
            for (Path backup : backups) {
                if (Files.isRegularFile(backup) && Files.isReadable(backup) && Files.size(backup) == original.length
                        && Arrays.equals(original, Files.readAllBytes(backup))) return;
            }
        }
        for (int index = 1; ; index++) {
            Path backup = source.resolveSibling(prefix + index + ".bak");
            if (Files.exists(backup)) continue;
            Path staging = backup.resolveSibling(backup.getFileName() + ".tmp");
            try (FileOutputStream output = new FileOutputStream(staging.toFile())) {
                output.write(original);
                output.getFD().sync();
            }
            Files.move(staging, backup, StandardCopyOption.ATOMIC_MOVE);
            return;
        }
    }
}
