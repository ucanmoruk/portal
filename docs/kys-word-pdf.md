# KYS Word form PDFs

Uploaded Word forms remain in `KysDokumanDosya`. Their PDF derivatives are stored separately in `KysDokumanPdf`, with the source SHA-256, conversion engine and creation date. Approval status, revision metadata and original bytes are unchanged. Replacing a source invalidates its cached PDF through the SHA-256 comparison.

Conversion uses Microsoft Word's native PDF exporter on Windows, opening the source read-only with document macros and external link updates disabled. It does not recreate the form as HTML or add portal headers. PowerShell 7 (`pwsh.exe`) and Microsoft Word must be installed on the conversion host. `KYS_WORD_POWERSHELL` can specify the PowerShell executable.

Run `node scripts/convert-kys-form-pdfs.cjs` against the local server on port 1038 to prepare existing Word forms. It saves PDF derivatives in the shared database, checks original hashes, and creates a local manifest in `outputs/kys-form-pdf-2026-10-26`. The prepared PDFs can then be served on Linux/serverless hosts without Word. New or changed Word files must be converted on the Windows host before they can be previewed on a host without Word; unsupported hosts return an explicit error instead of a layout-changing fallback.

Opening `/api/kys/dokumanlar/:id/dosya` for a PDF or Word form goes to its preview. `?download=1` explicitly retrieves the untouched original. `/api/kys/dokumanlar/:id/pdf` serves the PDF derivative (or the uploaded PDF bytes); `?download=1` marks it as an attachment. The preview renders pages with the matching PDF.js engine and worker from the authenticated local asset route and downloads the exact displayed blob.

Verification: `scripts/verify-kys-pdfs.py` checks source/PDF hashes, PDF page dimensions against DOCX section settings, and source paragraph text against extracted PDF text. It renders every page with Poppler and creates contact sheets for visual review. Use the bundled Python runtime with pypdf and Pillow and the bundled Poppler path configured in that script.
