"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

// Define strict interfaces for report data to ensure type safety when passing from modules
export interface ReportData {
    meta: {
        title: string;
        id: string;
        method: string;
        date: string;
        analyst: string;
    };
    lodData?: {
        components: {
            name: string;
            lod: number;
            loq: number;
            unit: string;
            mean: number;
            stdDev: number;
        }[];
        notes?: string;
    };
    linearityData?: {
        components: {
            name: string;
            slope: number;
            intercept: number;
            rSquared: number;
            equation: string;
            range: string; // e.g., "0.1 - 5.0 mg/L"
        }[];
        notes?: string;
    };
}

interface ValidationReportProps {
    data: ReportData;
}

export function ValidationReport({ data }: ValidationReportProps) {
    const today = new Date().toLocaleDateString('tr-TR');

    return (
        <div className="w-full max-w-[210mm] mx-auto bg-white p-8 print:p-0 print:max-w-none print:shadow-none min-h-[297mm]">
            {/* Header */}
            <div className="border-b-2 border-slate-800 pb-4 mb-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    {/* Placeholder Logo */}
                    <div className="h-16 w-16 bg-slate-900 text-white flex items-center justify-center font-bold text-xl rounded">
                        LAB
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Validasyon Raporu</h1>
                        <p className="text-sm text-slate-500">TS EN ISO/IEC 17025:2017</p>
                    </div>
                </div>
                <div className="text-right text-xs text-slate-500 flex flex-col items-end gap-2">
                    <button
                        onClick={() => window.print()}
                        className="no-print bg-slate-900 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-slate-800 flex items-center gap-2 mb-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Yazdır
                    </button>
                    <div>
                        <p>Rapor No: <span className="font-mono text-slate-900">{data.meta.id}</span></p>
                        <p>Tarih: <span className="font-medium text-slate-900">{today}</span></p>
                    </div>
                </div>
            </div>

            {/* Study Info */}
            <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-8 text-sm">
                <div>
                    <h3 className="text-slate-500 text-xs uppercase font-semibold mb-1">Analiz Adı</h3>
                    <p className="font-medium text-slate-900 border-b border-slate-200 pb-1">{data.meta.title}</p>
                </div>
                <div>
                    <h3 className="text-slate-500 text-xs uppercase font-semibold mb-1">Metot</h3>
                    <p className="font-medium text-slate-900 border-b border-slate-200 pb-1">{data.meta.method}</p>
                </div>
                <div>
                    <h3 className="text-slate-500 text-xs uppercase font-semibold mb-1">Analist</h3>
                    <p className="font-medium text-slate-900 border-b border-slate-200 pb-1">{data.meta.analyst}</p>
                </div>
                <div>
                    <h3 className="text-slate-500 text-xs uppercase font-semibold mb-1">Rapor Durumu</h3>
                    <p className="font-medium text-slate-900 border-b border-slate-200 pb-1">Taslak / Önizleme</p>
                </div>
            </div>

            {/* Content Blocks */}
            <div className="space-y-8">

                {/* LOD / LOQ Section */}
                {data.lodData && data.lodData.components.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            1. LOD & LOQ Çalışması
                        </h2>
                        <div className="rounded border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                                    <tr>
                                        <th className="p-3">Analit</th>
                                        <th className="p-3 text-right">Ortalama</th>
                                        <th className="p-3 text-right">Std. Sapma</th>
                                        <th className="p-3 text-right bg-blue-50 text-blue-900">LOD</th>
                                        <th className="p-3 text-right bg-emerald-50 text-emerald-900">LOQ</th>
                                        <th className="p-3 text-center">Birim</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.lodData.components.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="p-3 font-medium">{item.name}</td>
                                            <td className="p-3 text-right font-mono text-slate-600">{item.mean.toFixed(4)}</td>
                                            <td className="p-3 text-right font-mono text-slate-600">{item.stdDev.toFixed(4)}</td>
                                            <td className="p-3 text-right font-bold text-blue-700 bg-blue-50/30">{item.lod.toFixed(4)}</td>
                                            <td className="p-3 text-right font-bold text-emerald-700 bg-emerald-50/30">{item.loq.toFixed(4)}</td>
                                            <td className="p-3 text-center text-slate-500 text-xs">{item.unit.replace('_', '/')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.lodData.notes && (
                            <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 p-2 rounded border border-dashed">
                                <span className="font-semibold not-italic">Notlar:</span> {data.lodData.notes}
                            </div>
                        )}
                    </section>
                )}

                {/* Linearity Section */}
                {data.linearityData && data.linearityData.components.length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            2. Doğrusallık (Linearity)
                        </h2>
                        <div className="rounded border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                                    <tr>
                                        <th className="p-3">Analit</th>
                                        <th className="p-3">Regresyon Denklemi</th>
                                        <th className="p-3 text-center">R²</th>
                                        <th className="p-3 text-right">Eğim</th>
                                        <th className="p-3 text-right">Kesişim</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.linearityData.components.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="p-3 font-medium">{item.name}</td>
                                            <td className="p-3 font-mono text-xs bg-slate-50">{item.equation}</td>
                                            <td className={`p-3 text-center font-bold ${item.rSquared >= 0.99 ? 'text-green-600' : 'text-amber-600'}`}>
                                                {item.rSquared.toFixed(4)}
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600">{item.slope.toFixed(4)}</td>
                                            <td className="p-3 text-right font-mono text-slate-600">{item.intercept.toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.linearityData.notes && (
                            <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 p-2 rounded border border-dashed">
                                <span className="font-semibold not-italic">Notlar:</span> {data.linearityData.notes}
                            </div>
                        )}
                    </section>
                )}

            </div>

            {/* Footer / Signatures */}
            <div className="mt-20 border-t pt-8 grid grid-cols-2 gap-16 break-inside-avoid">
                <div>
                    <p className="text-xs uppercase font-bold text-slate-500 mb-8">Hazırlayan</p>
                    <div className="h-0.5 w-32 bg-slate-200 mb-2"></div>
                    <p className="font-medium text-slate-900 text-sm">Analist Adı Soyadı</p>
                </div>
                <div>
                    <p className="text-xs uppercase font-bold text-slate-500 mb-8">Kontrol / Onay</p>
                    <div className="h-0.5 w-32 bg-slate-200 mb-2"></div>
                    <p className="font-medium text-slate-900 text-sm">Laboratuvar Sorumlusu</p>
                </div>
            </div>

            {/* Print Only CSS Helper */}
            <style jsx global>{`
                @media print {
                    @page { margin: 10mm; }
                    body { background: white; }
                    /* Hide everything else */
                    nav, aside, header, .no-print { display: none !important; }
                    /* Ensure report is visible */
                    .print-container { width: 100%; max-width: none; margin: 0; padding: 0; }
                }
             `}</style>
        </div>
    );
}
