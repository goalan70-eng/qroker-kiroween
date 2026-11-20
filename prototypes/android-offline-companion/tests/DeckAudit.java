package com.qroker.offline;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.SplittableRandom;
import javax.imageio.ImageIO;

/** Tests the same full-frame decoder that the Android camera calls. */
public final class DeckAudit {
    private static final int SIZE = 1280, FRAME_W = 1280, FRAME_H = 960;
    private static final long SEED = 26112052;
    private static final double FOCAL = 950;
    private static final String[] RANKS = "A 2 3 4 5 6 7 8 9 10 J Q K".split(" ");
    private static final double[] SAMPLE = {-.55, 0, .55};
    private static final double MM = 30;
    private static final double CARD_W = 63.5, CARD_H = 88.9;
    private static final String HEADER = "condition\tgroup\tpose\tmissing\texpected_ids\tread_ids"
            + "\texpected_sum\tread_sum\tverdict";

    private static final class Condition {
        final String name;
        final double angle, width;
        final boolean dim;
        Condition(String name, double angle, double width, boolean dim) {
            this.name = name;
            this.angle = Math.toRadians(angle);
            this.width = width;
            this.dim = dim;
        }
    }

    private static final Condition FRONT = new Condition("front-151", 0, 151, false);
    private static final Condition DIM_151 = new Condition("dim60-151", 60, 151, true);
    private static final Condition DIM_96 = new Condition("dim60-96", 60, 96, true);
    private static final Condition[] CONDITIONS = {FRONT, DIM_151, DIM_96};

    private static final class Group {
        final String name;
        final String[] labels;
        final int[] ids;
        final int total;
        final byte[] ink;

        Group(Path root, String line) throws IOException {
            String[] columns = line.split("\t");
            name = columns[0];
            labels = Arrays.copyOfRange(columns, 1, columns.length);
            ids = Arrays.stream(labels).mapToInt(DeckAudit::encode).sorted().toArray();
            total = Arrays.stream(labels).mapToInt(DeckAudit::rank).sum();
            ink = Files.readAllBytes(root.resolve(name + ".raw"));
        }
    }

    private static int rank(String id) {
        int rank = Arrays.asList(RANKS).indexOf(id.substring(2));
        if (rank < 0) throw new IllegalArgumentException(id);
        return rank + 1;
    }

    private static int encode(String id) { return 13 * "HDCS".indexOf(id.charAt(0)) + rank(id) - 1; }

    private static String decode(int id) { return "HDCS".charAt(id / 13) + "-" + RANKS[id % 13]; }

    private static OpticalReader.Frame photograph(Group group, byte[] voidMask, Condition condition,
                                                   int pose, int missing, long seed, boolean emulator) {
        SplittableRandom rng = new SplittableRandom(seed);
        double cx = emulator ? 318.25 : FRAME_W * (.32 + rng.nextDouble() * .36);
        double cy = emulator ? 465.50 : FRAME_H * (.33 + rng.nextDouble() * .34);
        double roll = emulator ? -.10 : Math.PI / 2 * pose + rng.nextDouble(-.42, .42);
        double cos = Math.cos(roll), sin = Math.sin(roll);
        double tiltCos = Math.cos(condition.angle), tiltSin = Math.sin(condition.angle);
        double distance = FOCAL / condition.width;
        byte[] pixels = new byte[FRAME_W * FRAME_H];
        for (int y = 0; y < FRAME_H; y++) {
            for (int x = 0; x < FRAME_W; x++) {
                double background = (condition.dim ? 64 : 139) + 7.0 * (x - cx) / FRAME_W;
                double tone = background;
                if (Math.abs(x - cx) < condition.width * 5 && Math.abs(y - cy) < condition.width * 5
                        && missing != 4) {
                    double u = cos * (x + .5 - cx) + sin * (y + .5 - cy);
                    double v = -sin * (x + .5 - cx) + cos * (y + .5 - cy);
                    double denominator = tiltCos - v * tiltSin / FOCAL;
                    if (denominator > .003) {
                        double py = v / condition.width / denominator;
                        double px = u * (distance + py * tiltSin) / FOCAL;
                        if (Math.abs(px) < CARD_W / MM + .03 && Math.abs(py) < CARD_H / MM + .03) {
                            double sum = 0;
                            for (double dy : SAMPLE) {
                                for (double dx : SAMPLE) {
                                    double subV = v - sin * dx + cos * dy;
                                    double sy = subV / condition.width / (tiltCos - subV * tiltSin / FOCAL);
                                    double sx = (u + cos * dx + sin * dy) * (distance + sy * tiltSin) / FOCAL;
                                    sum += shade(group.ink, voidMask, condition, sx, sy, missing, background);
                                }
                            }
                            tone = sum / (SAMPLE.length * SAMPLE.length);
                        }
                    }
                }
                int noise = rng.nextInt(-4, 5) + rng.nextInt(-4, 5);
                pixels[y * FRAME_W + x] = (byte) Math.max(0, Math.min(255, Math.round(tone + noise)));
            }
        }
        return new OpticalReader.Frame(FRAME_W, FRAME_H, pixels);
    }

    private static double shade(byte[] ink, byte[] voidMask, Condition condition, double x, double y,
                                int missing, double background) {
        if (Math.abs(x) >= CARD_W / MM || Math.abs(y) >= CARD_H / MM) return background;
        double paper = condition.dim ? 94 : 220;
        double black = condition.dim ? 10 : 18;
        if (Math.abs(x) < .5 && Math.abs(y) < .5) {
            int pixel = (int)((x + .5) * SIZE) + SIZE * (int)((y + .5) * SIZE);
            if (voidMask[pixel] != 0) return ink[pixel] != 0 ? black : background;
            int slot = (x < 0 ? 0 : 1) + (y < 0 ? 0 : 2);
            if (missing == slot) return background;
            return ink[pixel] != 0 ? black : paper;
        }
        int slot = (x < 0 ? 0 : 1) + (y < 0 ? 0 : 2);
        return missing == slot ? background : paper;
    }

    private static void image(OpticalReader.Frame frame, Path path) throws IOException {
        image(frame, path, -1, false);
    }

    private static void image(OpticalReader.Frame frame, Path path, int cue, boolean covered) throws IOException {
        BufferedImage image = new BufferedImage(frame.width, frame.height, BufferedImage.TYPE_INT_RGB);
        int[] rgb = new int[frame.data.length];
        for (int i = 0; i < rgb.length; i++) rgb[i] = (frame.data[i] & 255) * 0x010101;
        if (covered) {
            // Cover the left half of the projected marker while retaining all four card bodies.
            for (int y = 395; y < 525; y++)
                Arrays.fill(rgb, y * frame.width + 212, y * frame.width + 317, 0x454545);
        }
        if (cue >= 0) {
            // Camera-scene identifier for the UI test, drawn outside the marker.
            for (int y = 60; y < 210; y++)
                Arrays.fill(rgb, y * frame.width + 62, y * frame.width + 154, cue);
        }
        image.setRGB(0, 0, frame.width, frame.height, rgb, 0, frame.width);
        if (!ImageIO.write(image, "jpeg", path.toFile())) throw new IOException("No JPEG encoder");
    }

    private static void run(Path root) throws Exception {
        byte[] voidMask = Files.readAllBytes(root.resolve("void.raw"));
        List<String> definitions = Files.readAllLines(root.resolve("groups.tsv"));
        OpticalReader reader = new OpticalReader();
        StringBuilder rows = new StringBuilder(HEADER).append('\n');
        Set<String> exactIdsAt60 = new LinkedHashSet<>();
        int unsafe = 0;
        for (int index = 0; index < definitions.size(); index++) {
            Group group = new Group(root, definitions.get(index));
            for (int c = 0; c < CONDITIONS.length; c++) {
                Condition condition = CONDITIONS[c];
                for (int repeat = 0; repeat < (c == 0 ? 1 : 2); repeat++) {
                    int pose = (index + 2 * repeat) % 4;
                    long seed = SEED + index * 1009L + c * 17L + 113L * repeat;
                    int[] ids = reader.read(photograph(group, voidMask, condition, pose, -1, seed, false));
                    boolean exact = Arrays.equals(group.ids, ids);
                    String verdict = ids == null ? "no-read" : exact ? "exact" : "wrong-ids";
                    int sum = ids == null ? -1 : Arrays.stream(ids).map(id -> id % 13 + 1).sum();
                    append(rows, condition, group, pose, "-", ids, sum, verdict);
                    if (ids != null && (!exact || sum != group.total)) unsafe++;
                    if (c > 0 && exact) exactIdsAt60.addAll(Arrays.asList(group.labels));
                    if (c == 0 || repeat != 0) continue;
                    for (int missing = 0; missing <= 4; missing++) {
                        int[] partial = reader.read(photograph(group, voidMask, condition, pose, missing, seed, false));
                        int partialSum = partial == null ? -1 : Arrays.stream(partial).map(id -> id % 13 + 1).sum();
                        append(rows, condition, group, pose, missing == 4 ? "all" : Integer.toString(missing),
                                partial, partialSum, partial == null ? "rejected" : "false-accept");
                        if (partial != null) unsafe++;
                    }
                }
            }
        }
        Files.writeString(root.resolve("results.tsv"), rows);
        System.out.println("Distinct cards in an exact 60 degree result: " + exactIdsAt60.size());
        System.out.println("Unsafe results (wrong IDs or accepts with missing cards): " + unsafe);
        if (unsafe != 0) throw new AssertionError("Inspect results.tsv for each unsafe response");
        if (exactIdsAt60.size() != 52) throw new AssertionError("Exact 60 degree reads did not cover the whole deck");
    }

    private static void append(StringBuilder rows, Condition condition, Group group, int pose, String missing,
                               int[] ids, int sum, String verdict) {
        String got = ids == null ? "-" : String.join(",", Arrays.stream(ids).mapToObj(DeckAudit::decode).toArray(String[]::new));
        rows.append(String.join("\t", condition.name, group.name, Integer.toString(pose * 90), missing,
                String.join(",", group.labels), got, missing.equals("-") ? Integer.toString(group.total) : "-",
                sum < 0 ? "-" : Integer.toString(sum), verdict)).append('\n');
    }

    private static void emulatorFixtures(Path root) throws Exception {
        byte[] voidMask = Files.readAllBytes(root.resolve("void.raw"));
        List<String> groups = Files.readAllLines(root.resolve("groups.tsv"));
        Group first = new Group(root, groups.get(0));
        Group second = new Group(root, groups.stream().filter(row -> row.startsWith("rank-13\t"))
                .findFirst().orElseThrow());
        image(photograph(first, voidMask, DIM_151, 0, -1, SEED, true), root.resolve("emu-27.jpg"));
        image(photograph(first, voidMask, DIM_151, 0, 2, SEED, true), root.resolve("emu-missing.jpg"));
        image(photograph(second, voidMask, DIM_151, 0, -1, SEED + 1, true), root.resolve("emu-52.jpg"));
    }

    private static void guessFlowFixtures(Path root) throws Exception {
        byte[] voidMask = Files.readAllBytes(root.resolve("void.raw"));
        List<String> groups = Files.readAllLines(root.resolve("groups.tsv"));
        Group first = new Group(root, groups.get(0));
        Group second = new Group(root, groups.stream().filter(row -> row.startsWith("rank-13\t"))
                .findFirst().orElseThrow());
        OpticalReader.Frame a = photograph(first, voidMask, DIM_151, 0, -1, SEED, true);
        OpticalReader.Frame missing = photograph(first, voidMask, DIM_151, 0, 2, SEED, true);
        OpticalReader.Frame b = photograph(second, voidMask, DIM_151, 0, -1, SEED + 1, true);
        image(a, root.resolve("guess-1.jpg"), 0xe33131, false);
        image(missing, root.resolve("guess-2.jpg"), 0x32cb49, false);
        image(a, root.resolve("guess-3.jpg"), 0x3464ed, false);
        image(b, root.resolve("guess-4.jpg"), 0xe5d62b, false);
        image(b, root.resolve("guess-5.jpg"), 0xd23bd8, true);
        image(b, root.resolve("guess-6.jpg"), 0x2fdadd, false);
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        if (args.length == 2 && args[1].equals("--emulator")) emulatorFixtures(root);
        else if (args.length == 2 && args[1].equals("--guess-flow")) guessFlowFixtures(root);
        else run(root);
    }
}
