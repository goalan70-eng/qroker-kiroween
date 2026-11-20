"""Wrap local JPEG scenes as a deterministic MJPEG camera clip."""
import argparse
from pathlib import Path
from struct import pack


FPS = 6
WIDTH, HEIGHT = 1280, 960
STAGES = (("emu-27.jpg", 45), ("emu-missing.jpg", 20), ("emu-52.jpg", 35))
GUESS_FLOW_STAGES = ((1, 36), (2, 16), (3, 25), (4, 27), (5, 16), (6, 32))


def chunk(tag, data):
    return tag + pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--guess-flow", action="store_true")
    args = parser.parse_args()
    stages = (tuple((f"guess-{i}.jpg", seconds) for i, seconds in GUESS_FLOW_STAGES)
              if args.guess_flow else STAGES)
    images = [(args.directory / name).read_bytes() for name, _ in stages]
    largest = max(map(len, images))
    frames = sum(seconds for _, seconds in stages) * FPS
    main_header = pack("<14I", round(1_000_000 / FPS), largest * FPS, 0, 0x10,
                       frames, 0, 1, largest, WIDTH, HEIGHT, 0, 0, 0, 0)
    stream_header = pack("<4s4sIHH8I4h", b"vids", b"MJPG", 0, 0, 0,
                         0, 1, FPS, 0, frames, largest, 0xFFFFFFFF, 0, 0, 0, WIDTH, HEIGHT)
    format_header = pack("<IiiHH4sIiiII", 40, WIDTH, HEIGHT, 1, 24, b"MJPG",
                         WIDTH * HEIGHT * 3, 0, 0, 0, 0)
    stream = chunk(b"LIST", b"strl" + chunk(b"strh", stream_header) + chunk(b"strf", format_header))
    headers = chunk(b"LIST", b"hdrl" + chunk(b"avih", main_header) + stream)
    video = bytearray(b"movi")
    index = bytearray()
    for image, (_, seconds) in zip(images, stages, strict=True):
        packet = chunk(b"00dc", image)
        for _ in range(seconds * FPS):
            index.extend(pack("<4sIII", b"00dc", 0x10, len(video), len(image)))
            video.extend(packet)
    clip = chunk(b"RIFF", b"AVI " + headers + chunk(b"LIST", video) + chunk(b"idx1", index))
    name = "guess-flow.avi" if args.guess_flow else "score-sequence.avi"
    (args.directory / name).write_bytes(clip)
    print(f"MJPEG camera clip: {frames} frames at {FPS} FPS, {len(clip)} bytes")


if __name__ == "__main__":
    main()
