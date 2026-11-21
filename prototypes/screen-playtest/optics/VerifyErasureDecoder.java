package com.qroker.offline;

import java.util.SplittableRandom;

public final class VerifyErasureDecoder {
    private static long positive;

    private static void require(int expected, int actual) {
        if (actual != expected) throw new AssertionError("Expected " + expected + ", got " + actual);
    }

    private static void allSmallMasks(int id, int available, int start, int remaining) {
        require(id, ErasureDecoder.match(TrialWords.TRIAL[id], available));
        positive++;
        if (remaining == 0) return;
        for (int i = start; i < 29; i++) allSmallMasks(id, available ^ (1 << i), i + 1, remaining - 1);
    }

    public static void main(String[] args) {
        SplittableRandom rng = new SplittableRandom(26112052L);
        int negatives = 0;
        for (int id = 0; id < TrialWords.TRIAL.length; id++) {
            int word = TrialWords.TRIAL[id], legacy = TrialWords.PRIOR[id];
            allSmallMasks(id, ErasureDecoder.ALL, 0, 3);
            for (int erased = 4; erased <= 7; erased++) {
                for (int repetition = 0; repetition < 128; repetition++) {
                    int mask = 0;
                    while (Integer.bitCount(mask) < erased) mask |= 1 << rng.nextInt(29);
                    int known = ErasureDecoder.ALL ^ mask;
                    if (erased <= TrialWords.MAX_ERASURES) {
                        require(id, ErasureDecoder.match(word, known));
                        positive++;
                        require(-1, ErasureDecoder.match(word ^ Integer.lowestOneBit(known), known));
                        negatives++;
                    } else {
                        require(-1, ErasureDecoder.match(word, known));
                        negatives++;
                    }
                    require(-1, ErasureDecoder.match(legacy, known));
                    negatives++;
                }
            }
            require(-1, ErasureDecoder.match(legacy, ErasureDecoder.ALL));
            negatives++;
        }
        System.out.println(positive + " accepted erasure cases; " + negatives + " rejected controls");
    }
}
