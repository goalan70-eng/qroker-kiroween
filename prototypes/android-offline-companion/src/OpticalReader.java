package com.qroker.offline;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The 30 mm uniform-bar reader, using luminance only. */
final class OpticalReader {
    private static final int SEARCH_SIDE = 640;
    private static final double[] OFFSETS = {-.45, 0, .45};
    private static final double[] SMALL_OFFSETS = {-.45, -.30, 0, .30, .45};
    private static final double[] SMALL_AIMED_OFFSETS = {-.45, -.30, -.15, 0, .15, .30, .45};
    private final Map<Integer, Integer> codebook = new HashMap<>();

    OpticalReader() {
        for (int i = 0; i < Layout30.KEYS.length; i++) codebook.put(Layout30.KEYS[i], i);
    }

    static final class Frame {
        final int width, height;
        final byte[] data;

        Frame(int width, int height, byte[] data) {
            this.width = width;
            this.height = height;
            this.data = data;
        }

        int pixel(int x, int y) { return data[y * width + x] & 255; }

        double sample(double x, double y) {
            x -= .5;
            y -= .5;
            if (!(x >= 0 && y >= 0 && x < width - 1 && y < height - 1)) return Double.NaN;
            int i = (int) x, j = (int) y;
            double a = x - i, b = y - j;
            return (1 - b) * ((1 - a) * pixel(i, j) + a * pixel(i + 1, j))
                    + b * ((1 - a) * pixel(i, j + 1) + a * pixel(i + 1, j + 1));
        }

        Frame reduce(int limit) {
            int side = Math.max(width, height);
            if (side <= limit) return this;
            int w = Math.max(1, (int) Math.round(limit * width / (double) side));
            int h = Math.max(1, (int) Math.round(limit * height / (double) side));
            byte[] out = new byte[w * h];
            for (int y = 0; y < h; y++) {
                int top = (y * height + h / 2) / h;
                int bottom = ((y + 1) * height + h / 2) / h;
                for (int x = 0; x < w; x++) {
                    int left = (x * width + w / 2) / w;
                    int right = ((x + 1) * width + w / 2) / w;
                    int sum = 0;
                    for (int row = top; row < bottom; row++)
                        for (int col = left; col < right; col++) sum += pixel(col, row);
                    int area = (bottom - top) * (right - left);
                    out[y * w + x] = (byte) ((sum + area / 2) / area);
                }
            }
            return new Frame(w, h, out);
        }

        Frame smooth(int middle) {
            byte[] out = new byte[data.length];
            int scale = (middle + 2) * (middle + 2);
            for (int y = 0; y < height; y++) {
                int a = Math.max(0, y - 1), b = Math.min(height - 1, y + 1);
                for (int x = 0; x < width; x++) {
                    int l = Math.max(0, x - 1), r = Math.min(width - 1, x + 1);
                    int sum = pixel(l, a) + middle * pixel(x, a) + pixel(r, a)
                            + middle * (pixel(l, y) + middle * pixel(x, y) + pixel(r, y))
                            + pixel(l, b) + middle * pixel(x, b) + pixel(r, b);
                    out[y * width + x] = (byte) ((sum + scale / 2) / scale);
                }
            }
            return new Frame(width, height, out);
        }

        Frame sharpened() {
            Frame blurred = smooth(2);
            for (int i = 0; i < data.length; i++) {
                int raw = data[i] & 255;
                int detail = raw - (blurred.data[i] & 255);
                blurred.data[i] = (byte) Math.max(0, Math.min(255, raw + 2 * detail));
            }
            return blurred;
        }

        Frame brightenedEdges() {
            int[] bins = new int[256];
            int count = 0;
            for (int y = 0; y < height; y += 3)
                for (int x = 0; x < width; x += 3) {
                    bins[pixel(x, y)]++;
                    count++;
                }
            int white = 0, seen = bins[0];
            while (seen < count * .90) seen += bins[++white];
            if (white == 0 || white >= 136) return null;
            double gain = Math.min(2.5, 144.0 / white);
            Frame enhanced = smooth(2);
            for (int i = 0; i < enhanced.data.length; i++)
                enhanced.data[i] = (byte) Math.min(255, Math.round((enhanced.data[i] & 255) * gain));
            return enhanced;
        }
    }

    private static final class Point {
        final double x, y;
        Point(double x, double y) { this.x = x; this.y = y; }
        double distance(Point to) { return Math.hypot(x - to.x, y - to.y); }
    }

    private static final class Run {
        final int left, right, y;
        Run parent = this;

        Run(int left, int right, int y) { this.left = left; this.right = right; this.y = y; }

        Run root() {
            Run node = this;
            while (node.parent != node) {
                node.parent = node.parent.parent;
                node = node.parent;
            }
            return node;
        }
    }

    private static final class Component {
        int size;
        final List<Point> boundary = new ArrayList<>();
    }

    private static List<Component> components(boolean[] mask, int width, int height) {
        List<Run> all = new ArrayList<>(), previous = new ArrayList<>();
        for (int y = 0; y < height; y++) {
            List<Run> current = new ArrayList<>();
            int x = 0, cursor = 0;
            while (x < width) {
                if (!mask[y * width + x]) { x++; continue; }
                int left = x++;
                while (x < width && mask[y * width + x]) x++;
                Run run = new Run(left, x, y);
                while (cursor < previous.size() && previous.get(cursor).right < left) cursor++;
                for (int i = cursor; i < previous.size() && previous.get(i).left <= x; i++)
                    run.root().parent = previous.get(i).root();
                all.add(run);
                current.add(run);
            }
            previous = current;
        }
        Map<Run, Integer> sizes = new HashMap<>();
        for (Run run : all) {
            Run parent = run.root();
            sizes.put(parent, sizes.getOrDefault(parent, 0) + run.right - run.left);
        }
        List<Run> largest = new ArrayList<>();
        for (Run root : sizes.keySet()) if (sizes.get(root) >= 100) largest.add(root);
        largest.sort((a, b) -> Integer.compare(sizes.get(b), sizes.get(a)));
        List<Component> result = new ArrayList<>();
        Map<Run, Component> byRoot = new HashMap<>();
        for (Run root : largest.subList(0, Math.min(20, largest.size()))) {
            Component group = new Component();
            group.size = sizes.get(root);
            byRoot.put(root, group);
            result.add(group);
        }
        for (Run run : all) {
            Component group = byRoot.get(run.root());
            if (group == null) continue;
            group.boundary.add(new Point(run.left + .5, run.y + .5));
            if (run.right - run.left > 1) group.boundary.add(new Point(run.right - .5, run.y + .5));
        }
        return result;
    }

    private static int otsu(Frame frame) {
        int[] bins = new int[256];
        int sum = 0, count = frame.data.length;
        for (byte value : frame.data) { bins[value & 255]++; sum += value & 255; }
        int threshold = 0, weight = 0, level = 0;
        double best = -1;
        for (int i = 0; i < bins.length; i++) {
            weight += bins[i];
            level += i * bins[i];
            double delta = (double) weight * sum - (double) level * count;
            double score = delta * delta / Math.max(1.0, (double) weight * (count - weight));
            if (score > best) { threshold = i; best = score; }
        }
        return threshold;
    }

    private static boolean[] mask(Frame smooth, boolean adaptive) {
        int w = smooth.width, h = smooth.height;
        boolean[] out = new boolean[smooth.data.length];
        if (!adaptive) {
            int threshold = otsu(smooth);
            for (int i = 0; i < out.length; i++) out[i] = (smooth.data[i] & 255) <= threshold;
            return out;
        }
        int stride = w + 1;
        int[] integral = new int[stride * (h + 1)];
        for (int y = 0; y < h; y++) {
            int row = 0;
            for (int x = 0; x < w; x++) {
                row += smooth.pixel(x, y);
                integral[(y + 1) * stride + x + 1] = row + integral[y * stride + x + 1];
            }
        }
        for (int y = 0; y < h; y++) {
            int top = Math.max(0, y - 19), bottom = Math.min(h, y + 20);
            for (int x = 0; x < w; x++) {
                int left = Math.max(0, x - 19), right = Math.min(w, x + 20);
                int sum = integral[bottom * stride + right] - integral[top * stride + right]
                        - integral[bottom * stride + left] + integral[top * stride + left];
                out[y * w + x] = (smooth.pixel(x, y) + 15) * (bottom - top) * (right - left) <= sum;
            }
        }
        return out;
    }

    private static double cross(Point a, Point b, Point c) {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }

    private static List<Point> chain(List<Point> points, boolean reversed) {
        List<Point> out = new ArrayList<>();
        for (int i = 0; i < points.size(); i++) {
            Point p = points.get(reversed ? points.size() - 1 - i : i);
            int size = out.size();
            while (size >= 2 && cross(out.get(size - 2), out.get(size - 1), p) <= 0) out.remove(--size);
            out.add(p);
        }
        out.remove(out.size() - 1);
        return out;
    }

    private static Point[] roughQuad(List<Point> points) {
        points.sort(Comparator.comparingDouble((Point p) -> p.x).thenComparingDouble(p -> p.y));
        List<Point> hull = chain(points, false);
        hull.addAll(chain(points, true));
        if (hull.size() < 4) return null;
        while (hull.size() > 4) {
            double least = Double.POSITIVE_INFINITY;
            int index = 0, n = hull.size();
            for (int i = 0; i < n; i++) {
                double area = cross(hull.get((i + n - 1) % n), hull.get(i), hull.get((i + 1) % n));
                if (area < least) { least = area; index = i; }
            }
            hull.remove(index);
        }
        return hull.toArray(new Point[4]);
    }

    private static double maxSide(Point[] q) {
        double max = 0;
        for (int i = 0; i < 4; i++) max = Math.max(max, q[i].distance(q[(i + 1) % 4]));
        return max;
    }

    private static boolean usable(Point[] q) {
        if (q == null) return false;
        double min = Double.POSITIVE_INFINITY;
        for (int i = 0; i < 4; i++) {
            if (cross(q[(i + 3) % 4], q[i], q[(i + 1) % 4]) <= 60) return false;
            min = Math.min(min, q[i].distance(q[(i + 1) % 4]));
        }
        return min >= 13 && maxSide(q) <= 4 * min;
    }

    private static double drop(double[] profile, int i) { return profile[i] - profile[i + 4]; }

    private static double[] fitLine(Frame frame, Point p, Point q) {
        double dx = q.x - p.x, dy = q.y - p.y;
        double length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
        int steps = (int) Math.round(4 * Math.max(4, Math.min(11, .10 * length)));
        double[] profile = new double[2 * steps + 1];
        double[] x = new double[19], y = new double[19];
        int count = 0;
        for (int i = 0; i < 19; i++) {
            double t = .13 + .74 * i / 18, ax = p.x + t * dx, ay = p.y + t * dy;
            for (int j = 0; j < profile.length; j++) {
                double offset = (j - steps) * .25;
                profile[j] = frame.sample(ax + offset * nx, ay + offset * ny);
                if (!Double.isFinite(profile[j])) return null;
            }
            int peak = 0;
            double merit = Double.NEGATIVE_INFINITY;
            for (int j = 0; j < profile.length - 4; j++) {
                double value = drop(profile, j) - .6 * Math.abs((j + 2 - steps) * .25);
                if (value > merit) { merit = value; peak = j; }
            }
            double b = drop(profile, peak);
            if (b < 9) continue;
            double position = (peak + 2 - steps) * .25;
            if (peak > 0 && peak < profile.length - 5) {
                double a = drop(profile, peak - 1), c = drop(profile, peak + 1);
                if (b > a && b > c) position += .125 * (a - c) / (a - 2 * b + c);
            }
            x[count] = t;
            y[count++] = position;
        }
        double[] coefficients = supportedLine(x, y, count);
        if (coefficients == null) return null;
        return new double[]{p.x + coefficients[1] * nx, p.y + coefficients[1] * ny,
                dx + coefficients[0] * nx, dy + coefficients[0] * ny};
    }

    private static double[] supportedLine(double[] x, double[] y, int count) {
        double best = Double.NEGATIVE_INFINITY, slope = 0, intercept = 0;
        for (int a = 0; a < count; a++) {
            for (int b = a + 1; b < count; b++) {
                if (x[b] - x[a] < .28) continue;
                double m = (y[b] - y[a]) / (x[b] - x[a]), c = y[a] - m * x[a];
                int support = 0;
                double first = 1, last = 0, error = 0;
                for (int i = 0; i < count; i++) {
                    double distance = Math.abs(y[i] - (m * x[i] + c));
                    if (distance >= .9) continue;
                    support++;
                    first = Math.min(first, x[i]);
                    last = x[i];
                    error += distance;
                }
                double coverage = last - first;
                if (support < 8 || coverage < .36) continue;
                double merit = support + coverage - .1 * error / support;
                if (merit > best) { best = merit; slope = m; intercept = c; }
            }
        }
        if (!Double.isFinite(best)) return null;
        int n = 0;
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (int i = 0; i < count; i++) {
            if (Math.abs(y[i] - slope * x[i] - intercept) >= .9) continue;
            n++;
            sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i];
        }
        double m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        return new double[]{m, (sy - m * sx) / n};
    }

    private static Point[] refine(Frame frame, Point[] q) {
        double[][] lines = new double[4][];
        for (int i = 0; i < 4; i++) {
            lines[i] = fitLine(frame, q[i], q[(i + 1) % 4]);
            if (lines[i] == null) return null;
        }
        Point[] result = new Point[4];
        double maximum = Math.min(14, Math.max(6, .14 * maxSide(q)));
        for (int i = 0; i < 4; i++) {
            double[] a = lines[(i + 3) % 4], b = lines[i];
            double determinant = a[2] * b[3] - a[3] * b[2];
            if (Math.abs(determinant) < 1e-9) return null;
            double t = ((b[0] - a[0]) * b[3] - (b[1] - a[1]) * b[2]) / determinant;
            result[i] = new Point(a[0] + t * a[2], a[1] + t * a[3]);
            if (result[i].distance(q[i]) > maximum) return null;
        }
        return usable(result) ? result : null;
    }

    private static final class Region {
        final Frame frame;
        final int left, top;
        final Point[] quad = new Point[4];

        Region(Frame source, Point[] corners, Frame reduced) {
            double sx = (double) source.width / reduced.width, sy = (double) source.height / reduced.height;
            double minX = source.width, minY = source.height, maxX = 0, maxY = 0;
            for (int i = 0; i < 4; i++) {
                Point p = new Point(corners[i].x * sx, corners[i].y * sy);
                quad[i] = p;
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            }
            int margin = Math.max(12, (int) Math.ceil(.13 * maxSide(quad)));
            left = Math.max(0, (int) Math.floor(minX) - margin);
            top = Math.max(0, (int) Math.floor(minY) - margin);
            int width = Math.min(source.width, (int) Math.ceil(maxX) + margin) - left;
            int height = Math.min(source.height, (int) Math.ceil(maxY) + margin) - top;
            byte[] pixels = new byte[width * height];
            for (int y = 0; y < height; y++)
                System.arraycopy(source.data, (top + y) * source.width + left, pixels, y * width, width);
            frame = new Frame(width, height, pixels);
            for (int i = 0; i < 4; i++) quad[i] = new Point(quad[i].x - left, quad[i].y - top);
        }
    }

    private static double[] homography(Point a, Point b, Point c, Point d) {
        double bx = b.x - c.x, by = b.y - c.y, dx = d.x - c.x, dy = d.y - c.y;
        double sx = a.x - b.x + c.x - d.x, sy = a.y - b.y + c.y - d.y;
        double determinant = bx * dy - dx * by;
        if (Math.abs(determinant) < 1e-9) return null;
        double g = (sx * dy - dx * sy) / determinant, h = (bx * sy - sx * by) / determinant;
        return new double[]{b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
                b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h};
    }

    private static double project(Frame frame, double[] h, double[] coords, int i) {
        double x = coords[i], y = coords[i + 1], w = h[6] * x + h[7] * y + 1;
        if (Math.abs(w) < 1e-9) return Double.NaN;
        return frame.sample((h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w);
    }

    private int identify(Frame frame, double[] h, int slot, boolean legacy) {
        double[] edge = Layout30.FRAME[slot];
        int presence = 0;
        for (int i = 0; i < edge.length; i += 4) {
            double ink = project(frame, h, edge, i), paper = project(frame, h, edge, i + 2);
            if (!Double.isFinite(ink) || !Double.isFinite(paper)) return -1;
            if (paper - ink >= 25) presence++;
        }
        if (presence < 3) return -1;
        double[] original = Layout30.BARS[slot], extra = ExtraBars.SAMPLE[slot];
        int originalSites = original.length / 36;
        double[] contrast = new double[originalSites + (legacy ? 0 : extra.length / 36)];
        double[] highlights = legacy ? null : new double[contrast.length];
        for (int i = 0; i < contrast.length; i++) {
            double[] bars = i < originalSites ? original : extra;
            int offset = (i < originalSites ? i : i - originalSites) * 36;
            double first = 0, second = 0;
            for (int j = 0; j < 18; j += 2) {
                first += project(frame, h, bars, offset + j);
                second += project(frame, h, bars, offset + 18 + j);
            }
            contrast[i] = (first - second) / 9;
            if (!Double.isFinite(contrast[i])) return -1;
            if (!legacy) highlights[i] = Math.max(first, second) / 9;
        }
        if (!legacy) {
            // The central hat bar is evidence only when its ink is clearly visible.
            int hat = contrast.length - 1;
            if (contrast[hat] < 20) contrast[hat] = 0;
            return ErasureDecoder.read(contrast, highlights, ExtraBars.BITS);
        }
        int start = Layout30.DATA, mirrors = start + 9, check = mirrors + Layout30.MIRRORS.length;
        int word = 0, aux = 0, crc = 0;
        for (int i = 0; i < start; i++) if (contrast[i] > 0) word |= 1 << i;
        for (int i = start; i < mirrors; i++) contrast[i] = -contrast[i];
        for (int i = mirrors; i < check; i++) {
            int index = start + Layout30.MIRRORS[i - mirrors];
            double primary = contrast[index], mirror = contrast[i], combined = primary + mirror;
            if (primary * mirror <= 0 && Math.abs(combined) < Math.max(2, .10 * (Math.abs(primary) + Math.abs(mirror))))
                return -1;
            contrast[index] = combined;
        }
        for (int i = start; i < mirrors; i++) if (contrast[i] > 0) aux |= 1 << (i - start);
        for (int i = check; i < contrast.length; i++) if (contrast[i] > 0) crc |= 1 << (i - check);
        return codebook.getOrDefault((word << 14) | (aux << 5) | crc, -1);
    }

    private static final class Readings {
        int[] ids;
        boolean ambiguous;

        int[] result() { return ambiguous ? null : ids; }

        void add(int[] cards) {
            if (ids == null) ids = cards;
            else if (!Arrays.equals(ids, cards)) ambiguous = true;
        }
    }

    private void readGroup(Frame frame, double[] h, boolean legacy, Readings readings) {
        int[] cards = new int[4];
        long seen = 0;
        for (int slot = 0; slot < cards.length; slot++) {
            int card = identify(frame, h, slot, legacy);
            if (card < 0 || (seen & (1L << card)) != 0) return;
            seen |= 1L << card;
            cards[slot] = card;
        }
        Arrays.sort(cards);
        readings.add(cards);
    }

    private void sampleOrientations(Frame frame, Point[] q, Readings readings) {
        for (int direction : new int[]{1, 3}) {
            for (int i = 0; i < 4 && !readings.ambiguous; i++) {
                double[] h = homography(q[i], q[(i + direction) % 4], q[(i + 2 * direction) % 4],
                        q[(i + 3 * direction) % 4]);
                if (h == null) continue;
                // Each code must contain four cards from the same marker generation.
                readGroup(frame, h, false, readings);
                if (Layout30.ACCEPT_LEGACY) readGroup(frame, h, true, readings);
            }
        }
    }

    private Readings decode(Frame frame, Point[] quad, boolean aimed) {
        Readings readings = new Readings();
        sampleOrientations(frame, quad, readings);
        double side = maxSide(quad);
        if (readings.ids != null || side > 104) return readings;
        // At two pixels per marker cell or less, a fraction of a pixel can straddle two bars.
        double[] offsets = OFFSETS;
        if (side <= 32) offsets = aimed ? SMALL_AIMED_OFFSETS : SMALL_OFFSETS;
        for (double x : offsets) {
            for (double y : offsets) {
                if (x == 0 && y == 0) continue;
                Point[] q = new Point[4];
                for (int i = 0; i < 4; i++) q[i] = new Point(quad[i].x + x, quad[i].y + y);
                sampleOrientations(frame, q, readings);
                if (readings.ambiguous) return readings;
            }
        }
        return readings;
    }

    private static Point center(Point[] q) {
        return new Point((q[0].x + q[1].x + q[2].x + q[3].x) / 4,
                (q[0].y + q[1].y + q[2].y + q[3].y) / 4);
    }

    private static boolean checked(List<Point[]> prior, Point[] quad) {
        for (Point[] q : prior) {
            boolean same = true;
            for (int i = 0; i < 4; i++) {
                if (Math.abs(q[i].x - quad[i].x) >= .35 || Math.abs(q[i].y - quad[i].y) >= .35) same = false;
            }
            if (same) return true;
        }
        prior.add(quad);
        return false;
    }

    static int aimSide(int width, int height) {
        return Math.round(Math.min(width, height) * .53f);
    }

    int[] readAimed(Frame source) {
        int side = aimSide(source.width, source.height);
        if (side < 20) return null;
        int left = (source.width - side) / 2, top = (source.height - side) / 2;
        byte[] pixels = new byte[side * side];
        for (int y = 0; y < side; y++)
            System.arraycopy(source.data, (top + y) * source.width + left, pixels, y * side, side);
        Frame guide = new Frame(side, side, pixels);
        Readings first = scan(guide, SEARCH_SIDE, true);
        if (first.ids != null || first.ambiguous || side / 2 < 20) return first.result();
        // Large, detailed outlines can merge with artwork at the native scale.
        // Locate them at half scale, then refine and sample the original pixels.
        return scan(guide, Math.min(SEARCH_SIDE, side) / 2, true).result();
    }

    int[] read(Frame source) {
        if (Math.min(source.width, source.height) < 20) return null;
        return scan(source, SEARCH_SIDE, false).result();
    }

    private Readings scan(Frame source, int limit, boolean aimed) {
        Frame reduced = source.reduce(limit);
        Point reticle = new Point(reduced.width * .5, reduced.height * .5);
        Frame smooth = reduced.smooth(5);
        Frame brightened = reduced.brightenedEdges();
        List<Point[]> checkedRaw = new ArrayList<>(), checkedEnhanced = new ArrayList<>();
        Readings accepted = new Readings();
        Point acceptedCenter = null;
        for (boolean adaptive : new boolean[]{false, true}) {
            for (Component component : components(mask(smooth, adaptive), reduced.width, reduced.height)) {
                Point[] rough = roughQuad(component.boundary);
                if (!usable(rough)) continue;
                for (boolean enhanced : new boolean[]{false, true}) {
                    if (enhanced && brightened == null) continue;
                    Point[] coarse = refine(enhanced ? brightened : reduced, rough);
                    if (coarse == null || checked(enhanced ? checkedEnhanced : checkedRaw, coarse)) continue;
                    if (aimed && !contains(coarse, reticle)) continue;
                    Region region = new Region(source, coarse, reduced);
                    Point[] fine = region.quad;
                    if (reduced != source) {
                        Frame edges = enhanced ? region.frame.brightenedEdges() : null;
                        fine = refine(edges != null ? edges : region.frame, fine);
                        if (fine == null) continue;
                    }
                    if (aimed && !contains(fine, new Point(source.width * .5 - region.left,
                            source.height * .5 - region.top))) continue;
                    Readings reading = decode(region.frame, fine, aimed);
                    if (aimed && reading.ids == null && maxSide(fine) <= 70)
                        reading = decode(region.frame.sharpened(), fine, true);
                    if (reading.ambiguous) return reading;
                    if (reading.ids == null) continue;
                    Point center = center(coarse);
                    if (acceptedCenter != null && acceptedCenter.distance(center) > 3) {
                        accepted.ambiguous = true;
                        return accepted;
                    }
                    acceptedCenter = center;
                    accepted.add(reading.ids);
                    if (accepted.ambiguous) return accepted;
                }
            }
        }
        return accepted;
    }

    private static boolean contains(Point[] quad, Point point) {
        for (int i = 0; i < 4; i++)
            if (cross(quad[i], quad[(i + 1) % 4], point) <= 0) return false;
        return true;
    }
}
