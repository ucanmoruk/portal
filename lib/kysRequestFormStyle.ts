// Shared by the printable system form and supplier PDF attachment.
export const REQUEST_FORM_CSS = String.raw`
.kys-request-form-page { min-height: 100vh; padding: 24px; background: #f5f5f7; color: #1d1d1f; font-family: Arial, sans-serif; }
.kys-request-form-toolbar { max-width: 820px; margin: 0 auto 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; }
.kys-request-form-toolbar a { color: #0071e3; }
.kys-request-form-printButton { background: #0071e3; color: white; padding: 10px 18px; border: 0; border-radius: 8px; font: inherit; cursor: pointer; }
.kys-request-form-printButton:hover { background: #0077ed; }
.kys-request-form-printButton:focus-visible { outline: 2px solid #0071e3; outline-offset: 3px; }
.kys-request-form-paper { max-width: 820px; margin: auto; padding: 36px; background: #fff; box-shadow: 0 3px 20px #0000000d; }
.kys-request-form-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #0071e3; }
.kys-request-form-header > div { min-width: 0; }
.kys-request-form-logo { width: 200px; height: auto; object-fit: contain; }
.kys-request-form-rootLogo { width: 130px; height: auto; object-fit: contain; }
.kys-request-form-header p { max-width: 350px; font-size: 10px; line-height: 1.5; margin: 7px 0 0; color: #6e6e73; }
.kys-request-form-title { text-align: right; flex-shrink: 0; }
.kys-request-form-title span { font-size: 9px; letter-spacing: 1px; color: #6e6e73; }
.kys-request-form-title h1 { font-size: 26px; margin: 8px 0; }
.kys-request-form-title strong { font-size: 13px; color: #0071e3; }
.kys-request-form-orderMeta { margin: 12px 0 0; font-size: 11px; }
.kys-request-form-orderMeta div { display: flex; justify-content: flex-end; gap: 12px; margin-top: 7px; }
.kys-request-form-orderMeta dt { color: #6e6e73; }
.kys-request-form-orderMeta dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; max-width: 220px; }
.kys-request-form-companyDetails { margin-top: 30px; padding-top: 16px; border-top: 1px solid #d2d2d7; font-size: 11px; line-height: 1.7; break-inside: avoid; }
.kys-request-form-companyDetails p { margin: 4px 0; }
.kys-request-form-companyDetails a { color: inherit; text-decoration: none; }
.kys-request-form-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding: 20px 0; margin: 0; }
.kys-request-form-meta dt { font-size: 10px; color: #6e6e73; margin-bottom: 6px; }
.kys-request-form-meta dd { font-size: 12px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
.kys-request-form-paper h2 { font-size: 13px; font-weight: 700; margin: 18px 0 12px; }
.kys-request-form-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
.kys-request-form-table th { text-align: left; background: #f5f5f7; color: #45454a; font-weight: 600; }
.kys-request-form-table th, .kys-request-form-table td { border: 1px solid #d2d2d7; padding: 10px 7px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.5; }
.kys-request-form-table .kys-request-form-numeric { text-align: right; }
.kys-request-form-notes { margin: 20px 0; }
.kys-request-form-notes p { min-height: 40px; padding: 12px; border: 1px solid #d2d2d7; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.kys-request-form-signatures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 30px; border: 1px solid #d2d2d7; break-inside: avoid; }
.kys-request-form-signatures div { min-height: 95px; padding: 12px; border-right: 1px solid #d2d2d7; }
.kys-request-form-signatures div:last-child { border-right: 0; }
.kys-request-form-signatures span { display: block; font-size: 10px; color: #6e6e73; margin-bottom: 12px; }
.kys-request-form-signatures strong { font-size: 11px; }
.kys-request-form-footer { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #d2d2d7; margin-top: 24px; padding-top: 12px; font-size: 9px; color: #6e6e73; }
@media (max-width: 600px) { .kys-request-form-page { padding: 12px; } .kys-request-form-paper { padding: 18px; } .kys-request-form-header { gap: 12px; } .kys-request-form-logo { width: 140px; } .kys-request-form-title h1 { font-size: 21px; } .kys-request-form-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@page { size: A4; margin: 14mm 14mm 22mm; }
@media print {
  .kys-request-form-page { min-height: 0; padding: 0; background: white; }
  .kys-request-form-toolbar { display: none; }
  .kys-request-form-paper { max-width: none; padding: 0; margin: 0; box-shadow: none; }
  .kys-request-form-header, .kys-request-form-meta, .kys-request-form-footer { break-inside: avoid; }
  .kys-request-form-table thead { display: table-header-group; }
  .kys-request-form-table tr { break-inside: avoid; }
  .kys-request-form-table th { print-color-adjust: exact; }
}

.kys-request-form-pageNumber::after { content: "1"; }
@media print { .kys-request-form-footer { display:none; } .kys-request-form-pageNumber { display: none; } .kys-request-form-paper { padding-bottom: 0; } }
@page { @bottom-right { content: "Sayfa " counter(page); font-family: Arial, sans-serif; font-size: 9px; color: #6e6e73; } }
`;
