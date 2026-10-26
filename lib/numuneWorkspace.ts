export type NumuneWorkspace = "laboratuvar" | "root";

export function workspaceGroups(workspace: NumuneWorkspace): readonly string[] {
  return workspace === "root" ? ["K.D.", "Belge"] : ["Özel"];
}

/** Fixed SQL fragments only; request values are never interpolated into SQL. */
export function numuneWorkspaceSql(request: Request, alias = "n"): string {
  const root = new URL(request.url).searchParams.get("workspace") === "root";
  return `LTRIM(RTRIM(${alias}.Grup)) IN (${root ? "N'K.D.', N'Belge'" : "N'Özel'"})`;
}

export function groupMatchesWorkspace(request: Request, group: unknown): boolean {
  const workspace = new URL(request.url).searchParams.get("workspace") === "root" ? "root" : "laboratuvar";
  return workspaceGroups(workspace).includes(String(group ?? "").trim());
}

type WorkspacePool = {
  request: () => {
    input: (name: string, value: number) => {
      query: (sql: string) => Promise<{ recordset: unknown[] }>;
    };
  };
};

export async function checkNumuneWorkspace(pool: WorkspacePool, request: Request, id: number): Promise<Response | null> {
  // Older integrations without a workspace keep their existing detail links.
  if (!new URL(request.url).searchParams.has("workspace")) return null;
  const result = await pool.request().input("workspaceNkrId", id).query(
    `SELECT n.ID FROM NKR n WHERE n.ID = @workspaceNkrId AND ${numuneWorkspaceSql(request)}`,
  );
  return result.recordset.length ? null : Response.json({ error: "Numune bu çalışma alanında bulunamadı." }, { status: 404 });
}
