"""Wrap three local JPEG scenes as a deterministic MJPEG camera clip."""
import argparse
from pathlib import Path
from struct import pack


FPS = 6
WIDTH, HEIGHT = 1280, 960
STAGES = (("emu-27.jpg", 45), ("emu-missing.jpg", 20), ("emu-52.jpg", 35))


def chunk(tag, data):
    return tag + pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    images = [(args.directory / name).read_bytes() for name, _ in STAGES]
    largest = max(map(len, images))
    frames = sum(seconds for _, seconds in STAGES) * FPS
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
    for image, (_, seconds) in zip(images, STAGES, strict=True):
        packet = chunk(b"00dc", image)
        for _ in range(seconds * FPS):
            index.extend(pack("<4sIII", b"00dc", 0x10, len(video), len(image)))
            video.extend(packet)
    clip = chunk(b"RIFF", b"AVI " + headers + chunk(b"LIST", video) + chunk(b"idx1", index))
    (args.directory / "score-sequence.avi").write_bytes(clip)
    print(f"MJPEG camera clip: {frames} frames at {FPS} FPS, {len(clip)} bytes")


if __name__ == "__main__":
    main()
