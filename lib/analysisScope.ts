import { AsyncLocalStorage } from "node:async_hooks";
const scope = new AsyncLocalStorage<"unique">();
export const inUniqueAnalysis = () => scope.getStore() === "unique";
export const withUniqueAnalysis = <T>(run: () => Promise<T>) => scope.run("unique", run);
export function scopedAnalysisSql(sql: string) { return inUniqueAnalysis() ? sql.replace(/\beurolab_/g, "unique_") : sql; }
