import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RaporTakipTable from "./RaporTakipTable";

export const metadata = {
  title: "Rapor Takip — ÜGD Portal",
};

export default async function RaporTakipPage() {
  const session = await getServerSession(authOptions);
  
  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ marginBottom: "20px", fontSize: "1.5rem", fontWeight: 700 }}>
        Rapor Takip
      </h1>
      <RaporTakipTable />
    </div>
  );
}
