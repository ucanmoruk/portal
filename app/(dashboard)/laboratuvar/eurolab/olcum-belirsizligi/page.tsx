import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Ölçüm Belirsizliği" };

export default function UncertaintyPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ölçüm Belirsizliği</h1>
          <p className="text-slate-500">Analiz metotları için ölçüm belirsizliği hesaplamaları.</p>
        </div>
      </div>
      <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm text-center">
        <p className="text-slate-500">Ölçüm belirsizliği modülü yakında eklenecektir.</p>
      </div>
    </div>
  );
}
