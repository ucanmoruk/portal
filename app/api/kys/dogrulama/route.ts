import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
import { startVerification, verificationJob } from "@/lib/kysVerificationRunner";
export async function GET() {
 const access = await workspaceAccess("yazilim-dogrulama");
 if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
 if (!access.view) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
 return Response.json(verificationJob());
}
export async function POST() {
 const access = await workspaceAccess("yazilim-dogrulama");
 if (!access) return Response.json({ error: "Oturum açın." }, { status: 401 });
 if (!access.edit) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
 return Response.json(startVerification(), { status: 202 });
}
