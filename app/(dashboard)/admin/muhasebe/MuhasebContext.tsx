"use client";

import React, {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from "react";

// ── Config ──────────────────────────────────────────────────────────────────
export const SPREADSHEET_ID = "1jMJO0KshGPE9A9QH4T2IIt0BE2k4wHqx9FqOpm35NF8";
export const CLIENT_ID      = "53817252451-glkpa07pfsacafmap4rajdv3u2av943q.apps.googleusercontent.com";
const SCOPES      = "https://www.googleapis.com/auth/spreadsheets";
const LOGIN_HINT  = "rootaimanager@gmail.com";

export const SHEETS = [
  { name: "R.Kozmetik", label: "R.Kozmetik",      type: "kurumsal",  color: "#3b82f6" },
  { name: "R.Analitik", label: "R.Analitik",      type: "kurumsal",  color: "#8b5cf6" },
  { name: "Spektrotek",  label: "Spektrotek",      type: "kurumsal",  color: "#06b6d4" },
  { name: "Wennes",      label: "Wennes",          type: "kurumsal",  color: "#f59e0b" },
  { name: "O.E.",        label: "O.E. (Bireysel)", type: "bireysel",  color: "#ec4899" },
] as const;

export const CATEGORIES = [
  "Kira","Aidat","Elektrik","Su","Doğalgaz","İnternet","Şirket Hattı",
  "Maaş","KDV","Gelir Vergisi","Stopaj","SGK","Abonelikler",
  "Kargo","Satın Alım","Bilişim","Kredi",
];

export const MONTHS = [
  "Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık",
];

export const PAYMENT_METHODS = [
  "Havale / EFT","Kredi Kartı","Nakit","Çek","Otomatik Ödeme","Diğer",
];

export const YEARS = ["2024","2025","2026","2027","2028","2029","2030"];
export const DEFAULT_YEAR = "2026";

// ── Helpers ──────────────────────────────────────────────────────────────────
export function parseAmount(val: string | undefined): number {
  if (!val || val === "-") return 0;
  const s = String(val).replace(/\s*TRY\s*/g,"").replace(/\s*₺\s*/g,"").trim();
  return parseFloat(s.replace(/\./g,"").replace(",",".")) || 0;
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) + " ₺";
}

export function fmtAmount(val: string | undefined): string {
  if (!val || val === "-") return "—";
  const n = parseAmount(val);
  return fmtNum(n);
}

export interface SheetRow {
  index:      number;
  sheet:      string;
  sheetColor: string;
  sheetLabel: string;
  kategori:   string;
  gun:        string;
  ay:         string;
  tutar:      string;
  odemeT:     string;
  odemeSekli: string;
  aciklama:   string;
  durum:      string;
  yil:        string;
}

export function getAllRows(data: Record<string, string[][]>): SheetRow[] {
  const all: SheetRow[] = [];
  SHEETS.forEach(sh => {
    (data[sh.name] || []).forEach((row, i) => {
      if (!row[0]) return;
      all.push({
        index: i, sheet: sh.name, sheetColor: sh.color, sheetLabel: sh.label,
        kategori:   row[0] || "",
        gun:        row[1] || "",
        ay:         row[2] || "",
        tutar:      row[3] || "",
        odemeT:     row[4] || "",
        odemeSekli: row[5] || "",
        aciklama:   row[6] || "",
        durum:      row[7] || "Ödeme Bekliyor",
        yil:        row[9] || DEFAULT_YEAR,
      });
    });
  });
  return all;
}

// ── Context types ─────────────────────────────────────────────────────────────
interface MuhasebContextType {
  accessToken: string | null;
  data:        Record<string, string[][]>;
  sheetMeta:   Record<string, number>;
  loading:     boolean;
  signIn:      () => void;
  doSignOut:   () => void;
  loadAll:     () => Promise<void>;
  apiAddRow:    (sheet: string, row: string[])                   => Promise<void>;
  apiUpdateRow: (sheet: string, idx: number, row: string[])      => Promise<void>;
  apiDeleteRow: (sheet: string, idx: number)                     => Promise<void>;
  toast:        (msg: string, type?: "info"|"success"|"error")   => void;
}

const MuhasebContext = createContext<MuhasebContextType | null>(null);

export function useMuhaseb() {
  const ctx = useContext(MuhasebContext);
  if (!ctx) throw new Error("useMuhaseb must be used within MuhasebProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
interface ToastItem { msg: string; type: string; key: number; }

export function MuhasebProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [data,        setData]        = useState<Record<string, string[][]>>({});
  const [sheetMeta,   setSheetMeta]   = useState<Record<string, number>>({});
  const [loading,     setLoading]     = useState(false);
  const [toasts,      setToasts]      = useState<ToastItem[]>([]);

  const tokenClientRef = useRef<any>(null);
  const tokenRef       = useRef<string | null>(null);
  const loadedRef      = useRef(false);

  const toast = useCallback((msg: string, type: "info"|"success"|"error" = "info") => {
    const key = Date.now();
    setToasts(p => [...p, { msg, type, key }]);
    setTimeout(() => setToasts(p => p.filter(t => t.key !== key)), 3000);
  }, []);

  // Keep ref in sync for the API closure
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  // ── Sheets API wrapper ──
  const callApi = useCallback(async (
    path: string, opts: RequestInit = {}, _retry = false,
  ): Promise<any> => {
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`,
      {
        ...opts,
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
          ...((opts.headers as Record<string,string>) || {}),
        },
      },
    );
    if (r.status === 401 && !_retry) {
      // silent token refresh
      await new Promise<void>((res, rej) => {
        if (!tokenClientRef.current) { rej(new Error("No tokenClient")); return; }
        const prev = tokenClientRef.current.callback;
        tokenClientRef.current.callback = (resp: any) => {
          tokenClientRef.current.callback = prev;
          if (resp.error) { rej(new Error(resp.error)); return; }
          tokenRef.current = resp.access_token;
          setAccessToken(resp.access_token);
          res();
        };
        tokenClientRef.current.requestAccessToken({ prompt: "" });
      });
      return callApi(path, opts, true);
    }
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || "API hatası"); }
    return r.json();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const meta = await callApi("");
      const newMeta: Record<string, number> = {};
      meta.sheets.forEach((s: any) => { newMeta[s.properties.title] = s.properties.sheetId; });
      setSheetMeta(newMeta);

      const ranges = SHEETS.map(s => `'${s.name}'!A1:J2000`);
      const enc    = ranges.map(r => encodeURIComponent(r)).join("&ranges=");
      const batch  = await callApi(`/values:batchGet?ranges=${enc}`);
      const newData: Record<string, string[][]> = {};
      SHEETS.forEach((sh, i) => {
        newData[sh.name] = ((batch.valueRanges[i].values || []) as string[][]).slice(1);
      });
      setData(newData);
    } catch (e: any) {
      toast("Veri yüklenemedi: " + e.message, "error");
    }
    setLoading(false);
  }, [callApi, toast]);

  const apiAddRow = useCallback(async (sheetName: string, rowData: string[]) => {
    await callApi(
      `/values/'${encodeURIComponent(sheetName)}'!A:J:append?valueInputOption=USER_ENTERED`,
      { method: "POST", body: JSON.stringify({ values: [rowData] }) },
    );
  }, [callApi]);

  const apiUpdateRow = useCallback(async (sheetName: string, rowIndex: number, rowData: string[]) => {
    const r = rowIndex + 2;
    await callApi(
      `/values/'${encodeURIComponent(sheetName)}'!A${r}:J${r}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [rowData] }) },
    );
  }, [callApi]);

  const apiDeleteRow = useCallback(async (sheetName: string, rowIndex: number) => {
    const sheetId = sheetMeta[sheetName];
    if (sheetId === undefined) throw new Error("Sheet ID bulunamadı");
    await callApi(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ deleteDimension: {
        range: { sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 },
      }}]}),
    });
  }, [callApi, sheetMeta]);

  const initAuth = useCallback(() => {
    const gsi = (window as any).google?.accounts?.oauth2;
    if (!gsi) return;
    tokenClientRef.current = gsi.initTokenClient({
      client_id:  CLIENT_ID,
      scope:      SCOPES,
      login_hint: LOGIN_HINT,
      callback:   (resp: any) => {
        if (resp.error) { toast("Google girişi başarısız: " + resp.error, "error"); return; }
        tokenRef.current = resp.access_token;
        setAccessToken(resp.access_token);
      },
    });
  }, [toast]);

  const signIn = useCallback(() => {
    if (!tokenClientRef.current) initAuth();
    tokenClientRef.current?.requestAccessToken({ prompt: "" });
  }, [initAuth]);

  const doSignOut = useCallback(() => {
    const token = tokenRef.current;
    if (token) (window as any).google?.accounts?.oauth2?.revoke(token, () => {});
    tokenRef.current = null;
    setAccessToken(null);
    setData({});
    setSheetMeta({});
    loadedRef.current = false;
  }, []);

  // Poll for GSI then auto-sign-in (no local login needed)
  useEffect(() => {
    let tries = 0;
    const check = setInterval(() => {
      tries++;
      if ((window as any).google?.accounts?.oauth2) {
        clearInterval(check);
        initAuth();
        setTimeout(() => {
          tokenClientRef.current?.requestAccessToken({ prompt: "" });
        }, 200);
      }
      if (tries > 150) clearInterval(check);
    }, 100);
    return () => clearInterval(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data once after token arrives
  useEffect(() => {
    if (accessToken && !loadedRef.current) {
      loadedRef.current = true;
      loadAll();
    }
  }, [accessToken, loadAll]);

  return (
    <MuhasebContext.Provider value={{
      accessToken, data, sheetMeta, loading,
      signIn, doSignOut, loadAll,
      apiAddRow, apiUpdateRow, apiDeleteRow,
      toast,
    }}>
      {children}

      {/* Toast stack */}
      <div style={{
        position: "fixed", bottom: 24, right: 24,
        display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, pointerEvents: "none",
      }}>
        {toasts.map(t => (
          <div key={t.key} style={{
            padding: "11px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,.2)",
            background: t.type === "success" ? "#059669" : t.type === "error" ? "#dc2626" : "#1e293b",
            color: "#fff",
          }}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✗" : "ℹ"}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </MuhasebContext.Provider>
  );
}
