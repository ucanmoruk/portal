param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$wordConverter = $null
$wordDocument = $null
try {
  $wordConverter = New-Object -ComObject Word.Application
  $wordConverter.Visible = $false
  $wordConverter.DisplayAlerts = 0
  $wordConverter.AutomationSecurity = 3 # Never run uploaded document macros.
  $wordConverter.Options.UpdateLinksAtOpen = $false
  $wordDocument = $wordConverter.Documents.Open($InputPath, $false, $true, $false)
  # Word's native PDF exporter preserves page setup, fonts, tables, headers and drawings.
  # Read-only source, no custom header/footer, no HTML conversion, no source save.
  $wordDocument.ExportAsFixedFormat($OutputPath, 17)
} finally {
  if ($null -ne $wordDocument) {
    $wordDocument.Close(0)
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordDocument)
  }
  if ($null -ne $wordConverter) {
    $wordConverter.Quit(0)
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordConverter)
  }
}
