/**
 * Seeded, parameterized, composable degradations of grayscale rasters (task 7.1).
 * SYNTHETIC images, not real cameras: a degradation is a simple, documented image operation, not a lens,
 * sensor or print model. Pure TypeScript, no dependencies, no knowledge of cards, fragments or boards.
 *
 * Image type: `GrayImage` of render.ts (width, height, row-major Uint8Array, 0 = black .. 255 = white).
 * Every function returns a NEW image and never modifies its input.
 *
 * Conventions (identical to testing/warp.ts and detect.ts):
 *  - Continuous image coordinates: pixel (i, j) covers [i, i+1) x [j, j+1), its centre is (i+.5, j+.5), the origin
 *    is the top-left corner of the image and y points DOWN.
 *  - Angles are in degrees. A positive rotation turns the picture CLOCKWISE as displayed. A rotation by 90 degrees
 *    maps pixel (row r, column c) of a square image to (c, n-1-r), which is the D4 transform 'R90' of
 *    transforms.ts / render.ts `applyImageTransform`.
 *  - Reflections use the D4 names of transforms.ts: 'Fh' reverses the ROW order (reflection about the horizontal
 *    axis, as render.ts `reflectHorizontalAxis`), 'Fv' reverses the COLUMN order (reflection about the vertical axis).
 *  - All arithmetic that produces pixels ends in `Math.round` and a clamp to 0..255, so outputs are integers 0..255.
 *  - Lengths of fragment position errors are in MARKER MODULES (one module = `modulePx` pixels in the image).
 *
 * Determinism and seeds: every random operation takes an explicit 32-bit integer seed (0..4294967295) and uses
 * mulberry32 (prng.ts). Same image + parameters + seed gives byte-identical output. `degrade` derives the seed of each
 * random stage from ONE master seed by a fixed per-stage index (`stageSeed`), so adding or removing any other stage
 * never changes the random stream of a stage.
 *
 * Zero strength: rotation 0 (or any multiple of 360), tilt 0, blur sigma 0, noise sigma 0, illumination strength 0,
 * fragment offset 0 and reflection 'none' each return a byte-identical COPY of the input.
 *
 * Reuse of existing code (production code does not import from testing/): the geometric warp (matrix formulas,
 * inverse mapping, bilinear sampling, supersampling), the camera tilt matrix, the Gaussian noise (Box-Muller) and the
 * Gaussian blur / illumination ramp conventions of testing/warp.ts and testing/geometry-trial.ts are re-implemented
 * here with the same arithmetic. degrade.test.ts verifies that the outputs are byte-identical to
 * `warpImage`, `tiltMatrix`, `addGaussianNoise`, `gaussianBlur` and `applyLightingGradient` on shared cases.
 * Differences by design: (1) exact identity / exact quarter-turn fast paths (the supersampled warp of warp.ts softens
 * an identity warp), (2) every parameter is validated and invalid ones throw.
 */
import { mulberry32 } from './prng';
import { FOOTPRINT_MOD, type GrayImage } from './render';

// ---------------------------------------------------------------------------------------------
// Limits (documented maxima; larger values are rejected)
// ---------------------------------------------------------------------------------------------

/** Largest fragment position error in modules: the white quiet margin of a marker footprint is 1 module wide. */
export const MAX_FRAGMENT_OFFSET_MODULES = 1;
/** Levels of the fragment position error named by Requirement 12.5 (any value in [0, MAX] is accepted). */
export const FRAGMENT_OFFSET_LEVELS_MODULES: readonly number[] = [0, 0.1, 0.25];
export const MAX_BLUR_SIGMA_PX = 32;
export const MAX_NOISE_SIGMA = 128;
export const MAX_TILT_DEG = 80;
export const MAX_DISTANCE_DIAGONALS = 1000;
export const MAX_SUPERSAMPLE = 8;
/** Default sub-samples per output pixel and axis of the geometric warp (as the camera warp of the geometry experiment). */
export const DEFAULT_WARP_SUPERSAMPLE = 2;
/** Default camera distance of the perspective, in image diagonals (as CAMERA_DISTANCE_DIAGONALS of geometry-trial.ts). */
export const DEFAULT_DISTANCE_DIAGONALS = 1;
/** Smallest allowed ratio between the perspective denominator at an image corner and at the image centre. */
export const MIN_HOMOGENEOUS_W_RATIO = 0.02;
export const MAX_SEED = 0xffffffff;

export type Mat3 = readonly number[];
export type Reflection = 'none' | 'Fh' | 'Fv';
export const REFLECTIONS: readonly Reflection[] = ['none', 'Fh', 'Fv'];

// ---------------------------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------------------------

function checkImage(img: unknown, name = 'image'): asserts img is GrayImage {
  if (typeof img !== 'object' || img === null) throw new TypeError(`${name} must be a GrayImage object`);
  const g = img as Partial<GrayImage>;
  if (!(g.data instanceof Uint8Array)) throw new TypeError(`${name}.data must be a Uint8Array`);
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || (g.width as number) <= 0 || (g.height as number) <= 0) {
    throw new RangeError(`${name} width and height must be positive integers, got ${String(g.width)} x ${String(g.height)}`);
  }
  if (g.data.length !== (g.width as number) * (g.height as number)) {
    throw new RangeError(`${name}.data has length ${g.data.length}, expected width * height = ${(g.width as number) * (g.height as number)}`);
  }
}

function checkNumber(v: unknown, name: string): number {
  if (typeof v !== 'number') throw new TypeError(`${name} must be a number, got ${typeof v}`);
  if (!Number.isFinite(v)) throw new RangeError(`${name} must be finite, got ${String(v)}`);
  return v;
}

function checkRange(v: unknown, name: string, min: number, max: number): number {
  const n = checkNumber(v, name);
  if (n < min || n > max) throw new RangeError(`${name} must be in [${min}, ${max}], got ${n}`);
  return n;
}

function checkInt(v: unknown, name: string, min: number, max: number): number {
  const n = checkNumber(v, name);
  if (!Number.isInteger(n)) throw new RangeError(`${name} must be an integer, got ${n}`);
  if (n < min || n > max) throw new RangeError(`${name} must be in [${min}, ${max}], got ${n}`);
  return n;
}

function checkSeed(v: unknown, name = 'seed'): number {
  return checkInt(v, name, 0, MAX_SEED);
}

function checkKeys(obj: unknown, allowed: readonly string[], where: string): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError(`${where} must be an object`);
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new TypeError(`${where}: unknown field "${k}" (allowed: ${allowed.join(', ')})`);
  }
}

function cloneImage(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Adding +0 turns -0 into +0, so zero offsets compare equal to 0 under Object.is. */
const noNegZero = (v: number): number => v + 0;

// ---------------------------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------------------------

/** Random stages of `degrade`. The index is part of the seed derivation and must never be renumbered. */
export const STAGE_INDEX = { fragments: 0, noise: 1 } as const;
export type RandomStage = keyof typeof STAGE_INDEX;

/** 32-bit finalizer of MurmurHash3. */
function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Seed of one random stage, a pure function of (master seed, stage). Same derivation as `streamSeed` of the geometry experiment. */
export function stageSeed(masterSeed: number, stage: RandomStage): number {
  checkSeed(masterSeed, 'masterSeed');
  const idx = STAGE_INDEX[stage];
  if (idx === undefined) throw new TypeError(`unknown random stage "${String(stage)}"`);
  return fmix32((masterSeed ^ Math.imul(idx + 1, 0x9e3779b1)) >>> 0);
}

// ---------------------------------------------------------------------------------------------
// 3x3 matrices (row-major, acting on column vectors (x, y, 1)); same formulas as testing/warp.ts
// ---------------------------------------------------------------------------------------------

const IDENTITY: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mat3Multiply(a: Mat3, b: Mat3): number[] {
  const o = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return o;
}

/** compose(A, B) applies A first, then B. */
function mat3Compose(...ms: Mat3[]): number[] {
  let acc = [...IDENTITY];
  for (const m of ms) acc = mat3Multiply(m, acc);
  return acc;
}

function mat3Invert(m: Mat3): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) >= 1e-15)) throw new RangeError('homography is singular (determinant is zero)');
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

function mat3Apply(m: Mat3, x: number, y: number): { x: number; y: number } {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return { x: (m[0]! * x + m[1]! * y + m[2]!) / w, y: (m[3]! * x + m[4]! * y + m[5]!) / w };
}

const translationMatrix = (tx: number, ty: number): number[] => [1, 0, tx, 0, 1, ty, 0, 0, 1];

/** Rotation by thetaDeg clockwise (as displayed, y down) about (cx, cy). */
function rotationMatrix(thetaDeg: number, cx: number, cy: number): number[] {
  const t = (thetaDeg * Math.PI) / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  return [co, -si, cx - co * cx + si * cy, si, co, cy - si * cx - co * cy, 0, 0, 1];
}

/**
 * Pinhole projection of the image plane after tilting it by tiltDeg about an in-plane axis through (cx, cy),
 * seen from distancePx in front of that point (same formula as `tiltMatrix` of testing/warp.ts).
 */
function tiltMatrix(cx: number, cy: number, tiltDeg: number, axisDeg: number, distancePx: number): number[] {
  const tau = (tiltDeg * Math.PI) / 180;
  const al = (axisDeg * Math.PI) / 180;
  const kx = Math.cos(al);
  const ky = Math.sin(al);
  const co = Math.cos(tau);
  const si = Math.sin(tau);
  const r1 = [co + kx * kx * (1 - co), kx * ky * (1 - co), -ky * si];
  const r2 = [kx * ky * (1 - co), co + ky * ky * (1 - co), kx * si];
  const d = distancePx;
  const m = [d * r1[0]!, d * r2[0]!, 0, d * r1[1]!, d * r2[1]!, 0, r1[2]!, r2[2]!, d];
  return mat3Compose(translationMatrix(-cx, -cy), m, translationMatrix(cx, cy));
}

const isIdentity = (m: Mat3): boolean => {
  const s = m[8]!;
  if (s === 0) return false;
  return IDENTITY.every((v, i) => m[i]! / s === v);
};

// ---------------------------------------------------------------------------------------------
// Geometric warp
// ---------------------------------------------------------------------------------------------

export interface WarpOptions {
  /** Gray value (integer 0..255) outside the source rectangle. Default 255. */
  background?: number;
  /** Sub-samples per output pixel and axis (integer 1..8). Default 2. */
  supersample?: number;
}

function resolveWarpOptions(o: WarpOptions | undefined, where: string): { background: number; supersample: number } {
  if (o !== undefined) checkKeys(o, ['background', 'supersample'], where);
  return {
    background: o?.background === undefined ? 255 : checkInt(o.background, `${where}.background`, 0, 255),
    supersample: o?.supersample === undefined ? DEFAULT_WARP_SUPERSAMPLE : checkInt(o.supersample, `${where}.supersample`, 1, MAX_SUPERSAMPLE),
  };
}

/**
 * Validates a homography for an image of size w x h. It must have 9 finite entries, be invertible, and keep the
 * "horizon" (the line where the homogeneous denominator is 0) away from the image rectangle: the denominator at the
 * four corners must have the sign of the denominator at the centre and be at least MIN_HOMOGENEOUS_W_RATIO times it.
 */
function checkHomography(H: unknown, w: number, h: number): number[] {
  if (!Array.isArray(H) || H.length !== 9) throw new TypeError('homography must be an array of 9 numbers (row-major 3x3)');
  const m = H.map((v, i) => checkNumber(v, `homography[${i}]`));
  mat3Invert(m); // throws RangeError when singular
  const wAt = (x: number, y: number): number => m[6]! * x + m[7]! * y + m[8]!;
  const wc = wAt(w / 2, h / 2);
  if (!(Math.abs(wc) > 0)) throw new RangeError('degenerate homography: denominator is 0 at the image centre');
  const sign = wc > 0 ? 1 : -1;
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    if (!(((sign * wAt(x, y)) / (sign * wc)) >= MIN_HOMOGENEOUS_W_RATIO)) {
      throw new RangeError('degenerate homography: the horizon line crosses or touches the image (perspective too strong)');
    }
  }
  return m;
}

/**
 * Inverse-mapping warp with bilinear sampling and supersampling; H maps SOURCE coordinates to OUTPUT coordinates; the
 * output has the size of the source. Same sampling arithmetic as `warpImage` of testing/warp.ts. An exact identity H
 * returns an exact copy (no resampling blur).
 */
export function warpHomography(src: GrayImage, H: Mat3, options?: WarpOptions): GrayImage {
  checkImage(src, 'src');
  const { background: bg, supersample: ss } = resolveWarpOptions(options, 'warp options');
  const m = checkHomography(H as unknown, src.width, src.height);
  if (isIdentity(m)) return cloneImage(src);
  const inv = mat3Invert(m);
  const sw = src.width;
  const sh = src.height;
  const out = new Uint8Array(sw * sh).fill(bg);
  const n = ss * ss;
  for (let oy = 0; oy < sh; oy++) {
    for (let ox = 0; ox < sw; ox++) {
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
      out[oy * sw + ox] = Math.round(acc / n);
    }
  }
  return { width: sw, height: sh, data: out };
}

// ---------------------------------------------------------------------------------------------
// Reflection (exact)
// ---------------------------------------------------------------------------------------------

/** Exact, lossless reflection: 'Fh' reverses the row order, 'Fv' reverses the column order, 'none' copies. */
export function reflectImage(img: GrayImage, reflection: Reflection): GrayImage {
  checkImage(img);
  if (!REFLECTIONS.includes(reflection)) throw new TypeError(`unknown reflection "${String(reflection)}" (allowed: ${REFLECTIONS.join(', ')})`);
  const { width: W, height: H } = img;
  const out = new Uint8Array(W * H);
  if (reflection === 'none') {
    out.set(img.data);
  } else if (reflection === 'Fh') {
    for (let r = 0; r < H; r++) out.set(img.data.subarray(r * W, (r + 1) * W), (H - 1 - r) * W);
  } else {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) out[r * W + (W - 1 - c)] = img.data[r * W + c]!;
  }
  return { width: W, height: H, data: out };
}

// ---------------------------------------------------------------------------------------------
// Rotation and perspective
// ---------------------------------------------------------------------------------------------

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Exact index arithmetic for 0 / 90 / 180 / 270 clockwise; null where the output would not be a pure permutation. */
function exactQuarterTurn(img: GrayImage, deg360: number): GrayImage | null {
  const { width: W, height: H } = img;
  const square = W === H;
  if (deg360 === 0) return cloneImage(img);
  const out = new Uint8Array(W * H);
  if (deg360 === 180) {
    const n = W * H;
    for (let i = 0; i < n; i++) out[n - 1 - i] = img.data[i]!;
  } else if (square && deg360 === 90) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) out[c * W + (W - 1 - r)] = img.data[r * W + c]!;
  } else if (square && deg360 === 270) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) out[(W - 1 - c) * W + r] = img.data[r * W + c]!;
  } else {
    return null;
  }
  return { width: W, height: H, data: out };
}

/**
 * Rotates the picture clockwise by `deg` degrees (any finite real number) about the image centre (w/2, h/2). The
 * output has the input size; uncovered area takes `background`. Multiples of 360 return an exact copy, and 180 (and
 * 90 / 270 of a square image) are exact index permutations (no resampling); every other angle is one bilinear,
 * supersampled warp with the matrix of `rotationMatrix` (testing/warp.ts), i.e. the same as testing/group-compose
 * `rotateImage` when options = { supersample: 3, background: 255 }.
 */
export function rotateImage(img: GrayImage, deg: number, options?: WarpOptions): GrayImage {
  checkImage(img);
  const a = checkNumber(deg, 'deg');
  const warpOpts = resolveWarpOptions(options, 'rotate options');
  const d360 = normalizeDeg(a);
  const exact = exactQuarterTurn(img, d360);
  if (exact !== null) return exact;
  return warpHomography(img, rotationMatrix(a, img.width / 2, img.height / 2), warpOpts);
}

export interface PerspectiveParams {
  /** Angle between the tilted plane and the image plane, degrees, |tiltDeg| <= 80. 0 = frontal (identity). */
  tiltDeg: number;
  /** Direction of the tilt axis in the image plane, degrees clockwise from the +x axis (any finite value). */
  axisDeg: number;
  /**
   * Camera distance in units of the image diagonal (focal length = distance), > 0 and <= 1000. Default 1.
   * Smaller means stronger perspective; parameter sets whose horizon line comes too close to the image are rejected.
   */
  distanceDiagonals?: number;
}

function resolvePerspective(p: unknown, where: string): { tiltDeg: number; axisDeg: number; distanceDiagonals: number } {
  checkKeys(p, ['tiltDeg', 'axisDeg', 'distanceDiagonals'], where);
  const q = p as PerspectiveParams;
  const tiltDeg = checkRange(q.tiltDeg, `${where}.tiltDeg`, -MAX_TILT_DEG, MAX_TILT_DEG);
  const axisDeg = checkNumber(q.axisDeg, `${where}.axisDeg`);
  const dd = q.distanceDiagonals === undefined ? DEFAULT_DISTANCE_DIAGONALS : checkNumber(q.distanceDiagonals, `${where}.distanceDiagonals`);
  if (!(dd > 0 && dd <= MAX_DISTANCE_DIAGONALS)) throw new RangeError(`${where}.distanceDiagonals must be in (0, ${MAX_DISTANCE_DIAGONALS}], got ${dd}`);
  return { tiltDeg, axisDeg, distanceDiagonals: dd };
}

/** Homography of the perspective for an image of size w x h (tilt about the image centre). */
export function perspectiveMatrix(w: number, h: number, p: PerspectiveParams): number[] {
  const q = resolvePerspective(p, 'perspective');
  const diag = Math.hypot(w, h);
  const m = tiltMatrix(w / 2, h / 2, q.tiltDeg, q.axisDeg, q.distanceDiagonals * diag);
  checkHomography(m, w, h);
  return m;
}

/** One perspective warp (pinhole view of the plane tilted about the image centre). tiltDeg 0 returns an exact copy. */
export function perspectiveImage(img: GrayImage, p: PerspectiveParams, options?: WarpOptions): GrayImage {
  checkImage(img);
  const warpOpts = resolveWarpOptions(options, 'perspective options');
  const m = perspectiveMatrix(img.width, img.height, p);
  return warpHomography(img, m, warpOpts);
}

// ---------------------------------------------------------------------------------------------
// Illumination gradient
// ---------------------------------------------------------------------------------------------

/**
 * Multiplicative linear illumination ramp, the model of `applyLightingGradient` (geometry-trial.ts): the gain is 1 at
 * the image edge on the side the light comes from and falls linearly to 1 - strength at the opposite edge. The picture
 * gets DARKER in the direction `directionDeg` (clockwise from +x, y down: 0 = darker towards the right, 90 = towards
 * the bottom). The mean of a flat image is multiplied by 1 - strength/2 (the ramp does not preserve the mean).
 * strength is in [0, 1]; 0 returns an exact copy.
 */
export function applyIllumination(img: GrayImage, strength: number, directionDeg: number): GrayImage {
  checkImage(img);
  const s = checkRange(strength, 'strength', 0, 1);
  const dir = checkNumber(directionDeg, 'directionDeg');
  if (s === 0) return cloneImage(img);
  const { width: w, height: h } = img;
  const a = (dir * Math.PI) / 180;
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const half = (Math.abs(cx) * w) / 2 + (Math.abs(cy) * h) / 2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = 0.5 + ((x + 0.5 - w / 2) * cx + (y + 0.5 - h / 2) * cy) / (2 * half);
      const gain = 1 - s * t;
      out[y * w + x] = clampByte(img.data[y * w + x]! * gain);
    }
  }
  return { width: w, height: h, data: out };
}

// ---------------------------------------------------------------------------------------------
// Blur and noise
// ---------------------------------------------------------------------------------------------

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  return k;
}

/**
 * Separable Gaussian blur, sigma in pixels (0..32), kernel radius max(1, ceil(3 sigma)), edge pixels replicated,
 * rounded once at the end (`gaussianBlur` of geometry-trial.ts). sigma 0 returns an exact copy.
 */
export function blurImage(img: GrayImage, sigmaPx: number): GrayImage {
  checkImage(img);
  const sigma = checkRange(sigmaPx, 'sigmaPx', 0, MAX_BLUR_SIGMA_PX);
  if (sigma === 0) return cloneImage(img);
  const k = gaussianKernel(sigma);
  const radius = (k.length - 1) / 2;
  const { width: w, height: h } = img;
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        s += (img.data[y * w + xx] as number) * (k[i + radius] as number);
      }
      tmp[y * w + x] = s;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        s += (tmp[yy * w + x] as number) * (k[i + radius] as number);
      }
      out[y * w + x] = clampByte(s);
    }
  }
  return { width: w, height: h, data: out };
}

/** Standard normal sample (Box-Muller, two uniform draws per sample), as `gaussian` of testing/warp.ts. */
function gaussianSample(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Adds independent Gaussian noise of standard deviation sigma gray levels (0..128) to every pixel, then rounds
 * and clamps to 0..255 (`addGaussianNoise` of testing/warp.ts, rng = mulberry32(seed)). Pixels are visited in
 * row-major order with two uniform draws each. sigma 0 returns an exact copy and draws nothing.
 */
export function addNoise(img: GrayImage, sigma: number, seed: number): GrayImage {
  checkImage(img);
  const s = checkRange(sigma, 'sigma', 0, MAX_NOISE_SIGMA);
  const sd = checkSeed(seed);
  if (s === 0) return cloneImage(img);
  const rng = mulberry32(sd);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = clampByte(img.data[i]! + s * gaussianSample(rng));
  return { width: img.width, height: img.height, data: out };
}

// ---------------------------------------------------------------------------------------------
// Fragment position error (marker offsets, in modules)
// ---------------------------------------------------------------------------------------------

export interface FragmentOffset {
  /** Offset to the right, in modules (pixels / modulePx). */
  dxModules: number;
  /** Offset downwards, in modules. */
  dyModules: number;
}

/**
 * Per-fragment position errors. Definition: every fragment gets an error VECTOR of length exactly
 * `magnitudeModules` (the requirement levels are 0, 0.1 and 0.25 module; any value in [0, 1] is accepted) in a random
 * direction, uniform on the circle (the convention used for the duplex registration errors of geometry-trial.ts).
 * Exactly one uniform draw per fragment, whatever the magnitude, so the directions for a seed do not depend on the
 * level; magnitude 0 gives exactly +0 for both components.
 */
export function fragmentOffsets(count: number, magnitudeModules: number, seed: number): FragmentOffset[] {
  const n = checkInt(count, 'count', 0, 1_000_000);
  const m = checkRange(magnitudeModules, 'magnitudeModules', 0, MAX_FRAGMENT_OFFSET_MODULES);
  const rng = mulberry32(checkSeed(seed));
  const out: FragmentOffset[] = [];
  for (let i = 0; i < n; i++) {
    const theta = rng() * 2 * Math.PI;
    out.push({ dxModules: noNegZero(m * Math.cos(theta)), dyModules: noNegZero(m * Math.sin(theta)) });
  }
  return out;
}

/** Integer pixel rectangle [x0, x1) x [y0, y1) in image coordinates. */
export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The 9 x 9 module footprint (marker, 1 module white margin included) centred on the pixel position (cx, cy) of a
 * marker centre, with edges rounded to whole pixels.
 */
export function markerFootprintRect(cx: number, cy: number, modulePx: number): PixelRect {
  const x = checkNumber(cx, 'cx');
  const y = checkNumber(cy, 'cy');
  const m = checkRange(modulePx, 'modulePx', Number.MIN_VALUE, 1e6);
  const half = (FOOTPRINT_MOD * m) / 2;
  return { x0: Math.round(x - half), y0: Math.round(y - half), x1: Math.round(x + half), y1: Math.round(y + half) };
}

function checkRects(rects: unknown, w: number, h: number): readonly PixelRect[] {
  if (!Array.isArray(rects)) throw new TypeError('rects must be an array of pixel rectangles');
  rects.forEach((r, i) => {
    checkKeys(r, ['x0', 'y0', 'x1', 'y1'], `rects[${i}]`);
    const q = r as PixelRect;
    const x0 = checkInt(q.x0, `rects[${i}].x0`, 0, w);
    const y0 = checkInt(q.y0, `rects[${i}].y0`, 0, h);
    const x1 = checkInt(q.x1, `rects[${i}].x1`, 0, w);
    const y1 = checkInt(q.y1, `rects[${i}].y1`, 0, h);
    if (x1 <= x0 || y1 <= y0) throw new RangeError(`rects[${i}] is empty or inverted`);
  });
  return rects as readonly PixelRect[];
}

/**
 * Image-space form of the fragment position error: the content of each rectangle (a marker footprint) is translated
 * by its offset (modules * modulePx pixels, +x right, +y down) with bilinear resampling (no supersampling, so a whole
 * pixel shift is exact), staying inside its rectangle: content shifted in from outside the rectangle takes
 * `background` (default 255, matching the white quiet margin) and what is shifted out is cut off. Pixels outside all
 * rectangles are untouched. Every rectangle is read from the ORIGINAL image, later rectangles paint over earlier ones.
 * Offsets up to 1 module (the width of the white margin) cannot cut off black marker modules. All-zero offsets
 * return an exact copy. Pure function of its arguments (the randomness is in `fragmentOffsets`).
 */
export function applyFragmentOffsets(
  img: GrayImage,
  rects: readonly PixelRect[],
  offsets: readonly FragmentOffset[],
  modulePx: number,
  options: { background?: number } = {},
): GrayImage {
  checkImage(img);
  checkKeys(options, ['background'], 'options');
  const bg = options.background === undefined ? 255 : checkInt(options.background, 'options.background', 0, 255);
  const m = checkRange(modulePx, 'modulePx', Number.MIN_VALUE, 1e6);
  const rs = checkRects(rects, img.width, img.height);
  if (!Array.isArray(offsets) || offsets.length !== rs.length) throw new TypeError('offsets must be an array with one entry per rectangle');
  const out = cloneImage(img);
  rs.forEach((r, i) => {
    const o = offsets[i] as FragmentOffset;
    checkKeys(o, ['dxModules', 'dyModules'], `offsets[${i}]`);
    const dx = checkRange(o.dxModules, `offsets[${i}].dxModules`, -MAX_FRAGMENT_OFFSET_MODULES, MAX_FRAGMENT_OFFSET_MODULES) * m;
    const dy = checkRange(o.dyModules, `offsets[${i}].dyModules`, -MAX_FRAGMENT_OFFSET_MODULES, MAX_FRAGMENT_OFFSET_MODULES) * m;
    if (dx === 0 && dy === 0) return;
    const rw = r.x1 - r.x0;
    const rh = r.y1 - r.y0;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        // output pixel centre (x + .5, y + .5) takes the source value at (x + .5 - dx, y + .5 - dy)
        const px = x + 0.5 - dx;
        const py = y + 0.5 - dy;
        let v: number;
        if (!(px >= 0 && px <= rw && py >= 0 && py <= rh)) {
          v = bg;
        } else {
          const fx = px - 0.5;
          const fy = py - 0.5;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const xa = Math.min(rw - 1, Math.max(0, x0));
          const xb = Math.min(rw - 1, Math.max(0, x0 + 1));
          const ya = Math.min(rh - 1, Math.max(0, y0));
          const yb = Math.min(rh - 1, Math.max(0, y0 + 1));
          const at = (xx: number, yy: number): number => img.data[(r.y0 + yy) * img.width + r.x0 + xx]!;
          const top = at(xa, ya) * (1 - tx) + at(xb, ya) * tx;
          const bot = at(xa, yb) * (1 - tx) + at(xb, yb) * tx;
          v = Math.round(top * (1 - ty) + bot * ty);
        }
        out.data[(r.y0 + y) * img.width + r.x0 + x] = v;
      }
    }
  });
  return out;
}

/** `fragmentOffsets(rects.length, magnitudeModules, seed)` followed by `applyFragmentOffsets`. */
export function shiftFragments(
  img: GrayImage,
  rects: readonly PixelRect[],
  magnitudeModules: number,
  modulePx: number,
  seed: number,
  options: { background?: number } = {},
): GrayImage {
  checkImage(img);
  const rs = checkRects(rects, img.width, img.height);
  return applyFragmentOffsets(img, rs, fragmentOffsets(rs.length, magnitudeModules, seed), modulePx, options);
}

// ---------------------------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------------------------

export interface FragmentErrorParams {
  /** Footprint rectangles of the fragments (in the input image), e.g. from `markerFootprintRect`. */
  rects: readonly PixelRect[];
  /** Length of each fragment's error vector in modules (0, 0.1, 0.25, or any value in [0, 1]). */
  magnitudeModules: number;
  /** Pixels per module of the input image. */
  modulePx: number;
}

export interface DegradeParams {
  /** Master seed (integer 0..4294967295). Required, even when no random stage is active. */
  seed: number;
  /** Stage 0: per-fragment position error in the scene. Seeded through stageSeed(seed, 'fragments'). */
  fragments?: FragmentErrorParams;
  /** Stage 1: exact reflection. Default 'none'. */
  reflect?: Reflection;
  /** Stage 2: camera rotation in degrees clockwise (any finite value) about the image centre. Default 0. */
  rotationDeg?: number;
  /** Stage 2: perspective tilt (applied before the rotation, in the same single warp). Default none. */
  perspective?: PerspectiveParams;
  /** Gray value (0..255) of uncovered area of the warp. Default 255. */
  background?: number;
  /** Sub-samples per output pixel and axis of the warp (1..8). Default 2. */
  warpSupersample?: number;
  /** Stage 3: illumination ramp. Default none. */
  illumination?: { strength: number; directionDeg: number };
  /** Stage 4: Gaussian blur sigma in pixels. Default 0. */
  blurSigmaPx?: number;
  /** Stage 5: Gaussian noise sigma in gray levels. Seeded through stageSeed(seed, 'noise'). Default 0. */
  noiseSigma?: number;
}

const PARAM_KEYS = ['seed', 'fragments', 'reflect', 'rotationDeg', 'perspective', 'background', 'warpSupersample', 'illumination', 'blurSigmaPx', 'noiseSigma'];

/**
 * Applies the degradations in a FIXED order, whatever the order of the fields in `params`:
 *
 *   0. fragment position errors (scene space: the markers are displaced on the printed/composed scene)
 *   1. reflection (exact permutation of pixels; the scene seen mirrored, e.g. through a flipped card)
 *   2. geometric warp: perspective tilt, then camera rotation, composed into ONE homography and ONE resampling
 *      (as `degradeImage` of geometry-trial.ts: compose(tiltMatrix, rotationMatrix))
 *   3. illumination ramp (a gain in the image frame of the camera, applied to the warped picture including its background)
 *   4. blur (optics/focus: acts on the picture and on the lighting ramp, but not on the sensor noise)
 *   5. noise (sensor noise is added last, so it is independent per pixel with the requested sigma and is not blurred)
 *
 * Geometry comes first so that the later stages work in the camera image frame; exact stages (0, 1) come first so
 * only one lossy resampling happens. This order differs from geometry-trial.ts only in swapping blur and
 * lighting (nearly commuting smooth operations) and adding the noise stage.
 *
 * Seeds: the random stages use stageSeed(params.seed, 'fragments') and stageSeed(params.seed, 'noise'), functions of
 * the master seed only, so enabling, disabling or changing any other stage never changes their random streams.
 *
 * All parameters are validated before any work is done (RangeError for invalid values, TypeError for wrong types
 * and unknown fields). A parameter set with every strength at zero returns an equal copy of the input.
 */
export function degrade(image: GrayImage, params: DegradeParams): GrayImage {
  checkImage(image);
  checkKeys(params, PARAM_KEYS, 'params');
  const seed = checkSeed(params.seed, 'params.seed');
  const { width: w, height: h } = image;

  // ---- validation of every stage first
  let frag: { rects: readonly PixelRect[]; magnitude: number; modulePx: number } | null = null;
  if (params.fragments !== undefined) {
    checkKeys(params.fragments, ['rects', 'magnitudeModules', 'modulePx'], 'params.fragments');
    const rects = checkRects(params.fragments.rects, w, h);
    const magnitude = checkRange(params.fragments.magnitudeModules, 'params.fragments.magnitudeModules', 0, MAX_FRAGMENT_OFFSET_MODULES);
    const modulePx = checkRange(params.fragments.modulePx, 'params.fragments.modulePx', Number.MIN_VALUE, 1e6);
    frag = { rects, magnitude, modulePx };
  }
  const reflect = params.reflect ?? 'none';
  if (!REFLECTIONS.includes(reflect)) throw new TypeError(`unknown reflection "${String(reflect)}" (allowed: ${REFLECTIONS.join(', ')})`);
  const rotationDeg = params.rotationDeg === undefined ? 0 : checkNumber(params.rotationDeg, 'params.rotationDeg');
  const warpOpts = resolveWarpOptions({ background: params.background, supersample: params.warpSupersample } as WarpOptions, 'params');
  let tilt: number[] | null = null;
  if (params.perspective !== undefined) {
    const q = resolvePerspective(params.perspective, 'params.perspective');
    if (q.tiltDeg !== 0) tilt = perspectiveMatrix(w, h, q);
  }
  let illum: { strength: number; directionDeg: number } | null = null;
  if (params.illumination !== undefined) {
    checkKeys(params.illumination, ['strength', 'directionDeg'], 'params.illumination');
    illum = {
      strength: checkRange(params.illumination.strength, 'params.illumination.strength', 0, 1),
      directionDeg: checkNumber(params.illumination.directionDeg, 'params.illumination.directionDeg'),
    };
  }
  const blur = params.blurSigmaPx === undefined ? 0 : checkRange(params.blurSigmaPx, 'params.blurSigmaPx', 0, MAX_BLUR_SIGMA_PX);
  const noise = params.noiseSigma === undefined ? 0 : checkRange(params.noiseSigma, 'params.noiseSigma', 0, MAX_NOISE_SIGMA);

  // ---- stages in the fixed order
  let img = image;
  if (frag !== null && frag.magnitude > 0) {
    img = shiftFragments(img, frag.rects, frag.magnitude, frag.modulePx, stageSeed(seed, 'fragments'));
  }
  if (reflect !== 'none') img = reflectImage(img, reflect);
  if (tilt !== null) {
    img = warpHomography(img, mat3Compose(tilt, rotationMatrix(rotationDeg, w / 2, h / 2)), warpOpts);
  } else if (normalizeDeg(rotationDeg) !== 0) {
    img = rotateImage(img, rotationDeg, warpOpts);
  }
  if (illum !== null && illum.strength > 0) img = applyIllumination(img, illum.strength, illum.directionDeg);
  if (blur > 0) img = blurImage(img, blur);
  if (noise > 0) img = addNoise(img, noise, stageSeed(seed, 'noise'));
  return img === image ? cloneImage(image) : img;
}
