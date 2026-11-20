"""Add Dalvik bytecode to the APK linked by AAPT2."""
from pathlib import Path
import sys
from zipfile import ZipFile

apk, dex = map(Path, sys.argv[1:])
with ZipFile(apk, "a") as package:
    package.write(dex, "classes.dex")
