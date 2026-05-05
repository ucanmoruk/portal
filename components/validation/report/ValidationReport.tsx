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
    moduleData?: Record<string, Record<string, any>>;
}

interface ValidationReportProps {
    data: ReportData;
}

export function ValidationReport({ data }: ValidationReportProps) {
    const today = new Date().toLocaleDateString('tr-TR');
    const moduleData = data.moduleData || {};
    const numberValue = (value: any, digits = 4) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
    const textValue = (value: any) => String(value ?? "-");

    const renderSmallTable = (headers: string[], rows: Array<Array<React.ReactNode>>, keyPrefix: string) => (
        <div className="rounded border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                    <tr>{headers.map(header => <th key={`${keyPrefix}-${header}`} className="p-2">{header}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.length > 0 ? rows.map((row, rowIndex) => (
                        <tr key={`${keyPrefix}-row-${rowIndex}`}>
                            {row.map((cell, cellIndex) => <td key={`${keyPrefix}-${rowIndex}-${cellIndex}`} className="p-2">{cell}</td>)}
                        </tr>
                    )) : (
                        <tr><td colSpan={headers.length} className="p-3 text-center text-slate-400">Kayıtlı veri bulunamadı.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );

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

                {moduleData.PRECISION_REPEATABILITY && Object.keys(moduleData.PRECISION_REPEATABILITY).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            3. Kesinlik (Tekrarlanabilirlik)
                        </h2>
                        <div className="space-y-4">
                            {Object.entries(moduleData.PRECISION_REPEATABILITY).map(([component, item]: [string, any]) => (
                                <div key={`repeatability-${component}`} className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-800">{component}</h3>
                                    <div className="text-xs text-slate-500">Birim: {textValue(item.unitLabel || item.unit)} | Paralel: {textValue(item.parallelCount)} | Düzey: {textValue(item.levelCount)}</div>
                                    {item.notes && <p className="text-xs italic text-slate-500">{item.notes}</p>}
                                    {(item.levels || []).map((level: any) => (
                                        <div key={`${component}-${level.key}`} className="rounded border border-slate-200 p-3">
                                            <div className="mb-2 text-xs font-bold text-slate-700">
                                                {level.label} | Matriks: {textValue(level.matrix)} | Hedef: {textValue(level.target)} | RSDpool: {numberValue(level.pooledRsd)}
                                            </div>
                                            {renderSmallTable(
                                                ["Analist", "Xort", "Std Sapma", "n", "RSDr", "r:2,83*Sr"],
                                                Object.entries(level.analysts || {}).map(([analyst, stat]: [string, any]) => [
                                                    analyst,
                                                    numberValue(stat.mean, 3),
                                                    numberValue(stat.stdDev, 3),
                                                    textValue(stat.n),
                                                    numberValue(stat.rsdr, 4),
                                                    numberValue(stat.repeatabilityLimit, 3),
                                                ]),
                                                `repeatability-${component}-${level.key}`
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {moduleData.TRUENESS && Object.keys(moduleData.TRUENESS).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            4. Gerçeklik (Bias / Geri Kazanım)
                        </h2>
                        <div className="space-y-4">
                            {Object.entries(moduleData.TRUENESS).map(([component, item]: [string, any]) => (
                                <div key={`trueness-${component}`} className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-800">{component}</h3>
                                    <div className="text-xs text-slate-500">Matriks: {textValue(item.matrix)} | Hedef: {textValue(item.target)} | Birim: {textValue(item.unitLabel || item.unit)}</div>
                                    {item.notes && <p className="text-xs italic text-slate-500">{item.notes}</p>}
                                    {renderSmallTable(
                                        ["#", ...(item.analysts || []).flatMap((analyst: string) => [`${analyst} Değer`, `${analyst} Geri Kazanım %`, `${analyst} Sonuç`])],
                                        (item.rows || []).map((row: string[], rowIndex: number) => [
                                            rowIndex + 1,
                                            ...(item.analysts || []).flatMap((analyst: string, analystIndex: number) => {
                                                const recovery = item.results?.[analyst]?.recoveries?.[rowIndex];
                                                return [
                                                    textValue(row?.[analystIndex]),
                                                    numberValue(recovery?.recovery, 3),
                                                    recovery?.isSuitable == null ? "-" : recovery.isSuitable ? "Uygun" : "Uygun Değil",
                                                ];
                                            }),
                                        ]),
                                        `trueness-${component}`
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {moduleData.PRECISION_REPRODUCIBILITY && Object.keys(moduleData.PRECISION_REPRODUCIBILITY).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            5. Kesinlik (Tekrarüretilebilirlik)
                        </h2>
                        <div className="space-y-4">
                            {Object.entries(moduleData.PRECISION_REPRODUCIBILITY).map(([component, item]: [string, any]) => (
                                <div key={`reproducibility-${component}`} className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-800">{component}</h3>
                                    <div className="text-xs text-slate-500">Birim: {textValue(item.unitLabel || item.unit)} | Çalışma günü: {textValue(item.parallelCount)}</div>
                                    {item.notes && <p className="text-xs italic text-slate-500">{item.notes}</p>}
                                    {renderSmallTable(
                                        ["#", "Tarih", ...(item.analysts || []).map((analyst: string) => analyst)],
                                        (item.rows || []).map((row: any, rowIndex: number) => [
                                            rowIndex + 1,
                                            textValue(row.date),
                                            ...(row.values || []).map((value: string) => textValue(value)),
                                        ]),
                                        `reproducibility-${component}`
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {moduleData.LOD_LOQ && Object.keys(moduleData.LOD_LOQ).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            6. LOD / LOQ Ham Veri
                        </h2>
                        <div className="space-y-4">
                            {Object.entries(moduleData.LOD_LOQ).map(([component, item]: [string, any]) => (
                                <div key={`lod-raw-${component}`} className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-800">{component}</h3>
                                    {renderSmallTable(
                                        ["#", ...((item.rows?.[0] || []).map((_: string, index: number) => `Veri ${index + 1}`))],
                                        (item.rows || []).map((row: string[], rowIndex: number) => [rowIndex + 1, ...row.map(value => textValue(value))]),
                                        `lod-raw-${component}`
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {moduleData.LINEARITY && Object.keys(moduleData.LINEARITY).length > 0 && (
                    <section className="break-inside-avoid">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2 border-l-4 border-blue-600 pl-3">
                            7. Doğrusallık Ham Veri ve İstatistik
                        </h2>
                        <div className="space-y-4">
                            {Object.entries(moduleData.LINEARITY).map(([component, item]: [string, any]) => (
                                <div key={`linearity-raw-${component}`} className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-800">{component}</h3>
                                    {renderSmallTable(
                                        ["Düzey", "Konsantrasyon", "Yanıt"],
                                        (item.rows || []).flatMap((row: any) => (row.concentrations || []).map((conc: string, index: number) => [
                                            row.level,
                                            textValue(conc),
                                            textValue(row.responses?.[index]),
                                        ])),
                                        `linearity-raw-${component}`
                                    )}
                                    {item.statistics && renderSmallTable(
                                        ["İstatistik", "Değer"],
                                        [
                                            ["Kesim", numberValue(item.statistics.intercept)],
                                            ["Eğim", numberValue(item.statistics.slope)],
                                            ["Std Sapma", numberValue(item.statistics.standardDeviation)],
                                            ["Co", numberValue(item.statistics.co)],
                                            ["Cort", numberValue(item.statistics.cort)],
                                            ["U(Co)", numberValue(item.statistics.uCo)],
                                            ["RSD U(Co) (%)", numberValue(item.statistics.rsdUCo)],
                                        ],
                                        `linearity-stat-${component}`
                                    )}
                                </div>
                            ))}
                        </div>
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
