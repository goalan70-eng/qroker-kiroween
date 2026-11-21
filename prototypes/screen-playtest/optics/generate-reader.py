"""Use the companion's frame detector with the trial deck's bit decisions."""
from pathlib import Path
import sys


source, output = map(Path, sys.argv[1:])
original = source.read_text(encoding="utf-8")
start = original.index("        double[] bars = Layout30.BARS[slot]")
end = original.index("\n    private static final class Readings", start)
body = """        double[] originalBars = Layout30.BARS[slot];
        double[] bars = java.util.Arrays.copyOf(originalBars, originalBars.length + ExtraBars.SAMPLE[slot].length);
        System.arraycopy(ExtraBars.SAMPLE[slot], 0, bars, originalBars.length, ExtraBars.SAMPLE[slot].length);
        double[] contrast = new double[bars.length / 36], highlights = new double[contrast.length];
        for (int i = 0; i < contrast.length; i++) {
            double first = 0, second = 0;
            for (int j = 0; j < 18; j += 2) {
                first += project(frame, h, bars, i * 36 + j);
                second += project(frame, h, bars, i * 36 + 18 + j);
            }
            contrast[i] = (first - second) / 9;
            highlights[i] = Math.max(first, second) / 9;
            if (!Double.isFinite(contrast[i])) return -1;
        }
        int last = contrast.length - 1;
        if (contrast[last] < 20) contrast[last] = 0;
        return ErasureDecoder.read(contrast, highlights, ExtraBars.BITS);
    }
"""
output.write_text(original[:start] + body + original[end:], encoding="utf-8")
