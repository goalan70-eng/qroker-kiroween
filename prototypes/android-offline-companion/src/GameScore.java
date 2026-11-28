package com.qroker.offline;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

final class GameScore {
    private static final int[] REWARDS = {10, 5, 4, 3, 2, 1};
    static final long FRESH_MS = 1000;
    static final long CONFIRM_MS = 2000;
    private final ScoreJournal journal;
    private int[] cards;
    private long observedAt;
    private long observedGeneration;
    private Submission pending;
    private long nextSubmission;

    private static final class Submission {
        final long id, requestedAt, generation;
        final int key, guess;

        Submission(long id, long requestedAt, int key, int guess, long generation) {
            this.id = id;
            this.requestedAt = requestedAt;
            this.generation = generation;
            this.key = key;
            this.guess = guess;
        }
    }

    static final class Round {
        final int key, guess, actual, points;
        Round(int key, int guess, int actual) {
            this.key = key;
            this.guess = guess;
            this.actual = actual;
            this.points = points(Math.abs(guess - actual));
        }
    }

    GameScore(File file) throws IOException {
        journal = ScoreJournal.open(file);
        observedGeneration = journal.generation();
    }

    static int sumFromKey(int key) {
        int next = 52, sum = 0;
        for (int slot = 0; slot < 4; slot++) {
            int card = key & 63;
            if (card >= next) return -1;
            sum += card % 13 + 1;
            next = card;
            key >>>= 6;
        }
        return key == 0 ? sum : -1;
    }

    static int points(int error) {
        return error < REWARDS.length ? REWARDS[error] : 0;
    }

    static boolean validGuess(int value) {
        return value >= 4 && value <= 52;
    }

    void observe(int[] ids, long time) {
        observeForDraft(ids, time);
    }

    /** A draft cannot span a game reset or a gap in fresh camera observations. */
    boolean observeForDraft(int[] ids, long time) {
        long generation = journal.generation();
        boolean discardDraft = generation != observedGeneration
                || (cards != null && time - observedAt >= FRESH_MS);
        observedGeneration = generation;
        cards = orderedGroup(ids);
        observedAt = time;
        if (pending != null && (discardDraft || cards == null || pending.key != key())) pending = null;
        return discardDraft;
    }

    private static int[] orderedGroup(int[] ids) {
        if (ids == null || ids.length != 4) return null;
        int[] ordered = ids.clone();
        Arrays.sort(ordered);
        if (ordered[0] < 0 || ordered[3] >= 52
                || ordered[0] == ordered[1] || ordered[1] == ordered[2] || ordered[2] == ordered[3]) return null;
        return ordered;
    }

    private int key() { return groupKey(cards); }

    private static int groupKey(int[] cards) {
        int key = 0;
        for (int id : cards) key = (key << 6) | id;
        return key;
    }

    enum LockResult { LOCKED, UNREADABLE, DUPLICATE, GAME_CHANGED }

    private int lockedKey = -1;
    private long lockedGeneration;

    long generation() { return journal.generation(); }

    LockResult lockCaptured(int[] ids, long captureGeneration) {
        int[] group = orderedGroup(ids);
        return restoreLock(group == null ? -1 : groupKey(group), captureGeneration);
    }

    int lockedKey() { return lockedKey; }
    long lockedGeneration() { return lockedGeneration; }

    LockResult restoreLock(int key, long captureGeneration) {
        discardLock();
        if (captureGeneration != generation()) return LockResult.GAME_CHANGED;
        if (sumFromKey(key) < 0) return LockResult.UNREADABLE;
        if (journal.contains(key)) return LockResult.DUPLICATE;
        lockedKey = key;
        lockedGeneration = captureGeneration;
        return LockResult.LOCKED;
    }

    boolean lockIsCurrent() {
        return lockedKey >= 0 && lockedGeneration == generation() && !journal.contains(lockedKey);
    }

    void discardLock() { lockedKey = -1; }

    Round scoreLocked(int guess) throws IOException {
        if (!validGuess(guess) || !lockIsCurrent()) return null;
        Round round = new Round(lockedKey, guess, sumFromKey(lockedKey));
        boolean saved = journal.append(round, lockedGeneration);
        // An IOException leaves the lock intact for a retry.
        discardLock();
        return saved ? round : null;
    }

    boolean ready(long now) { return visible(now) && !journal.contains(key()); }

    boolean visible(long now) {
        return cards != null && observedGeneration == journal.generation()
                && now >= observedAt && now - observedAt < FRESH_MS;
    }

    int total() { return journal.total(); }

    int takeRecoveryCount() { return journal.takeRecoveryCount(); }
    boolean repairPending() { return journal.repairPending(); }

    List<Round> history() { return journal.history(); }

    long requestSubmission(int guess, long now) {
        if (!validGuess(guess) || !ready(now) || pending != null) return 0;
        pending = new Submission(++nextSubmission, now, key(), guess, observedGeneration);
        return pending.id;
    }

    boolean awaitingConfirmation() { return pending != null; }

    boolean cancelSubmission(long id) {
        if (pending == null || pending.id != id) return false;
        pending = null;
        return true;
    }

    Round confirmSubmission(long id, long now) throws IOException {
        if (pending == null || pending.id != id) return null;
        Submission submission = pending;
        pending = null;
        if (!ready(now) || observedAt < submission.requestedAt || now - submission.requestedAt >= CONFIRM_MS)
            return null;
        Round round = new Round(submission.key, submission.guess, sumFromKey(submission.key));
        return journal.append(round, submission.generation) ? round : null;
    }

    boolean resetIfUnchanged(List<Round> displayed) throws IOException {
        if (!journal.resetIfUnchanged(displayed)) return false;
        discardLock();
        observe(null, 0);
        return true;
    }

    void reset() throws IOException {
        journal.reset();
        discardLock();
        cards = null;
        pending = null;
    }
}
