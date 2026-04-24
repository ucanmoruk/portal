import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Raporlar" };

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Raporlar</h1>
          <p className="text-slate-500">Validasyon ve analiz raporları.</p>
        </div>
      </div>
      <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm text-center">
        <p className="text-slate-500">Raporlar modülü yakında eklenecektir.</p>
      </div>
    </div>
  );
}
