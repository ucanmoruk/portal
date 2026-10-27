import { isNeonMigrated } from "@/lib/neonMigrationState";

export const dynamic = "force-dynamic";

/** Readiness only; no credentials, table names or business records are exposed. */
export async function GET() {
  try {
    return Response.json({ ready: true, migrationRuntime: 1, storage: await isNeonMigrated() ? "mysql" : "postgres" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ready: false, migrationRuntime: 1 }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
