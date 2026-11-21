"""Create the offline single-file version of the local Vite build."""
from pathlib import Path
import re


root = Path(__file__).resolve().parent
dist = root / "dist"
output = root / "deliverables"
output.mkdir(exist_ok=True)
html = (dist / "index.html").read_text(encoding="utf-8")


def replace_script(match):
    script = (dist / match[1]).read_text(encoding="utf-8")
    assert script.count("data:image/svg+xml") >= 52, "Build with --assetsInlineLimit 250000"
    script = re.sub(r"</script", lambda m: "<\\/" + m[0][2:], script, flags=re.IGNORECASE)
    return '<script type="module">\n' + script + "\n</script>"


def replace_css(match):
    css = (dist / match[1]).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"


html, js_count = re.subn(r'<script type="module" crossorigin src="(\./[^"]+)"></script>', replace_script, html)
html, css_count = re.subn(r'<link rel="stylesheet" crossorigin href="(\./[^"]+)">', replace_css, html)
assert js_count == css_count == 1
(output / "QRoker-Web.html").write_text(html, encoding="utf-8")
print("Built offline QRoker-Web.html")
