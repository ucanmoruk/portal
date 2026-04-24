"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, MoreHorizontal, ArrowUpRight } from "lucide-react";
import styles from '@/app/styles/table.module.css';

// Mock Data for Calibration Curve
const calibrationData = [
  { concentration: 0, response: 5 },
  { concentration: 10, response: 15 },
  { concentration: 20, response: 26 },
  { concentration: 30, response: 38 },
  { concentration: 40, response: 49 },
  { concentration: 50, response: 59 },
  { concentration: 60, response: 72 },
  { concentration: 70, response: 84 },
  { concentration: 80, response: 93 },
];

const recentResults = [
  { id: "30000001", method: "HPLC Method A", analyst: "SciAnalytics", result: "60.3 ng/L", status: "Approved", date: "23.03.2023" },
  { id: "30000002", method: "GC-MS Method B", analyst: "Mar May", result: "Pending", status: "Under Review", date: "28.08.2023" },
  { id: "30000003", method: "GC-MS Method C", analyst: "Jarak Katirett", result: "0.01 mg/L", status: "Under Review", date: "28.08.2023" },
  { id: "30000004", method: "HPLC Method D", analyst: "Dieve Rath", result: "Failed", status: "Failed", date: "28.08.2023" },
  { id: "30000005", method: "GC-MS Method E", analyst: "SciAnalytics", result: "<0.273 mM", status: "Failed", date: "28.08.2023" },
];

export default function ValidationDashboard() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Validasyon Kontrol Paneli</h1>
          <p className={styles.pageSubtitle}>Laboratuvar validasyon aktivitelerine genel bakış.</p>
        </div>
        <div className={styles.toolbarRight}>
          <Link href="/laboratuvar/eurolab/metotlar">
            <button className={styles.addBtn}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              Yeni Validasyon
            </button>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {/* Active Validations Widgets */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">HPLC Method A</CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">Devam Ediyor</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">%85</div>
              <p className="text-xs text-slate-500">Doğrusallık & Kesinlik tamamlandı</p>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: "85%" }}></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white shadow-sm border-emerald-100 bg-emerald-50/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">GC-MS Method B</CardTitle>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700">Tamamlandı</div>
              <p className="text-xs text-emerald-600/80">İnceleme için hazır</p>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: "100%" }}></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">ICP-OES Method C</CardTitle>
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Beklemede</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">%12</div>
              <p className="text-xs text-slate-500">Onay bekleniyor</p>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-orange-400" style={{ width: "12%" }}></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 md:grid-cols-1">
          <Card className="col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Kalibrasyon Eğrisi</CardTitle>
                <CardDescription>Bileşik X - Doğrusallık Değerlendirmesi (R² = 0.9987)</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="hidden h-8 lg:flex">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Detayları Gör
              </Button>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={calibrationData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="concentration"
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: 'Konsantrasyon (ppm)', position: 'insideBottom', offset: -5, fontSize: 12, fill: '#64748b' }}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: 'Yanıt', angle: -90, position: 'insideLeft', fill: '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="response"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: 'white', stroke: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Results Table */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-1">
              <CardTitle>Son Analiz Sonuçları</CardTitle>
              <CardDescription>Laboratuvardan gelen onaylanmış veya bekleyen en son sonuçlar.</CardDescription>
            </div>
            <Button className="ml-auto" size="icon" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numune ID</TableHead>
                  <TableHead>Metot</TableHead>
                  <TableHead>Analist</TableHead>
                  <TableHead>Sonuç</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentResults.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell className="font-medium">{result.id}</TableCell>
                    <TableCell>{result.method}</TableCell>
                    <TableCell>{result.analyst}</TableCell>
                    <TableCell>{result.result}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          result.status === 'Approved' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' :
                            result.status === 'Under Review' ? 'bg-teal-100 text-teal-700 hover:bg-teal-100' :
                              'bg-slate-100 text-slate-600 hover:bg-slate-100' // Fail/Other
                        }
                      >
                        {result.status === 'Approved' ? 'Onaylandı' :
                          result.status === 'Under Review' ? 'İnceleniyor' :
                            result.status === 'Failed' ? 'Başarısız' : result.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{result.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
