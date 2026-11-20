"""Build local test fixtures from the existing 30 mm print layout and codebook."""
import argparse
import base64
import hashlib
import json
from pathlib import Path


def card_groups():
    ranks = "A 2 3 4 5 6 7 8 9 10 J Q K".split()
    yield "printed", ("H-5", "D-9", "C-J", "S-2")
    for i, rank in enumerate(ranks):
        yield f"rank-{i + 1:02}", tuple(f"{suit}-{rank}" for suit in "HDCS")
        yield f"mixed-{i + 1:02}", tuple(
            f"{suit}-{ranks[(i + offset) % len(ranks)]}"
            for suit, offset in zip("HDCS", (0, 3, 7, 11), strict=True)
        )
    for i in range(5):
        yield f"black-{i + 1:02}", tuple(
            f"{suit}-{ranks[(2 * i + offset) % len(ranks)]}"
            for suit, offset in zip("CSCS", (0, 3, 7, 11), strict=True)
        )


def rectangle(slot, pitch, u, v, bit):
    x, y = u * pitch + 5, v * pitch + 5
    if (u + v) % 2:
        y += 35 * (bit ^ (u % 2))
        w, h = 70, 35
    else:
        x += 35 * (bit ^ (v % 2))
        w, h = 35, 70
    cx = cy = pitch * 8
    if slot % 2 == 0:
        x = -x - w
    if slot < 2:
        y = -y - h
    return cx + x, cy + y, cx + x + w, cy + y + h


def crc5(word, aux):
    remainder = ((word << 9) | aux) << 5
    while remainder.bit_length() >= 6:
        remainder ^= 0b100101 << (remainder.bit_length() - 6)
    return remainder


def render(layout, book, art, group):
    width = layout["width"]
    half, pitch = width // 2, width // 16
    pixels = bytearray(art)

    def fill(bounds):
        l, t, r, b = bounds
        ink = b"\x01" * (r - l)
        for y in range(t, b):
            pixels[y * width + l:y * width + r] = ink

    for slot, card in enumerate(group):
        l, t = half * (slot % 2), half * (slot // 2)
        x = l + half - pitch if slot % 2 else l
        y = t + half - pitch if slot >= 2 else t
        fill((x, t, x + pitch, t + half))
        fill((l, y, l + half, y + pitch))
        word, auxiliary = book[card]["word"], book[card]["auxiliary"]
        packed = 0
        for i, (u, v) in enumerate(layout["data"]):
            fill(rectangle(slot, pitch, u, v, (word >> i) & 1))
        for i, cell in enumerate(layout["supplemental"]):
            bit = (auxiliary >> cell["index"]) & 1
            packed |= bit << i
            fill(rectangle(slot, pitch, cell["u"], cell["v"], 1 - bit))
            if cell["index"] not in layout["reassignedAuxiliaryIndices"]:
                fill(rectangle(slot, pitch, cell["v"], cell["u"], bit))
        check = crc5(word, packed)
        for i, pair in enumerate(layout["checkGeometry"][slot]):
            fill(pair[(check >> i) & 1])
    return pixels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    layout_data = (args.source / "joker-uniform-bars-30mm-layout.json").read_bytes()
    book_data = (args.source / "uniform-bars-retest-input.json").read_bytes()
    layout = json.loads(layout_data)
    book = {card["id"]: card for card in json.loads(book_data.decode("utf-8-sig"))}
    assert layout["markerMm"] == 30 and layout["width"] == 1280
    art, void, baseline = (base64.b64decode(layout["layers"][name], validate=True)
                           for name in ("art", "void", "assembled"))
    groups = list(card_groups())
    assert len({tuple(sorted(group)) for _, group in groups}) == len(groups)
    assert {card for _, group in groups for card in group} == set(book) and len(book) == 52
    allowed_suits = ("HC", "DS", "DC", "HS")
    for _, group in groups:
        assert len(set(group)) == 4
        assert all(card[0] in allowed for card, allowed in zip(group, allowed_suits, strict=True))
    assert render(layout, book, art, groups[0][1]) == baseline
    assert tuple(layout["printIds"]) == groups[0][1]
    args.output.mkdir(parents=True, exist_ok=True)
    for name, group in groups:
        (args.output / f"{name}.raw").write_bytes(render(layout, book, art, group))
    (args.output / "void.raw").write_bytes(void)
    (args.output / "groups.tsv").write_text(
        "".join("\t".join((name, *group)) + "\n" for name, group in groups), encoding="ascii")
    print(f"{len(groups)} fixture groups cover {len(book)} card IDs; print reference matches byte-for-byte")
    print(f"Layout SHA-256 {hashlib.sha256(layout_data).hexdigest()}")
    print(f"Codebook SHA-256 {hashlib.sha256(book_data).hexdigest()}")


if __name__ == "__main__":
    main()
