// Approval records can belong to either language; workflow tabs use the base format.
// Keep language-specific report/annex records separate outside workflow matching.
export function approvalFormatSql(normalizedExpression: string): string {
  return `CASE ${normalizedExpression}
    WHEN N'GENELEN' THEN N'GENEL'
    WHEN N'CHALLENGEEN' THEN N'CHALLENGE'
    WHEN N'STABILITEEN' THEN N'STABILITE'
    WHEN N'DIGEREN' THEN N'DIGER'
    ELSE ${normalizedExpression} END`;
}
