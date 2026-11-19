// In-memory binary raster metrics. The trace reader supports only the pinned polygon SVG.
import { createHash } from 'node:crypto';
import { corners, inVoid, opposite } from './m2-model.mjs';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function polygonTrace(svg) {
  const elements = [...svg.matchAll(/<path\b[^>]*>/g)];
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!viewBox || viewBox[1] !== viewBox[2] || elements.length !== 1 ||
      !elements[0][0].includes('fill-rule="evenodd"') || !elements[0][0].includes('fill="#000"')) {
    throw new Error('Unexpected trace shape or fill convention');
  }
  const path = /\bd="([^"]+)"/.exec(elements[0][0])?.[1];
  if (!path || !/^(?:M[\d ,.\-]+Z\s*)+$/.test(path)) throw new Error('Trace must use closed absolute polygon subpaths');
  const contours = [...path.matchAll(/M([^Z]+)Z/g)].map((match) => {
    const values = match[1].trim().split(/[ ,]+/).map(Number);
    if (values.length < 6 || values.length % 2 || values.some((v) => !Number.isFinite(v))) {
      throw new Error('Invalid polygon coordinates');
    }
    return Array.from({ length: values.length / 2 }, (_, i) => [values[2 * i], values[2 * i + 1]]);
  });
  return { extent: Number(viewBox[1]), contours };
}

/** Even-odd fill evaluated at pixel centres, with a half-open crossing rule at vertices. */
export function rasterizeTrace(trace, n) {
  const out = new Uint8Array(n * n);
  const step = trace.extent / n;
  const edges = trace.contours.flatMap((points) => points.map((p, i) => [p, points[(i + 1) % points.length]]));
  for (let y = 0; y < n; y++) {
    const cy = (y + 0.5) * step;
    const crossing = [];
    for (const [[x1, y1], [x2, y2]] of edges) {
      if ((y1 > cy) !== (y2 > cy)) crossing.push(x1 + (cy - y1) * (x2 - x1) / (y2 - y1));
    }
    crossing.sort((a, b) => a - b);
    if (crossing.length % 2) throw new Error(`Odd crossing count at row ${y}`);
    for (let i = 0; i < crossing.length; i += 2) {
      const start = Math.max(0, Math.ceil(crossing[i] / step - 0.5));
      const end = Math.min(n, Math.ceil(crossing[i + 1] / step - 0.5));
      if (start < end) out.fill(1, y * n + start, y * n + end);
    }
  }
  return out;
}

function pointMm(index, n, extent) { return ((index + 0.5) / n - 0.5) * extent; }

export function voidMask(n, extentMm, radiusMm) {
  const mask = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    mask[y * n + x] = Number(inVoid(pointMm(x, n, extentMm), pointMm(y, n, extentMm), radiusMm));
  }
  return mask;
}

export function frameRaster(n, square, cfg, mask) {
  const raster = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (mask[y * n + x]) continue;
    const ax = Math.abs(pointMm(x, n, square));
    const ay = Math.abs(pointMm(y, n, square));
    // Two tones stand for neutral substrate coverage and a shared outer visual band.
    raster[y * n + x] = Math.max(ax, ay) > square / 2 - 1 ? 2 : 1;
  }
  return raster;
}

export function measureSymmetry(raster, n, square, cfg) {
  if (raster.length !== n * n) throw new RangeError('Raster dimensions differ');
  const window = Math.max(1, Math.round(cfg.localWindowModules * n / square));
  const stride = n + 1;
  const limit = cfg.maxLocalDeviationModules;
  const transforms = [
    ['halfTurn', (x, y) => (n - 1 - y) * n + (n - 1 - x)],
    ['leftRight', (x, y) => y * n + n - 1 - x],
    ['topBottom', (x, y) => (n - 1 - y) * n + x],
  ];
  return Object.fromEntries(transforms.map(([name, targetIndex]) => {
    const sum = new Uint32Array(stride * stride);
    for (let y = 0; y < n; y++) {
      let running = 0;
      for (let x = 0; x < n; x++) {
        running += Number(raster[y * n + x] !== raster[targetIndex(x, y)]);
        sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + running;
      }
    }
    let peak = 0;
    let origin = [0, 0];
    for (let y = 0; y + window <= n; y++) for (let x = 0; x + window <= n; x++) {
      const end = (y + window) * stride + x + window;
      const count = sum[end] - sum[end - window] - sum[end - window * stride] + sum[y * stride + x];
      if (count > peak) { peak = count; origin = [x, y]; }
    }
    const mismatches = sum.at(-1);
    const mismatchFraction = mismatches / (n * n);
    const localDeviationModules = Math.sqrt(peak) * square / n;
    return [name, { mismatches, mismatchFraction, localDeviationModules, windowPx: window,
      windowOriginPx: origin, windowOriginModules: origin.map((v) => v * square / n),
      pass: mismatchFraction <= cfg.maxGlobalMismatchFraction && localDeviationModules <= limit }];
  }));
}

/** Compare the printed 0° quadrant, rotated where required, to each board slot. */
export function compareClasses(raster, n, classes) {
  if (n % 2) throw new RangeError('Quad comparison requires an even raster extent');
  const half = n / 2;
  return classes.map((item) => {
    const natural = opposite(item.bodyCorner);
    const [sx, sy] = corners[natural].map((d) => d > 0 ? half : 0);
    const [tx, ty] = corners[item.slot].map((d) => d > 0 ? half : 0);
    let mismatches = 0;
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
      const u = item.orientation === 180 ? half - 1 - x : x;
      const v = item.orientation === 180 ? half - 1 - y : y;
      mismatches += Number(raster[(sy + v) * n + sx + u] !== raster[(ty + y) * n + tx + x]);
    }
    return { ...item, mismatches };
  });
}

export function shortestRun(raster, n) {
  let min = Infinity;
  for (const column of [false, true]) {
    for (let j = 0; j < n; j++) {
      let length = 0;
      for (let i = 0; i <= n; i++) {
        if (i < n && raster[column ? i * n + j : j * n + i]) length++;
        else if (length) { min = Math.min(min, length); length = 0; }
      }
    }
  }
  return Number.isFinite(min) ? min : null;
}

export function measureTrace(trace, n, square, radiusMm, cfg, classes) {
  const art = rasterizeTrace(trace, n);
  const mask = voidMask(n, square * cfg.moduleMm, radiusMm);
  let darkBefore = 0;
  let removed = 0;
  for (let i = 0; i < art.length; i++) {
    darkBefore += art[i];
    if (mask[i] && art[i]) { removed++; art[i] = 0; }
  }
  const minRunPx = shortestRun(art, n);
  return { n, square, radiusMm, maskDigest: digest(mask), maskedRasterDigest: digest(art), darkBefore, removed,
    minRunPx, minRunModules: minRunPx === null ? null : minRunPx * square / n,
    symmetry: measureSymmetry(art, n, square, cfg), classes: compareClasses(art, n, classes) };
}
