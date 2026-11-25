"""Generate matched face-local SVGs and long-edge A4 sheets from the staged center-grid deck."""
import argparse
import base64
import hashlib
import math
import runpy
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
STAGED = runpy.run_path(str(ROOT / "stage-deck.py"))
OUT = ROOT / "deliverables" / "center-grid-duplex"
NS = "{http://www.w3.org/2000/svg}"
ET.register_namespace("", NS[1:-1])
CARDS = [rank + suit for suit in "HDCS" for rank in STAGED["RANKS"]]

# Kennard's original red diamond back is shared by every rank and suit.
DEFAULT_ART = ROOT.parents[1] / "local-optical-previews/web-game/kennard-sample/kennard-standard.zip"
BACK_DIGEST = "263ae261b697739d7c7db7080da0b64044b0c0b99e6c13c6372ad5cc0a40f2f2"


def back_for(front, artwork, *, margin_mm=1.5, mirror_markers=False):
    source = ET.fromstring(front)
    pattern = ET.fromstring(artwork)
    if source.get("viewBox") != pattern.get("viewBox"):
        raise ValueError("Front and back must use the same card coordinates")
    trim = source.find(f"{NS}defs/{NS}clipPath[@id='qroker-trim']")
    images = source.findall(f"{NS}g/{NS}image")
    if trim is None or len(images) != 2:
        raise ValueError("Expected a trim outline and two embedded optical fragments")
    back = ET.Element(NS + "svg", source.attrib)
    defs = pattern.find(NS + "defs")
    pattern.remove(defs)
    defs.append(trim)
    back.append(defs)
    layer = ET.SubElement(back, NS + "g", {"clip-path": "url(#qroker-trim)"})
    layer.extend(pattern)
    if mirror_markers:
        layer = ET.SubElement(layer, NS + "g", {"transform": "scale(-1 1)"})
    if margin_mm:
        margin = margin_mm * 240 / 63.5
        for image in images:
            x, y, w, h = (float(image.attrib[k]) for k in ("x", "y", "width", "height"))
            ET.SubElement(layer, NS + "rect", {
                "x": str(x - margin), "y": str(y - margin),
                "width": str(w + 2 * margin), "height": str(h + 2 * margin), "fill": "white",
            })
    layer.extend(images)
    return ET.tostring(back, encoding="utf-8", xml_declaration=True)


def image_tag(svg):
    data = base64.b64encode(svg).decode("ascii")
    return f'<img src="data:image/svg+xml;base64,{data}">'


def print_html(faces, register_duplex=False):
    sheets = []
    for start in range(0, len(CARDS), 9):
        for side in ("front", "back"):
            cards = []
            for slot, name in enumerate(CARDS[start:start + 9]):
                row, col = divmod(slot, 3)
                x = 6.75 + (col if register_duplex or side == "front" else 2 - col) * 66.5
                y = 12.15 + row * 91.9
                # Marks lie entirely in the waste, outside the finished card.
                marks = ('<svg class="marks" viewBox="-2 -2 67.5 92.9"><path '
                         'd="M-1.4 0H-.4M0 -1.4V-.4M63.9 0h1M63.5 -1.4v1'
                         'M-1.4 88.9h1M0 89.3v1M63.9 88.9h1M63.5 89.3v1" '
                         'fill="none" stroke="#777" stroke-width=".12"/></svg>') if side == "front" else ""
                cards.append(f'<div class="card" style="left:{x}mm;top:{y}mm">{image_tag(faces[side][name])}{marks}</div>')
            label = "앞면" if side == "front" else "뒷면"
            # The entire back page will be reflected in PDF coordinates. Undo that
            # reflection locally for the label and for the final face-local SVGs.
            kind = "preflip" if register_duplex and side == "back" else ""
            sheets.append(f'<section class="{kind}"><header>QRoker · {start // 9 + 1}/6 · {label}</header>{"".join(cards)}</section>')
    return '''<!doctype html><html lang="ko"><meta charset="utf-8"><style>
@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}body{margin:0}
section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}
section:last-child{break-after:auto}header{position:absolute;top:3.1mm;width:100%;text-align:center;font:8pt sans-serif}
.card{position:absolute;width:63.5mm;height:88.9mm}.card img{display:block;width:100%;height:100%}
.marks{position:absolute;top:-2mm;left:-2mm;width:67.5mm;height:92.9mm}
.preflip .card img,.preflip header{transform:scaleX(-1)}
</style>''' + "".join(sheets) + "</html>"


def register_pdf(file):
    from pypdf import PdfReader, PdfWriter, Transformation
    from pypdf.generic import RectangleObject

    writer = PdfWriter()
    for index, page in enumerate(PdfReader(file).pages):
        page = writer.add_page(page)
        # Chromium rounds its CSS paper size. Register both sides about the
        # exact physical A4 centre, independent of its CSS pixel rounding.
        width, height = 210 * 72 / 25.4, 297 * 72 / 25.4
        page.mediabox = RectangleObject((0, 0, width, height))
        page.cropbox = RectangleObject((0, 0, width, height))
        if index % 2:
            page.add_transformation(Transformation((-1, 0, 0, 1, width, 0)))
    with file.open("wb") as out:
        writer.write(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    art = parser.add_mutually_exclusive_group()
    art.add_argument("--kennard-zip", type=Path, default=DEFAULT_ART, help="Original Kennard standard deck ZIP")
    art.add_argument("--back-jpeg", type=Path, help="Full-face portrait artwork to place beneath the markers")
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--register-duplex", action="store_true",
                        help="Match optical ink through the sheet on a long-edge flip (requires pypdf)")
    margins = parser.add_mutually_exclusive_group()
    margins.add_argument("--marker-margin-mm", type=float, default=1.5, help="White space around each back marker in mm")
    margins.add_argument("--flush-markers", dest="marker_margin_mm", action="store_const", const=0,
                         help="Let back artwork meet the marker edges")
    args = parser.parse_args()
    if not math.isfinite(args.marker_margin_mm) or args.marker_margin_mm < 0:
        parser.error("--marker-margin-mm must be finite and nonnegative")
    if args.back_jpeg:
        encoded = base64.b64encode(args.back_jpeg.read_bytes()).decode("ascii")
        artwork = (f'<svg xmlns="{NS[1:-1]}" viewBox="-120 -168 240 336"><defs/><g>'
                   f'<image x="-120" y="-168" width="240" height="336" preserveAspectRatio="none" '
                   f'href="data:image/jpeg;base64,{encoded}"/></g></svg>')
    else:
        with ZipFile(args.kennard_zip) as deck:
            artwork = deck.read("2B.svg")
        if hashlib.sha256(artwork).hexdigest() != BACK_DIGEST:
            raise ValueError("Unexpected Kennard back artwork")
    staged = {n: (ROOT / "inputs/cards" / n).read_bytes() for n in STAGED["NAMES"]}
    digest = hashlib.sha256()
    for name, data in staged.items():
        digest.update(name.encode("ascii") + b"\0" + hashlib.sha256(data).digest())
    if digest.hexdigest() != STAGED["EXPECTED_DECK"]:
        raise ValueError("Stage the verified center-grid deck before building the duplex files")
    fronts = {name: staged[f"{name}.svg"] for name in CARDS}
    backs = {name: back_for(front, artwork, margin_mm=args.marker_margin_mm,
                            mirror_markers=args.register_duplex) for name, front in fronts.items()}
    faces = {"front": fronts, "back": backs}
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        sheet = work / "sheets.html"
        sheet.write_text(print_html(faces, args.register_duplex), encoding="utf-8")
        pdf = work / "QRoker-center-grid-duplex-A4.pdf"
        subprocess.run(["node", "-e", """
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage();
    await page.goto(process.argv[1]);
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
    await page.pdf({path:process.argv[2], preferCSSPageSize:true, printBackground:true});
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode=1;});
""", sheet.as_uri(), str(pdf)], cwd=ROOT, check=True)
        if args.register_duplex:
            register_pdf(pdf)
        archive = work / "QRoker-center-grid-duplex-SVG.zip"
        with ZipFile(archive, "w", ZIP_DEFLATED) as z:
            for side, images in faces.items():
                for name, data in images.items():
                    z.writestr(f"{side}/{name}.svg", data)
            z.writestr("support.png", staged["support.png"])
        for file in (archive, pdf):
            (args.out / file.name).write_bytes(file.read_bytes())


if __name__ == "__main__":
    main()
