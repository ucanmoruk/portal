/** Expressions are fixed SQL from the route; search values remain bound parameters. */
export function numuneSearchLike(expression: string, mysql: boolean): string {
  if (!mysql) return `LOWER(${expression}) LIKE LOWER(@searchLike)`;
  // Legacy columns can be latin1 while the connection and parameters are utf8mb4.
  // Convert before comparison; COLLATE alone cannot change a column's charset.
  return `(CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_turkish_ci) LIKE (CONVERT(@searchLike USING utf8mb4) COLLATE utf8mb4_turkish_ci)`;
}
