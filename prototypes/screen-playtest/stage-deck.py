"""Stage only the validated center-grid assets from the local card package."""
import hashlib
from pathlib import Path
import sys
from zipfile import ZipFile


EXPECTED_DECK = "481cb72ef3ef009926f639d5c0c87aaced79d5f94f120db18fa29e9c48d51dfc"
RANKS = "A 2 3 4 5 6 7 8 9 10 J Q K".split()
NAMES = sorted(["support.png"] + [rank + suit + ".svg" for suit in "HDCS" for rank in RANKS])


def main():
    source = Path(sys.argv[1])
    with ZipFile(source) as archive:
        assets = {name: archive.read(f"cards/{name}") for name in NAMES}
    fingerprint = hashlib.sha256()
    for name, asset in assets.items():
        fingerprint.update(name.encode("ascii") + b"\0" + hashlib.sha256(asset).digest())
    if fingerprint.hexdigest() != EXPECTED_DECK:
        raise SystemExit("The supplied deck does not match the screen-playtest decoder.")
    output = Path(__file__).resolve().parent / "inputs/cards"
    output.mkdir(parents=True, exist_ok=True)
    for name, asset in assets.items():
        (output / name).write_bytes(asset)
    print("52 checked card faces and the central support staged locally")


if __name__ == "__main__":
    main()
