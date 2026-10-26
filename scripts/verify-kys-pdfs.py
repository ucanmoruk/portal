"""Read-only PDF QA: source hashes, page setup, content and rendered contact sheets."""
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path("outputs/kys-form-pdf-2026-10-26")
qa = root / "qa"
qa.mkdir(exist_ok=True)
records = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
word_ns = "{" + namespace["w"] + "}"
normalize = lambda text: re.sub(r"[^\w]", "", text.casefold(), flags=re.UNICODE)
poppler = Path(r"C:\Users\dazzl\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe")
report = []
images = []
for record in records:
    source = Path(record["sourcePath"])
    pdf_path = Path(record["pdfPath"])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == record["sourceSha"]
    assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == record["pdfSha"]
    reader = PdfReader(pdf_path)
    assert reader.pages, record["code"]
    pdf_text = normalize(" ".join(page.extract_text() or "" for page in reader.pages))
    assert pdf_text, record["code"]
    with ZipFile(source) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        dimensions = [(float(node.attrib[word_ns + "w"]) / 20, float(node.attrib[word_ns + "h"]) / 20)
                      for node in document.findall(".//w:pgSz", namespace)]
        # Use only visible text nodes, excluding field instructions.
        paragraphs = []
        for name in archive.namelist():
            if name == "word/document.xml" or re.match(r"word/(?:header|footer)\d+\.xml$", name):
                xml = ET.fromstring(archive.read(name))
                paragraphs.extend("".join(t.text or "" for t in node.findall(".//w:t", namespace)) for node in xml.findall(".//w:p", namespace))
    missing = [text for text in paragraphs if len(normalize(text)) > 5 and normalize(text) not in pdf_text]
    page_sizes = []
    for number, page in enumerate(reader.pages, 1):
        size = (float(page.mediabox.width), float(page.mediabox.height))
        assert any(abs(size[0] - width) < 2 and abs(size[1] - height) < 2 for width, height in dimensions), (record["code"], size, dimensions)
        page_sizes.append(size)
        prefix = qa / f"{record['id']}-page-{number}"
        image_path = prefix.with_suffix(".png")
        if not image_path.exists():
            subprocess.run([str(poppler), "-f", str(number), "-l", str(number), "-singlefile", "-png", "-scale-to", "1100", str(pdf_path), str(prefix)], check=True, capture_output=True)
        images.append((record["code"], number, image_path))
    report.append({"code": record["code"], "pages": len(reader.pages), "pageSizes": page_sizes, "missingParagraphs": missing})

for batch in range(0, len(images), 8):
    sheet = Image.new("RGB", (1800, 1320), "#dfe4eb")
    draw = ImageDraw.Draw(sheet)
    for index, (code, page, image_path) in enumerate(images[batch:batch + 8]):
        x, y = (index % 4) * 450, (index // 4) * 660
        draw.text((x + 10, y + 8), f"{code} / {page}", fill="black")
        with Image.open(image_path) as image:
            image.thumbnail((430, 620))
            sheet.paste(image, (x + (450 - image.width) // 2, y + 30))
    sheet.save(qa / f"contact-{batch // 8 + 1}.jpg", quality=92)
(qa / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"documents": len(records), "pages": len(images), "needsTextReview": [{"code": r["code"], "missing": r["missingParagraphs"]} for r in report if r["missingParagraphs"]]}, ensure_ascii=False))
