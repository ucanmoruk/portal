import { notFound, redirect } from "next/navigation";
import { workspaceAccess } from "@/lib/kysWorkspaceAccess";
import { listWorkspaceRecords } from "@/lib/kysWorkspaceStore";
import DeviceLabel from "@/components/kys-workspace/DeviceLabel";
export const metadata = { title: "Cihaz Etiketi" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const access = await workspaceAccess("cihaz-listesi");
 if (!access) redirect("/login"); if (!access.view) notFound();
 const { id } = await params;
 const device = (await listWorkspaceRecords("cihaz-listesi")).find(row => row.id === id);
 if (!device) notFound();
 const calibrationAccess = await workspaceAccess("kalibrasyon-kontrol");
 const calibration = calibrationAccess?.view ? (await listWorkspaceRecords("kalibrasyon-kontrol")).filter(row => row.data.deviceId === id && row.status === "Uygun" && row.data.kind === "Kalibrasyon").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""))[0] : undefined;
 return <DeviceLabel device={device} calibration={calibration} />;
}
