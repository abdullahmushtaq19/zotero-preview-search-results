import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dest = root / "build" / "preview-search-results.xpi"
dest.parent.mkdir(parents=True, exist_ok=True)
files = [
    "manifest.json",
    "bootstrap.js",
    "content/snippets.js",
    "content/passageSearch.js",
    "content/style.css",
]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(dest)
print(dest.stat().st_size)
