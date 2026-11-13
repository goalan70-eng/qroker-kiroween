/**
 * TEST SUPPORT ONLY - not production code. Generic synthetic-image degradation helpers shared by
 * detection and later robustness work: geometric warps, pasting, seeded noise and occlusion.
 *
 * Conventions (same as detect.ts): continuous image coordinates, pixel (i, j) covers [i, i+1) x [j, j+1),
 * centre (i+.5, j+.5), y points down. Angles are in degrees, positive = clockwise as displayed.
 * Matrices are 3x3 row-major `number[9]` acting on column vectors (x, y, 1).
 */
import type { GrayImage } from '../render';

export type Mat3 = readonly number[];

export const mat3Identity = (): number[] => [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** a . b (b is applied first). */
export function mat3Multiply(a: Mat3, b: Mat3): number[] {
  const o = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return o;
}

/** Applies the matrices in the order given: compose(A, B, C) maps p to C(B(A(p))). */
export function compose(...ms: Mat3[]): number[] {
  let acc = mat3Identity();
  for (const m of ms) acc = mat3Multiply(m, acc);
  return acc;
}

export function mat3Invert(m: Mat3): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) throw new RangeError('matrix is singular');
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export function mat3Apply(m: Mat3, x: number, y: number): { x: number; y: number } {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return { x: (m[0]! * x + m[1]! * y + m[2]!) / w, y: (m[3]! * x + m[4]! * y + m[5]!) / w };
}

export const translationMatrix = (tx: number, ty: number): number[] => [1, 0, tx, 0, 1, ty, 0, 0, 1];

export function scaleMatrix(sx: number, sy: number = sx, cx = 0, cy = 0): number[] {
  return [sx, 0, cx - sx * cx, 0, sy, cy - sy * cy, 0, 0, 1];
}

/** Rotation by thetaDeg clockwise (as displayed, y down) about (cx, cy). */
export function rotationMatrix(thetaDeg: number, cx = 0, cy = 0): number[] {
  const t = (thetaDeg * Math.PI) / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  return [co, -si, cx - co * cx + si * cy, si, co, cy - si * cx - co * cy, 0, 0, 1];
}

export interface SimilarityParams {
  /** Centre of rotation and scaling (default 0, 0). */
  cx?: number;
  cy?: number;
  /** Clockwise degrees (default 0). */
  rotationDeg?: number;
  /** Uniform scale (default 1). */
  scale?: number;
  /** Translation applied last (default 0, 0). */
  tx?: number;
  ty?: number;
}

/** Scale about the centre, then rotate about the centre, then translate. */
export function similarityMatrix(p: SimilarityParams = {}): number[] {
  const cx = p.cx ?? 0;
  const cy = p.cy ?? 0;
  return compose(
    scaleMatrix(p.scale ?? 1, p.scale ?? 1, cx, cy),
    rotationMatrix(p.rotationDeg ?? 0, cx, cy),
    translationMatrix(p.tx ?? 0, p.ty ?? 0),
  );
}

export interface TiltParams {
  /** Point of the plane that stays fixed (the marker centre). */
  cx: number;
  cy: number;
  /** Angle between the tilted plane and the image plane, degrees (0 = frontal). */
  tiltDeg: number;
  /** Direction of the tilt axis within the plane, degrees clockwise from the x axis. */
  axisDeg: number;
  /** Camera distance in pixels (focal length = distance). Smaller means stronger perspective. */
  distancePx: number;
}

/**
 * Pinhole projection of the image plane after rotating it by tiltDeg about an in-plane axis through
 * (cx, cy), seen from distancePx in front of that point. At tiltDeg = 0 it is the identity. The
 * foreshortening factor across the tilt direction is cos(tiltDeg); keystone grows as
 * distancePx shrinks relative to the object size.
 */
export function tiltMatrix(p: TiltParams): number[] {
  const tau = (p.tiltDeg * Math.PI) / 180;
  const al = (p.axisDeg * Math.PI) / 180;
  const kx = Math.cos(al);
  const ky = Math.sin(al);
  const co = Math.cos(tau);
  const si = Math.sin(tau);
  const r1 = [co + kx * kx * (1 - co), kx * ky * (1 - co), -ky * si];
  const r2 = [kx * ky * (1 - co), co + ky * ky * (1 - co), kx * si];
  const d = p.distancePx;
  const m = [d * r1[0]!, d * r2[0]!, 0, d * r1[1]!, d * r2[1]!, 0, r1[2]!, r2[2]!, d];
  return compose(translationMatrix(-p.cx, -p.cy), m, translationMatrix(p.cx, p.cy));
}

export const blankImage = (width: number, height: number, value = 255): GrayImage => ({
  width,
  height,
  data: new Uint8Array(width * height).fill(value),
});

export const cloneImage = (img: GrayImage): GrayImage => ({
  width: img.width,
  height: img.height,
  data: new Uint8Array(img.data),
});

/** Copies src into dst at integer (x0, y0), clipping at dst bounds. Mutates dst. */
export function pasteImage(dst: GrayImage, src: GrayImage, x0: number, y0: number): void {
  for (let y = 0; y < src.height; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dst.width) continue;
      dst.data[dy * dst.width + dx] = src.data[y * src.width + x]!;
    }
  }
}

/** Returns a copy of the sub-rectangle [x0, x0+w) x [y0, y0+h), clipped to the source. */
export function cropImage(src: GrayImage, x0: number, y0: number, w: number, h: number): GrayImage {
  const out = blankImage(w, h, 255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx >= 0 && sx < src.width && sy >= 0 && sy < src.height) out.data[y * w + x] = src.data[sy * src.width + sx]!;
    }
  return out;
}

export interface WarpOptions {
  /** Value outside the source (default 255). */
  background?: number;
  /** Sub-samples per output pixel per axis (default 3). Acts as a box filter when downscaling. */
  supersample?: number;
}

/**
 * Inverse-mapping warp with bilinear sampling. H maps SOURCE coordinates to OUTPUT coordinates.
 * Each output pixel averages supersample^2 sub-samples; sub-samples that fall outside the source
 * rectangle take the background value.
 */
export function warpImage(src: GrayImage, H: Mat3, outW: number, outH: number, opts: WarpOptions = {}): GrayImage {
  const bg = opts.background ?? 255;
  const ss = Math.max(1, Math.floor(opts.supersample ?? 3));
  const inv = mat3Invert(H);
  const out = blankImage(outW, outH, bg);
  const sw = src.width;
  const sh = src.height;
  const n = ss * ss;
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const p = mat3Apply(inv, ox + (sx + 0.5) / ss, oy + (sy + 0.5) / ss);
          if (!(p.x >= 0 && p.x <= sw && p.y >= 0 && p.y <= sh)) {
            acc += bg;
            continue;
          }
          const fx = p.x - 0.5;
          const fy = p.y - 0.5;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const xa = Math.min(sw - 1, Math.max(0, x0));
          const xb = Math.min(sw - 1, Math.max(0, x0 + 1));
          const ya = Math.min(sh - 1, Math.max(0, y0));
          const yb = Math.min(sh - 1, Math.max(0, y0 + 1));
          const top = src.data[ya * sw + xa]! * (1 - tx) + src.data[ya * sw + xb]! * tx;
          const bot = src.data[yb * sw + xa]! * (1 - tx) + src.data[yb * sw + xb]! * tx;
          acc += top * (1 - ty) + bot * ty;
        }
      }
      out.data[oy * outW + ox] = Math.round(acc / n);
    }
  }
  return out;
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Image of independent uniform noise in [0, 255]. rng returns floats in [0, 1) (e.g. mulberry32). */
export function uniformNoiseImage(width: number, height: number, rng: () => number): GrayImage {
  const img = blankImage(width, height, 0);
  for (let i = 0; i < img.data.length; i++) img.data[i] = Math.floor(rng() * 256);
  return img;
}

/** Standard normal sample (Box-Muller) from a uniform rng. */
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Adds i.i.d. gaussian noise (std sigma gray levels) in place. */
export function addGaussianNoise(img: GrayImage, sigma: number, rng: () => number): void {
  for (let i = 0; i < img.data.length; i++) img.data[i] = clampByte(img.data[i]! + sigma * gaussian(rng));
}

/** Fills the rectangle [x, x+w) x [y, y+h) with value, clipped. Mutates img. */
export function fillRect(img: GrayImage, x: number, y: number, w: number, h: number, value: number): void {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) img.data[yy * img.width + xx] = value;
}

/** Horizontal gradient image from `left` to `right` gray values. */
export function gradientImage(width: number, height: number, left: number, right: number): GrayImage {
  const img = blankImage(width, height, 0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) img.data[y * width + x] = clampByte(left + ((right - left) * x) / Math.max(1, width - 1));
  return img;
}
