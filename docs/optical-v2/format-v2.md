# Composite Code V2 format candidate 2.0.0-m3.1

Codex implementation of the approved Kiro V2-M3 scope. Geometry is taken from the [Gate 2 reassessment](results/m2-gate-r2-2026-11-19.md). The target appearance is one continuous assembled square. The nominal reference has zero seam and frame displacement. Real continuity is evaluated by measured gap and frame displacement.

| Parameter | M3 reference |
| --- | --- |
| Assembled square | 16 × 16 modules, 25.4 × 25.4 mm |
| Module | 1.5875 mm |
| Piece | 8 × 8 modules |
| Quiet zone | One module (1.5875 mm) outside the assembled square only |
| Central_Void | Four 3.175 mm rounded card corners, applied as a geometric mask |
| Symmetry limits | Global mismatch fraction 0.001 and local deviation 0.125 modules over a 1-module window, proposed, pending owner approval |
| Decoration | OFF for M3. The approved C4 rule mirrors a future decoration with the optical layer. |

Use the 52 standard card IDs in H, D, C, S suit order and A through K rank order. Joker is an optional decoration, with no card identity. Use the same two printed corners per suit as V1: H TL/BR, D TR/BL, C TR/BR, S TL/BL. Each front piece is fixed for its card/body corner and can be used only at 0° or 180°. The reverse optical layer is the horizontal mirror about the card body's vertical axis of that same card's front optical layer. This maps to two disjoint body corners. Text and other art lie outside the optical renderer. Front rank/suit artwork must clear the marker; a production card face is still needed to check the actual index clearance. A visible marker on either face reveals the card identity. This custom format is outside ISO 18004 and supplies no cryptographic secrecy.

## Data and read order

A 5 × 5 V1 word needs 25 data cells per piece. The M2 protected mask supplies 15, so V1 words do not fit without changing either the approved mask or the pattern format. The V2 candidate assigns a separate 15-bit word algorithmically, leaving the V1 book untouched. Enumerate seven-bit messages 1 through 127 in ascending order and append eight parity bits by systematic binary polynomial division by `x^8 + x^7 + x^6 + x^4 + 1`. A word is eligible when its numeric value is at most that of its x/y transpose in the grid defined below. Assign the first 52 eligible words in sequence to the ordered card IDs. This versioned rule defines the mapping without a stored generated table.

Use outward coordinates `u,v` measured from each piece's inward vertex with x along card width and y along card height. Store the least significant bit first in row-major order with v increasing from 2 to 5, then u increasing from 2 to 5, excluding (2,2). A 0 bit uses the light field and a 1 bit is dark. Local coordinates explain how each fixed print is observed in opposite slots, without a different pattern per slot. Distinct IDs have Hamming distance at least five both in aligned readings and when one word undergoes x/y transposition. This assumes registration to the correct piece cell centers. Frame finding, axis hypotheses, remaining transformation ambiguity and accepted-result policy are V2-M4 evidence.

## Raster interfaces

- `generateCard` gives two fixed front ink layers and derives two reverse layers by horizontal flip. The 8 × 8 module ink array is a print input, with final trim performed during scene assembly.
- `renderSquare` accepts four distinct valid placements. It projects the chosen preprinted piece, clips it to its own ideally rounded or shifted card edge, and emits versioned grayscale pixels, shared coverage, data samples, a nominal void mask and the fixed M2 Keep_Out_Mask. Data carries no value at unprinted locations. Light printed areas count as shared coverage.
- A straight-edge study supports a seam gap and per-piece print/cut translations in board-module coordinates. Reports give the four geometric seam gaps at frame joins and the tangential frame displacement in modules. Overlapping printed supports are rejected. No camera perspective, blur or recognition is performed here.
- Compare the 16 placement classes independently against the original M2 result record. The fixed protected mask covers only the 15 data cells, two critical frame strips per quadrant, and the exterior quiet band. Visual frame endcaps can be printed without changing that protected mask.
