package com.qroker.offline;

import java.util.Arrays;

/** Only accepts one exact match among the observations that survived. */
final class ErasureDecoder {
    private static final int DATA = Layout30.DATA;
    private static final int CHECK = DATA + 9 + Layout30.MIRRORS.length;
    private static final int ORIGINAL_SITES = CHECK + 5;
    private static final int[] NO_EXTRA = {};
    static final int ALL = (1 << (DATA + 9 + 5)) - 1;

    static int read(double[] contrast, double[] highlights) {
        return read(contrast, highlights, NO_EXTRA);
    }

    static int read(double[] contrast, double[] highlights, int[] extraBits) {
        double[] strengths = Arrays.stream(contrast, 0, ORIGINAL_SITES).map(Math::abs).sorted().toArray();
        double minContrast = Math.max(8, strengths[strengths.length / 2] * .23);
        double[] sortedHighlights = Arrays.copyOf(highlights, ORIGINAL_SITES);
        Arrays.sort(sortedHighlights);
        double paper = sortedHighlights[sortedHighlights.length / 2];
        double unusualHighlight = paper + Math.max(24, (255 - paper) * .20);
        int observed = 0, known = 0, conflicted = 0;
        for (int i = 0; i < contrast.length; i++) {
            if (Math.abs(contrast[i]) < minContrast || highlights[i] > unusualHighlight) continue;
            int bit;
            boolean one;
            if (i < DATA) {
                bit = i;
                one = contrast[i] > 0;
            } else if (i < DATA + 9) {
                bit = i;
                one = contrast[i] < 0;
            } else if (i < CHECK) {
                bit = DATA + Layout30.MIRRORS[i - DATA - 9];
                one = contrast[i] > 0;
            } else if (i < ORIGINAL_SITES) {
                bit = DATA + 9 + (i - CHECK);
                one = contrast[i] > 0;
            } else {
                bit = extraBits[i - ORIGINAL_SITES];
                one = contrast[i] > 0;
            }
            int mask = 1 << bit;
            if ((known & mask) != 0 && ((observed & mask) != 0) != one) conflicted |= mask;
            if (one) observed |= mask;
            known |= mask;
        }
        return match(observed, known & ~conflicted);
    }

    static int match(int observed, int known) {
        if (Integer.bitCount(ALL & ~known) > TrialWords.MAX_ERASURES) return -1;
        int found = -1;
        for (int i = 0; i < TrialWords.TRIAL.length; i++) {
            if (((observed ^ TrialWords.TRIAL[i]) & known) == 0) {
                if (found >= 0) return -1;
                found = i;
            }
        }
        if (found < 0) return -1;
        for (int old : TrialWords.PRIOR) if (((observed ^ old) & known) == 0) return -1;
        return found;
    }
}
