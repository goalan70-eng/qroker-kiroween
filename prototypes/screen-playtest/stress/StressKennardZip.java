package com.qroker.offline;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.SplittableRandom;

/** Deterministic stress matrix over the SVG-derived scenes, passed to the Android reader. */
public final class StressKennardZip {
    private static final int W = 960, H = 720;
    private static final double FOCAL = 710;
    private static final long SEED = 26112052L;

    private enum Effect { NONE, TEXTURE, EDGE, SHADOW, SMALL_GLARE, LARGE_GLARE, RIM_GLARE, RIM_GLARE_WIDE,
        TOP_GLARE, SOFT,
        DEFOCUS, MOTION, LONG_MOTION, BLOCK_MARKER, DISTRACTOR }

    private record Case(String name, String cards, int[] expected, OpticalReader.Frame scene) {}
    private record Condition(String name, int degrees, int width, int white, int black, int noise, Effect effect,
                             int tiltDirection) {}

    private static Condition c(String name, int angle, int width, int white, int black, int noise, Effect effect) {
        return new Condition(name, angle, width, white, black, noise, effect, 0);
    }

    private static final List<Condition> POSITIVE = List.of(
            c("front-151-bright", 0, 151, 232, 16, 2, Effect.NONE),
            c("tilt30-128-bright", 30, 128, 232, 16, 2, Effect.NONE),
            c("tilt45-96-bright", 45, 96, 232, 16, 2, Effect.NONE),
            c("tilt60-151-bright", 60, 151, 232, 16, 2, Effect.NONE),
            c("tilt60-96-bright", 60, 96, 232, 16, 2, Effect.NONE),
            c("tilt45-128-dim", 45, 128, 94, 10, 4, Effect.NONE),
            c("tilt60-151-dim", 60, 151, 94, 10, 4, Effect.NONE),
            c("tilt60-128-dim", 60, 128, 94, 10, 4, Effect.NONE),
            c("tilt60-96-dim", 60, 96, 94, 10, 4, Effect.NONE),
            c("tilt45-128-texture", 45, 128, 190, 16, 3, Effect.TEXTURE),
            c("tilt45-128-edge", 45, 128, 190, 16, 3, Effect.EDGE),
            c("tilt45-128-shadow", 45, 128, 190, 16, 3, Effect.SHADOW),
            c("tilt60-128-shadow", 60, 128, 94, 10, 4, Effect.SHADOW),
            c("tilt45-128-small-glare", 45, 128, 190, 16, 3, Effect.SMALL_GLARE),
            c("tilt60-128-small-glare", 60, 128, 94, 10, 4, Effect.SMALL_GLARE),
            c("tilt45-128-large-glare", 45, 128, 190, 16, 3, Effect.LARGE_GLARE),
            c("tilt45-128-soft", 45, 128, 190, 16, 3, Effect.SOFT),
            c("tilt60-128-soft", 60, 128, 94, 10, 4, Effect.SOFT),
            c("tilt60-96-soft", 60, 96, 94, 10, 4, Effect.SOFT),
            c("tilt60-151-defocus", 60, 151, 94, 10, 4, Effect.DEFOCUS),
            c("tilt60-96-defocus", 60, 96, 94, 10, 4, Effect.DEFOCUS),
            c("tilt45-128-motion", 45, 128, 190, 16, 3, Effect.MOTION),
            c("tilt60-128-motion", 60, 128, 94, 10, 4, Effect.MOTION),
            c("tilt60-128-long-motion", 60, 128, 94, 10, 4, Effect.LONG_MOTION),
            c("tilt60-128-very-dim", 60, 128, 56, 14, 7, Effect.NONE),
            c("tilt60-96-very-dim", 60, 96, 56, 14, 7, Effect.NONE),
            c("tilt45-72-dim", 45, 72, 94, 10, 4, Effect.NONE),
            c("tilt60-72-dim", 60, 72, 94, 10, 4, Effect.NONE),
            c("tilt60-56-dim", 60, 56, 94, 10, 4, Effect.NONE),
            c("tilt65-128-dim", 65, 128, 94, 10, 4, Effect.NONE),
            c("tilt70-128-dim", 70, 128, 94, 10, 4, Effect.NONE)
    );

    private static final List<Condition> NEGATIVE = List.of(
            c("missing-front", 0, 151, 232, 16, 2, Effect.NONE),
            c("missing-tilt60-dim", 60, 96, 94, 10, 4, Effect.NONE),
            c("missing-with-distractor", 45, 128, 190, 16, 3, Effect.DISTRACTOR),
            c("missing-motion-and-dim", 60, 128, 94, 10, 4, Effect.MOTION),
            c("covered-front", 0, 151, 232, 16, 2, Effect.BLOCK_MARKER),
            c("covered-tilt60-dim", 60, 128, 94, 10, 4, Effect.BLOCK_MARKER)
    );

    private static final List<Condition> DIRECTIONS = List.of(
            new Condition("tilt60-horizontal-128-dim", 60, 128, 94, 10, 4, Effect.NONE, 90),
            new Condition("tilt60-horizontal-96-dim", 60, 96, 94, 10, 4, Effect.NONE, 90),
            new Condition("tilt60-diagonal-128-dim", 60, 128, 94, 10, 4, Effect.NONE, 45),
            new Condition("tilt60-diagonal-96-dim", 60, 96, 94, 10, 4, Effect.NONE, 45),
            new Condition("tilt60-diagonal-96-soft", 60, 96, 94, 10, 4, Effect.SOFT, 45),
            new Condition("tilt60-horizontal-96-covered", 60, 96, 94, 10, 4, Effect.BLOCK_MARKER, 90),
            new Condition("tilt60-diagonal-96-covered", 60, 96, 94, 10, 4, Effect.BLOCK_MARKER, 45)
    );

    private static final List<Condition> AROUND_JOKER = List.of(
            c("near-joker-45-128-bright", 45, 128, 190, 16, 3, Effect.RIM_GLARE),
            c("near-joker-60-128-dim", 60, 128, 94, 10, 4, Effect.RIM_GLARE),
            c("near-joker-60-96-dim", 60, 96, 94, 10, 4, Effect.RIM_GLARE),
            c("near-joker-45-128-wide-glare", 45, 128, 190, 16, 3, Effect.RIM_GLARE_WIDE),
            c("near-joker-60-128-wide-glare", 60, 128, 94, 10, 4, Effect.RIM_GLARE_WIDE)
    );

    private static final List<Condition> JOKER_TOP = List.of(
            POSITIVE.get(0), POSITIVE.get(8),
            c("top-joker-45-128-glare", 45, 128, 190, 16, 3, Effect.TOP_GLARE),
            c("top-joker-60-96-glare", 60, 96, 94, 10, 4, Effect.TOP_GLARE),
            NEGATIVE.get(1), NEGATIVE.get(5)
    );

    private static OpticalReader.Frame project(OpticalReader.Frame source, Condition c, int index) {
        SplittableRandom rng = new SplittableRandom(SEED + index);
        int quarter = index % 4;
        double cx = W * (.35 + .30 * rng.nextDouble()), cy = H * (.37 + .26 * rng.nextDouble());
        if (c.effect == Effect.EDGE) {
            cx = W * (index % 2 == 0 ? .12 : .88);
            cy = H * (index % 4 < 2 ? .17 : .83);
        }
        double roll = quarter * Math.PI / 2 + rng.nextDouble(-.44, .44);
        double cos = Math.cos(roll), sin = Math.sin(roll);
        double tilt = Math.toRadians(c.degrees);
        double tc = Math.cos(tilt), ts = Math.sin(tilt) / FOCAL;
        double planeAngle = Math.toRadians(c.tiltDirection);
        double planeCos = Math.cos(planeAngle), planeSin = Math.sin(planeAngle);
        double xOffset = (quarter % 2 == 0 ? -1 : 1) * .25;
        double yOffset = (quarter < 2 ? -1 : 1) * .25;
        double glareRadius = c.effect == Effect.LARGE_GLARE ? .32 : .105;
        boolean rimGlare = c.effect == Effect.RIM_GLARE || c.effect == Effect.RIM_GLARE_WIDE;
        if (rimGlare) {
            boolean alongSeam = index % 3 == 0;
            xOffset = Math.copySign(alongSeam ? .21 : .16, xOffset);
            yOffset = Math.copySign(alongSeam ? .035 : .22, yOffset);
            glareRadius = c.effect == Effect.RIM_GLARE_WIDE ? .20 : .12;
        } else if (c.effect == Effect.TOP_GLARE) {
            xOffset = Math.copySign(index % 3 == 0 ? .04 : .095, xOffset);
            yOffset = Math.copySign(.22, yOffset);
            glareRadius = index % 2 == 0 ? .12 : .18;
        }
        double[] scene = new double[W * H];
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                double dx = x + .5 - cx, dy = y + .5 - cy;
                double u = cos * dx + sin * dy, v = -sin * dx + cos * dy;
                double denominator = tc - v * ts;
                double py = denominator > .01 ? v / c.width / denominator : 1e6;
                double px = u * (1.0 / c.width + py * ts);
                double sx = planeCos * px - planeSin * py, sy = planeSin * px + planeCos * py;
                double luma = 139;
                boolean onScene = Math.abs(sx) < 63.5 / 30 && Math.abs(sy) < 88.9 / 30;
                if (onScene) {
                    double sample = source.sample(source.width * (.5 + sx * 30 / 127),
                            source.height * (.5 + sy * 30 / 177.8));
                    if (Double.isFinite(sample)) luma = sample;
                }
                if (c.effect == Effect.TEXTURE && luma == 139) {
                    luma = 130 + 24 * Math.sin(sx * 31 + Math.sin(sy * 13))
                            + 28 * Math.sin(sy * 6 - sx * 5);
                }
                if (c.effect == Effect.DISTRACTOR) {
                    int blockX = (x - 60) / 6, blockY = (y - 470) / 6;
                    if (x >= 60 && y >= 470 && blockX < 16 && blockY < 16) {
                        boolean frame = blockX == 0 || blockX == 15 || blockY == 0 || blockY == 15;
                        luma = frame || ((blockX * 47 ^ blockY * 101) & 7) < 4 ? 0 : 255;
                    }
                }
                double tone = c.black + (c.white - c.black) * luma / 255;
                if (c.effect == Effect.SHADOW) {
                    double shade = clamp((sx + sy + .16) * 22, 0, 1);
                    tone = 9 + (tone - 9) * (.34 + .66 * shade);
                }
                if (c.effect == Effect.SMALL_GLARE || c.effect == Effect.LARGE_GLARE || rimGlare
                        || c.effect == Effect.TOP_GLARE) {
                    double gx = sx - xOffset, gy = (sy - yOffset) * 1.5;
                    double mask = clamp(1 - (gx * gx + gy * gy) / (glareRadius * glareRadius), 0, 1);
                    tone += (255 - tone) * Math.min(1, mask * 1.5);
                }
                if (c.effect == Effect.BLOCK_MARKER && Math.abs(sx - xOffset) < .28
                        && Math.abs(sy - yOffset) < .28) tone = c.white * .58;
                scene[y * W + x] = tone + 7 * dx / W;
            }
        }
        scene = blur(scene, c.effect, index);
        byte[] out = new byte[scene.length];
        for (int i = 0; i < out.length; i++) {
            int n = rng.nextInt(-c.noise, c.noise + 1) + rng.nextInt(-c.noise, c.noise + 1);
            out[i] = (byte) Math.round(clamp(scene[i] + n, 0, 255));
        }
        return new OpticalReader.Frame(W, H, out);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double[] blur(double[] src, Effect effect, int index) {
        return switch (effect) {
            case SOFT -> convolve(convolve(src, new int[]{1, 2, 1}, 1, 0), new int[]{1, 2, 1}, 0, 1);
            case DEFOCUS -> convolve(convolve(src, new int[]{1, 4, 6, 4, 1}, 1, 0),
                    new int[]{1, 4, 6, 4, 1}, 0, 1);
            case MOTION, LONG_MOTION -> {
                int[] taps = new int[effect == Effect.MOTION ? 5 : 11];
                Arrays.fill(taps, 1);
                int[][] directions = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
                int[] d = directions[index % directions.length];
                yield convolve(src, taps, d[0], d[1]);
            }
            default -> src;
        };
    }

    private static double[] convolve(double[] src, int[] taps, int dx, int dy) {
        int weight = Arrays.stream(taps).sum(), radius = taps.length / 2;
        double[] out = new double[src.length];
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                double value = 0;
                for (int k = -radius; k <= radius; k++) {
                    int ix = (int) clamp(x + dx * k, 0, W - 1), iy = (int) clamp(y + dy * k, 0, H - 1);
                    value += taps[k + radius] * src[iy * W + ix];
                }
                out[y * W + x] = value / weight;
            }
        }
        return out;
    }

    private static int sum(int[] ids) {
        return ids == null ? -1 : Arrays.stream(ids).map(id -> id % 13 + 1).sum();
    }

    private static void evaluate(Condition c, List<Case> cases, boolean expectedRead,
                                 OpticalReader reader, StringBuilder rows) {
        int passes = 0, misses = 0, wrong = 0;
        for (int i = 0; i < cases.size(); i++) {
            Case test = cases.get(i);
            int[] expected = expectedRead ? test.expected : null;
            int[] actual = reader.read(project(test.scene, c, i));
            String verdict;
            if (Arrays.equals(expected, actual)) {
                passes++;
                verdict = "pass";
            } else if (actual == null) {
                misses++;
                verdict = "miss";
            } else {
                wrong++;
                verdict = expectedRead ? "wrong-ids" : "false-accept";
            }
            rows.append(String.join("\t", c.name, test.name, test.cards,
                    Integer.toString(c.degrees), Integer.toString(c.width), Integer.toString(c.white),
                    Integer.toString(c.black), c.effect.name(), Arrays.toString(expected), Arrays.toString(actual),
                    Integer.toString(sum(expected)), Integer.toString(sum(actual)), verdict)).append('\n');
        }
        System.out.printf("%-29s %2d/%2d pass, %2d misses, %d unsafe%n",
                c.name, passes, cases.size(), misses, wrong);
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]), fixtures = root.resolve("frames");
        String mode = args.length > 1 ? args[1] : "matrix";
        String defaultFile = switch (mode) {
            case "directions" -> "stress-directions.tsv";
            case "joker" -> "stress-near-joker.tsv";
            case "joker-top" -> "stress-top-joker.tsv";
            case "matrix" -> "stress-results.tsv";
            default -> throw new IllegalArgumentException("Unknown stress-test mode: " + mode);
        };
        Path report = args.length > 2 ? Path.of(args[2]) : root.resolve(defaultFile);
        List<Case> full = new ArrayList<>(), missing = new ArrayList<>();
        for (String row : Files.readAllLines(fixtures.resolve("manifest.tsv"))) {
            String[] f = row.split("\t");
            if (f[0].startsWith("placement-")) continue;
            int[] ids = f[5].equals("-") ? null : Arrays.stream(f[5].split(",")).mapToInt(Integer::parseInt).toArray();
            Case test = new Case(f[0], f[1], ids, VerifyScreen.frame(fixtures.resolve(f[0] + ".png")));
            (ids == null ? missing : full).add(test);
        }
        if (full.size() != 34 || missing.size() != 12) throw new IllegalStateException("Unexpected fixture coverage");
        StringBuilder rows = new StringBuilder("condition\tcase\tcards\tangle\tmarker_width\twhite\tblack\teffect\t"
                + "expected_ids\tactual_ids\texpected_sum\tactual_sum\tverdict\n");
        OpticalReader reader = new OpticalReader();
        if (mode.equals("directions")) {
            for (Condition c : DIRECTIONS) {
                boolean blocked = c.effect == Effect.BLOCK_MARKER;
                evaluate(c, blocked ? full.subList(0, 12) : full, !blocked, reader, rows);
            }
        } else if (mode.equals("joker")) {
            for (Condition c : AROUND_JOKER) evaluate(c, full, true, reader, rows);
        } else if (mode.equals("joker-top")) {
            for (Condition c : JOKER_TOP) {
                boolean blocked = c.effect == Effect.BLOCK_MARKER;
                boolean missingCard = c.name.startsWith("missing");
                evaluate(c, blocked ? full.subList(0, 12) : missingCard ? missing : full,
                        !blocked && !missingCard, reader, rows);
            }
        } else {
            for (Condition c : POSITIVE) evaluate(c, full, true, reader, rows);
            for (Condition c : NEGATIVE) {
                evaluate(c, c.effect == Effect.BLOCK_MARKER ? full.subList(0, 12) : missing, false, reader, rows);
            }
        }
        Files.writeString(report, rows);
    }
}
