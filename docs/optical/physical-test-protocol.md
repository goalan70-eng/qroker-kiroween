# Physical print and camera validation protocol — Issue #10

Status on 2026-11-16: **preparation only; no printer or phone is available**.
The owner confirmed this in the current chat. No physical result is implied by
the print generator, its raster checks or the detector improvement.

## What changed, and what remains unknown

The refinement-supported detector fixes a reproduced 45-degree staircase
candidate failure. See [the paired experiment](results/issue-10-detector-validation.md).
The earlier 96.7% MODERATE / 81.4% STRESS results describe the old detector's
sampled synthetic images. They are neither real-camera rates nor measurements
of the updated detector. The full historical sweep has not been repeated.

The 52-card codebook and radius 1 remain unchanged. Radius 2 retains the
historical wrong-card counterexamples; radius 1 also accepts 10 of those
deliberately selected four-bit corruptions. Neither is a usable field error-rate
estimate. No decoder radius guarantees detection of arbitrary damage.

The local tools below prepare printing and evaluate saved images. They are
**not** a camera app, browser Scoring Companion, physical game integration or
automatic scoring implementation. Those require a separate architectural task.

## 1. Reproduce the kit locally

Use Node 24, the repository's locked dependencies and a modern browser. No
external API, image upload or model call is used.

```powershell
npm ci
npm run typecheck
npm run check:codebook
npm run render:print -- --out-dir .optical-physical/print --module-mm 1.5875 --dpi 300
```

The generator writes six FRONT and six BACK A4 SVG/PNG sheets, a geometry/hash
manifest and `PRINT-INSTRUCTIONS.md`. Each face contains all 52 identities
exactly once. The actual annotated rasters are checked through marker detection
and fragment decoding; this checks the generated files, not print quality.
SVG has physical millimetre dimensions. PNG includes DPI density metadata.

Print a **single front/back pair first** at actual size / 100%, A4 portrait,
long-edge duplex. Disable fit-to-page, borderless expansion and extra mirroring.
Measure the 50 mm scale bar and the 63.5 × 88.9 mm card outline. A wrong scale
must be corrected in the print settings before any camera trial.

These are fragment-only test cards, not finished playing-card artwork. Before
cutting, use the manifest's page/slot map to label each fixture's centre with
its card id for independent ground truth, keeping ink away from marker quiet
areas. These labels are test aids and must also be concealed before Guess
commitment; do not describe the sheets as a finished private physical deck.

BACK page columns are reversed to align long-edge duplex: `(row,col)` pairs
with `(row,2-col)`. Each card viewed directly from its own back face looks
like its front. Do not mirror the entire back page again. Printer/vendor
mirroring and stock registration remain unverified until the pilot flip test.

The 3.175 mm radius is the existing baseline cut overlay, not a newly approved
commercial tolerance. Start with the baseline. Do not reduce radius, widen
decoder tolerances or alter the frozen codebook to make a trial pass.

## 2. Equipment and setup record

Obtain: printer/print service, A4 stock (record matte/glossy and opacity),
ruler or caliper, cutting tool, intended phone(s), stable camera stand and
diffuse lighting. Opaque card holders or masks must cover all private markers.
Do not order equipment automatically as part of this protocol.

Record before testing:

| Field | Actual observation (blank until measured) |
| --- | --- |
| Session id, date/time, operator | |
| Phone model, OS, browser or camera app/version | |
| Printer/vendor, driver, quality/DPI, ink | |
| Paper brand, thickness/opacity, matte/glossy | |
| Sheet manifest/codebook SHA256, module size | |
| Scale bar measured length; card width/height | |
| Intended/measured corner radius and quiet-margin clearance | |
| Front/back offset dx/dy and rotation; cutting dx/dy | |
| Camera distance, image dimensions, focus/exposure, lighting | |
| Reader commit, Node/CPU and image-conversion size | |

The frozen codebook SHA256 must be
`515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`.
The new `.gitattributes` prevents Windows checkout conversion of that file and
deterministic optical evidence. Do not regenerate/edit the codebook to fix a
local line-ending mismatch.

## 3. Physical prerequisites and privacy

1. Check registration crosses against light and measure actual offsets.
   Measure cut clearance at every marked corner; no quiet margin may be cut.
2. Cut one card and flip it about its vertical axis. Compare marker positions
   and data bits with the generated reference; a horizontal-axis flip must
   correspond to the front rotated 180 degrees. Record observed results.
3. Test on both intended matte and glossy stock with front lighting and
   backlighting. Back markers lie under front blank corners in Body_Frame.
   For example, a heart's front TL/BR and back TR/BL create show-through risk.
4. Use `tools/optical-image-input.html` locally to inspect the exposed blank
   corner, the faint back-marker border and adjacent clean paper. Drag small
   regions to record their mean/min/max gray values. Record
   `contrast = mean(adjacent quiet paper) - mean(ghost border)` and its margin
   below the detector's 40-level minimum contrast. Record the clean-paper
   reference too. Region averages alone do not prove absence of a ghost marker:
   run negative group images and inspect the actual blank corner as well.
5. If show-through is visible or approaches detection contrast, change stock
   opacity or print density and repeat the physical test. Preserve the codebook
   and approved two-sided geometry. An invalid inward blank corner must never
   create a valid four-card group.
6. Cover private Hands, draw piles and unrevealed marker faces with opaque
   holders/masks. A readable marker identifies a card on either face; delayed
   display cannot make it secret. This is a physical/honor-system control,
   not a cryptographic confidentiality claim. Demonstrate scanning only after
   everyone has committed their Guess and the cards may be publicly revealed.

## 4. Predeclare the capture plan

First run an **exploratory pilot** (for example 20 independent captures per
condition). Do not relabel it as the 100-trial release run. Freeze conditions,
seeds/card lists, device, print batch, reader commit and camera settings before
the release run. Keep failed/blurred captures; do not select only successful frames.
Do not pool independent conditions into a misleading overall rate.

For the first physical batch, use 100 independent captures per declared
condition. The template's eight required conditions total 800 captures:
FRONT camera roll 0/45/90/180/270 degrees, BACK after vertical/horizontal flip,
and an intended three-card incomplete group. These are a starting batch, not
the entire physical verification matrix.

Additional separate batches must include:

- Camera roll near 45 degrees (44/46 and fractional framing shifts), versus
  **card placement orientation**, which remains 0 or 180 degrees only.
- Out-of-plane tilt 15/30 degrees, near/far distances and focus blur; normal,
  dim, uneven and reflective lighting. Record actual settings, not a claimed
  equivalence to the synthetic MODERATE/STRESS profiles.
- Measured registration/cut offsets, alignment gaps and per-card placement
  rotation, especially the previously sensitive ~1 mm / 1–2 degree cases.
- Modules 1.5 / baseline 1.5875 / 2.0 mm on separate print batches. Each
  manifest has one module size. Larger markers do not prove improved camera
  reliability until measured.
- Three visible cards, duplicate identities, invalid inward blank corners,
  damaged fragments, non-marker patterns and nearby distractor groups.
- A complete group elsewhere while the intended central group is incomplete:
  the returned vertex must be inside the intended `targetRegion`.
- Both stock finishes, opacity/backlighting, all intended devices, and
  front/back left-right flip behavior. Preserve the full failure record.

Randomize arrangements and re-position/refocus between independent trials.
Adjacent video frames are correlated and cannot be counted as independent
trials for the confidence bound. A four-card valid example at orientation 0 is
TL H-A, TR D-2, BL C-3, BR S-4 (sum 10); this one example does not cover the deck.

## 5. Convert and evaluate real images

Keep original photos and records under ignored `.optical-physical/`. Do not
commit private captures or send them to external models. Open
`tools/optical-image-input.html` directly in the browser. Select the photo;
prefer original resolution up to 16 MP. If resizing is necessary, keep its
size fixed within a condition and record it. The converter applies the
browser's image orientation handling, composites transparency on white and
exports 8-bit P5 PGM. Compare the preview to the original phone orientation.

Drag a small region around the intended four-card intersection and copy its
`targetRegion` pixel coordinates. Download the PGM into the manifest directory.
The decoder receives pixels and fixed radius 1, not the expected card identities.
Supply expected cards separately as independently verified ground truth:
four distinct ids for a valid group, `[]` for a negative/incomplete trial.

```powershell
Copy-Item docs/optical/physical-trial-manifest.template.json .optical-physical/manifest.json
# Fill actual session metadata, planned conditions, trial files, target regions and ground truth.
npm run validate:photos -- --manifest .optical-physical/manifest.json --out .optical-physical/results
```

An unfilled template must fail validation; it is not a claimed real dataset.
File paths must stay under the manifest directory, including their resolved
symlink/junction target. The report records each input hash and dimensions.
For programmatic use see `scripts/validate-optical-photos.ts`.

Read `optical-photos.json` / `.md` as separate measures:

- Raw decoder cards/sum/kind/vertex, exact ground-truth match, target check and
  `RAW_CORRECT` / `RAW_REJECTED` / `RAW_FALSE_ACCEPT`.
- Postcheck outcome from target/reference validation. A false accept caught
  here **remains a raw false accept**; it must not be disguised as a rejection
  or counted as improved recognition accuracy. The truth is unavailable to a
  standalone scanner before reveal and is not fed back to decoding.
- Counts and rates for every condition, missing samples, and the observed
  false-accept count. The one-sided zero-event 95% bound is
  `1 - 0.05^(1/n)` (about 2.95% at n=100), only for zero observed events and
  assuming independent trials from the declared condition. It is not zero risk.
- `COMPLETE` means the declared sample counts exist, **not** release approval;
  `DESCRIPTIVE_ONLY` is intentional. An empty or undersampled set is `INCOMPLETE`.
- Node decode duration excludes capture, conversion, transfer and phone UI.
  The five-second phone goal needs separate physical end-to-end measurements;
  desktop Node timing cannot satisfy it.

## 6. Release/demo decision and remaining evidence

For each declared release condition, require the planned sample count and zero
observed raw misidentifications; any observed wrong acceptance fails that
condition and requires investigation. For nominal correct-read/latency targets,
choose the target before capture (proposed nominal correct-read target 95%;
phone end-to-end goal 5 seconds) and report the measured numerator/denominator
and all failures. Stress conditions are reported separately; do not average
them into nominal acceptance. Zero false accepts is a finite-sample criterion.

Before a physical demonstration, a person must verify the publicly revealed
four cards and their sum. Do not automatically score a single unverified
reading. A mismatch, incomplete group or out-of-target vertex requires
repositioning/rescan or manual entry. These are required Companion behaviors;
this offline evaluation kit does not implement their game/UI integration.

| Release evidence | Result |
| --- | --- |
| Print scale, duplex convention and registration actually measured | NOT RUN |
| Cutting, quiet-margin clearance and zero-gap placement verified | NOT RUN |
| Stock opacity/show-through and invalid blank-corner negatives | NOT RUN |
| Independent real-camera conditions, correct/false accepts and bounds | NOT RUN |
| Actual intended-phone end-to-end latency | NOT RUN |
| Physical concealment before Guess commitment | NOT RUN |
| Camera worker / Companion / game integration | NOT IMPLEMENTED |

Keep existing Kiro task checkboxes unchanged. The full Task 7 sweep and these
physical results remain outstanding even though preparation tools now exist.
Until the real prerequisites pass, present the browser game and labeled
synthetic optical experiments as the working demonstration scope.
