"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ClipboardCheck, ListChecks, PackageSearch, Ruler, Search, Shapes, Users, X } from "lucide-react";
import HamveriPrintReport from "./HamveriPrintReport";

type StepKey = "identity" | "age" | "type" | "tests" | "records";
type AgeGroup = "under36" | "over36" | "";
type TestDecision = "Bekliyor" | "Geçti" | "Kaldı" | "N/A";

interface TestRow {
  id: string;
  source: "Zorunlu" | "Koşullu" | "Harici";
  group: string;
  title: string;
  clause: string;
  method: string;
  reason: string;
}

interface RecordRow {
  measuredValue: string;
  decision: TestDecision;
  observation: string;
}

interface RawdataDetail {
  id: number;
  code: string;
  sample_name: string;
  product_data: Partial<FormState>;
  test_data: {
    selectedTests?: TestRow[];
    records?: Record<string, RecordRow>;
  };
}

type InstructionRow = {
  id: number;
  clause: string;
  method: string;
  title: string | null;
};

type RequirementVisualRow = {
  id: number;
  clause: string;
  title: string | null;
};

type ManualTestFormState = {
  selectedId: string;
  methodIds: string[];
  reason: string;
};

const steps: Array<{ key: StepKey; label: string; icon: React.ReactNode }> = [
  { key: "identity", label: "Kimliklendirme", icon: <PackageSearch className="h-4 w-4" /> },
  { key: "age", label: "Yaş Seçimi", icon: <Users className="h-4 w-4" /> },
  { key: "type", label: "Tip / Fonksiyon", icon: <Shapes className="h-4 w-4" /> },
  { key: "tests", label: "Test Listesi", icon: <ListChecks className="h-4 w-4" /> },
  { key: "records", label: "Hamveri Formu", icon: <ClipboardCheck className="h-4 w-4" /> },
];

// Gereklilik → Madde + Test Yöntemi haritalama (kullanıcının verdiği tablodan).
// "Tip / Fonksiyon" adımındaki seçime göre Test Listesi otomatik doldurulur.
const gereklilikDataset: Array<{ gereklilik: string; madde: string; yontem: string }> = [
  { gereklilik: "Malzeme Temizliği", madde: "4.1", yontem: "Görsel Muayene" },
  { gereklilik: "Montaj", madde: "4.2", yontem: "Görsel Muayene" },
  { gereklilik: "Esnek Plastik Levha", madde: "4.3", yontem: "8.24.1" },
  { gereklilik: "Esnek Plastik Levha", madde: "4.3", yontem: "Plastik levha ≥ 0,038 mm ise hava geçişi kontrolü" },
  { gereklilik: "Oyuncak Torbaları", madde: "4.4", yontem: "Boyutsal ölçüm (380 mm çevre)" },
  { gereklilik: "Oyuncak Torbaları", madde: "4.4", yontem: "8.43" },
  { gereklilik: "Cam", madde: "4.5", yontem: "Yaş Değerlendirmesi (5)" },
  { gereklilik: "Cam", madde: "4.5", yontem: "Camın kullanımındaki işlev değerlendilir." },
  { gereklilik: "Cam", madde: "4.5", yontem: "8.5" },
  { gereklilik: "Cam", madde: "4.5", yontem: "8.7" },
  { gereklilik: "Cam", madde: "4.5", yontem: "8.11" },
  { gereklilik: "Cam", madde: "4.5", yontem: "8.12" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.2" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.3" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.4.2.1" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.5" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.7" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.8" },
  { gereklilik: "Genişleyen Malzemeler", madde: "4.6", yontem: "8.14" },
  { gereklilik: "Kenarlar", madde: "4.7", yontem: "8.11" },
  { gereklilik: "Kenarlar", madde: "4.7", yontem: "Kıymık görsel kontrol" },
  { gereklilik: "Kenarlar", madde: "4.7", yontem: "Yaş Değerlendirmesi (5)" },
  { gereklilik: "Kenarlar", madde: "4.7", yontem: "Uyarı Kontrolü (7.6)" },
  { gereklilik: "Uçlar ve Metal Teller", madde: "4.8", yontem: "8.12" },
  { gereklilik: "Uçlar ve Metal Teller", madde: "4.8", yontem: "8.13.2" },
  { gereklilik: "Uçlar ve Metal Teller", madde: "4.8", yontem: "8.13.3" },
  { gereklilik: "Uçlar ve Metal Teller", madde: "4.8", yontem: "Yaş Değerlendirmesi (5)" },
  { gereklilik: "Uçlar ve Metal Teller", madde: "4.8", yontem: "Uyarı Kontrolü (7.6)" },
  { gereklilik: "Çıkıntılı Parçalar", madde: "4.9", yontem: "Çap kontrolü (≥ 2mm)" },
  { gereklilik: "Çıkıntılı Parçalar", madde: "4.9", yontem: "Uç kısmı pürüzsüz, çapaksız ve yuvarlatılmış mı?" },
  { gereklilik: "Çıkıntılı Parçalar", madde: "4.9", yontem: "8.4.2.3" },
  { gereklilik: "Çıkıntılı Parçalar", madde: "4.9", yontem: "8.11" },
  { gereklilik: "Çıkıntılı Parçalar", madde: "4.9", yontem: "8.12" },
  { gereklilik: "Birbirine Karş Hareket Eden Parçalar (menteşe)", madde: "4.10.3", yontem: "Parça kütlesi kontrolü (≥250 g)" },
  { gereklilik: "Birbirine Karş Hareket Eden Parçalar (menteşe)", madde: "4.10.3", yontem: "Yay açıklık ölçümü (3 mm)" },
  { gereklilik: "Birbirine Karş Hareket Eden Parçalar (yay)", madde: "4.10.4", yontem: "Yay açıklık ölçümü (3 mm)" },
  { gereklilik: "Birbirine Karş Hareket Eden Parçalar (yay)", madde: "4.10.4", yontem: "40 N kuvvet uygulama kontrolü" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.2" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.3" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.4.2.1" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.9" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.17.1" },
  { gereklilik: "Ağızla Çalıştırılan Oyuncaklar ve Ağıza Alınması Amaçlanan Diğer Oyuncaklar", madde: "4.11", yontem: "8.17.2" },
  { gereklilik: "Balonlar", madde: "4.12", yontem: "Uyarı Kontrolü (7.3)" },
  { gereklilik: "Balonlar", madde: "4.12", yontem: "8.24.1 (plastik balon ise)" },
  { gereklilik: "Oyuncak Uçurtmaların ve Diğer Uçan Oyuncakların Kordonları/ipleri", madde: "4.13", yontem: "8.19" },
  { gereklilik: "Oyuncak Uçurtmaların ve Diğer Uçan Oyuncakların Kordonları/ipleri", madde: "4.13", yontem: "Uyarı Kontrolü (7.9)" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "İç hacim ölçümü (30 litre)" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "İç boyut ölçümü (≥150mm)" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "8.43" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "8.42" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "Parmak(Boşluk) Testi (≥ 12 mm)" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "8.27.2" },
  { gereklilik: "İçine Girilebilen Oyuncaklar", madde: "4.14.1", yontem: "8.27.3" },
  { gereklilik: "Başı Tamamen Saran Oyuncaklar", madde: "4.14.2", yontem: "8.43" },
  { gereklilik: "Başı Tamamen Saran Oyuncaklar", madde: "4.14.2", yontem: "Yüzey temas testi" },
  { gereklilik: "Başı Tamamen Saran Oyuncaklar", madde: "4.14.2", yontem: "Taklit oyuncak ise Uyarı kontrolü (7.8)" },
  { gereklilik: "Başı Tamamen Saran Oyuncaklar", madde: "4.14.2", yontem: "Numune normal kullanım testi" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.3 Tork" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.4.2.1 Çekme" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.5 Düşme" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.7 Darbe" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.11" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "8.12" },
  { gereklilik: "Yüzü Saran Sert Malzeme Oyuncaklar", madde: "4.14.3", yontem: "Küçük ve gevşek parça kontrolü" },
  { gereklilik: "Taklit Koruyucu Maske ve Kasklar", madde: "4.14.4", yontem: "Taklit oyuncak ise Uyarı kontrolü (7.8)" },
  { gereklilik: "Taklit Koruyucu Maske ve Kasklar", madde: "4.14.4", yontem: "Numune normal kullanım testi" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "8.3" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "8.4.2.1" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "Stoper çıkıntı kontrolü (>5 mm)" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "8.2" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "Uyarı Kontrolü (7.4)" },
  { gereklilik: "Su Oyuncakları ve Şişirilebilir Oyuncaklar", madde: "4.18", yontem: "\"Gözetimsiz güvenli\" iması kontrolü" },
  { gereklilik: "Elektriksel Olmayan Bir Isı Kaynağı İçeren Oyuncaklar", madde: "4.21", yontem: "8.26 Sıcaklık Artışı Ölçümü" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.28.1" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.28.2" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.3" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.4.2.1" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.5" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.6" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.7" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "8.8" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "Yaş Değerlendirmesi (5.10)" },
  { gereklilik: "Küçük Toplar", madde: "4.22", yontem: "Uyarı Kontrolü (7.2)" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "Ürün, 8 yaş ve üzeri için tasarlanmış manyetik/elektriksel deney seti mi?" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.2" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.3" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.4.2.1" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.4.2.2" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.5" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.7" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.8" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.30" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.9" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "8.31" },
  { gereklilik: "Mıknastıslar", madde: "4.23", yontem: "Uyarı Kontrolü (7.16)" },
  { gereklilik: "Yo-Yo Topları", madde: "4.24", yontem: "8.33.1" },
  { gereklilik: "Yo-Yo Topları", madde: "4.24", yontem: "8.33.2" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.2" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.28.1" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.3" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.4.2.1" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.5" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.7" },
  { gereklilik: "Yiyeceklere Bağlı Oyuncaklar", madde: "4.25", yontem: "8.8" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.2 - 5.1(a) – Test Öncesi Kontrol" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.4.2.1 - 8.2 5.1(a) – Test Öncesi Kontrol" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.3 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.4.2.1 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.5 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.7 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.8 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.6 5.1(b) – Kullanım ve Kötüye Kullanım" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.2 5.1(b) – Test Sonrası Zorunlu Kontroller" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.11 5.1(b) – Test Sonrası Zorunlu Kontroller" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.12 5.1(b) – Test Sonrası Zorunlu Kontroller" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "4.10.4 (yay kontrolü) 5.1(b) – Test Sonrası Zorunlu Kontroller" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "Manyetik bileşen ayrılması kontrolü 5.1(b) – Test Sonrası Zorunlu Kontroller" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.12 - 5.1(c) – Metal Uç Tetikleyici (≤ 2 mm)" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.6 - 5.1(d) – Büyük ve hacimli oyuncak" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "8.9 - 5.1(e) – Yapıştırılmış Ahşap test sonrası 5.1(b) tekrar kontrol edilir." },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "Muhafaza çatlak kontrolü - 5.1(f) – Oturamayan Bebek Oyuncağı" },
  { gereklilik: "36 Aydan Küçük Çocuklar İçin Tasarlanmış Oyuncaklarda Genel Kurallar", madde: "5.1", yontem: "Erişilebilir köpük bileşen kontrolü 5.1(g) – Köpük Oyuncak" },
  { gereklilik: "Yumuşak Dolgulu Oyuncaklar ve Oyuncakların Yumuşak Dolgulu Bölümleri", madde: "5.2", yontem: "Görsel Muayene - 5.2(a) - Dolgu içeriği kontrolü" },
  { gereklilik: "Yumuşak Dolgulu Oyuncaklar ve Oyuncakların Yumuşak Dolgulu Bölümleri", madde: "5.2", yontem: "8.4.2.2 - 5.2(b) - Dikiş dayanım kontrolü" },
  { gereklilik: "Yumuşak Dolgulu Oyuncaklar ve Oyuncakların Yumuşak Dolgulu Bölümleri", madde: "5.2", yontem: "8.10 - 5.2(b) - Erişilebilirlik Kontrolü" },
  { gereklilik: "Yumuşak Dolgulu Oyuncaklar ve Oyuncakların Yumuşak Dolgulu Bölümleri", madde: "5.2", yontem: "8.2 - 5.2(b) - Küçük Parça Kontrolü (gerekirse)" },
  { gereklilik: "Yumuşak Dolgulu Oyuncaklar ve Oyuncakların Yumuşak Dolgulu Bölümleri", madde: "5.2", yontem: "12 mm/6mm - 5.2(c) - Lifli Dolgu Açıklık Kontrolü" },
  { gereklilik: "Plastik Tabaka", madde: "5.3", yontem: "8.24.2 Plastik Tabaka Yapışma Kontrolü" },
  { gereklilik: "Plastik Tabaka", madde: "5.3", yontem: "8.4.2.1 Plastik Tabaka Germe Deneyi" },
  { gereklilik: "Plastik Tabaka", madde: "5.3", yontem: "8.24.1 Kalınlık Ölçümü" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.36 Kordon, Zincir ve Elektrik Kablosu Uzunluk Deneyi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.34 Ayırma Düzeneği Deneyi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.37 İki İp Veya Zincirin Dolanma Potansiyelinin Değerlendirilmesi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.32 Kordonların ve Zincirlerin Çevre Uzunluğu Deneyi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.20 Kordonların Enine Kesit Ölçüsü Deneyi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "8.35 Geri Sarılabilir Kordon Deneyi" },
  { gereklilik: "Oyuncaklardaki İpler, Zincirler ve Elektrik Kabloları için Gereklilikler", madde: "5.4", yontem: "7.18 Uyarı Gerekliliği" },
  { gereklilik: "Sıvı Doldurulmuş Oyuncaklar İçin Gereklilikler", madde: "5.5", yontem: "8.15 Sıvıyla Doldurulmuş Oyuncakların Sızdırması Deneyi" },
  { gereklilik: "Sıvı Doldurulmuş Oyuncaklar İçin Gereklilikler", madde: "5.5", yontem: "7.11 Uyarı Gerekliliği" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.10" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.5" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.2" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.3" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.4" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.6" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.7" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.8" },
  { gereklilik: "Cam ve Porselen İçin Gereklilikler", madde: "5.7", yontem: "8.9" },
  { gereklilik: "Belirli Oyuncakların Şekil ve Büyüklüğünün Kontrolü", madde: "5.8", yontem: "8.16" },
  { gereklilik: "Monofilament Element İçeren Oyuncaklar için Gereklilikler", madde: "5.9", yontem: "Görsel kontrol" },
  { gereklilik: "Monofilament Element İçeren Oyuncaklar için Gereklilikler", madde: "5.9", yontem: "Uzunluk Ölçümü" },
  { gereklilik: "Monofilament Element İçeren Oyuncaklar için Gereklilikler", madde: "5.9", yontem: "7.15 Uyarı Gerekliliği" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.28" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.2" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.3" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.4.2.1" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.5" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.6" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.7" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "8.8" },
  { gereklilik: "Küçük Toplar İçin Gereklilikler", madde: "5.10", yontem: "Uyarı Kontrolü (7.2)" },
  { gereklilik: "Oyun Heykelleri İçin Gereklilikler", madde: "5.11", yontem: "Uzunluk Ölçümü" },
  { gereklilik: "Oyun Heykelleri İçin Gereklilikler", madde: "5.11", yontem: "8.29 Oyun figürleri deneyi" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "Boyut Ölçümü" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.3" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.4.2.1" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.5" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.7" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.8" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.9" },
  { gereklilik: "Yarı Küresel Şekle Sahip Oyuncaklar İçin Gereklilikler", madde: "5.12", yontem: "8.6" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.28" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.2" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.3" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.4.2.1" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.5" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.6" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.7" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.8" },
  { gereklilik: "Vakumlu Tutucular İçin Gereklilikler", madde: "5.13", yontem: "8.9" },
  { gereklilik: "Tamamen veya Kısmen Boyun Etrafına Takılmak Amacıyla Tasarlanan Kayışlar İçin Gereklilikler", madde: "5.14", yontem: "8.34" },
  { gereklilik: "Çekme İpleri Olan Kızaklar", madde: "5.15", yontem: "7.20 Uyarı Gerekliliği" },
];

const gereklilikNames: string[] = Array.from(new Set(gereklilikDataset.map(row => row.gereklilik)));

const requirementSlug = (name: string) =>
  name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const materialOptions = [
  "Sert plastik",
  "Yumuşak plastik",
  "Tekstil",
  "Metal",
  "Ahşap",
  "Cam/Porselen",
  "Kağıt/Karton",
  "Sıvı içerik",
  "Mıknatıs",
];

const purposeOptions = [
  "Ev tipi oyuncak",
  "Su oyuncağı",
  "Binit araç",
  "Ağıza alınan oyuncak",
  "Sesli oyuncak",
  "Projektil / fırlatıcı",
  "Kostüm / giyilebilir",
  "Gıda ile birlikte sunulan",
];

const toyTypeOptions = [
  { key: "soft", label: "Yumuşak / Peluş", hint: "Dikiş dayanımı, dolgu erişilebilirliği ve küçük parça kontrollerini açar." },
  { key: "rideOn", label: "Binit Araç", hint: "Statik/dinamik dayanım, stabilite ve fren performansını açar." },
  { key: "acoustic", label: "Sesli Oyuncak", hint: "Akustik testler ve dB ölçümlerini açar." },
  { key: "projectile", label: "Projektil", hint: "Kinetik enerji, menzil ve darbe kontrollerini açar." },
  { key: "magnet", label: "Mıknatıslı Oyuncak", hint: "Flux indeksi ve mıknatıs ayrılma testlerini açar." },
  { key: "corded", label: "İpli / Kordonlu", hint: "İp uzunluğu, kopma ve dolaşma testlerini açar." },
  { key: "mouth", label: "Ağıza Alınan", hint: "Ağızla çalıştırılan oyuncak dayanım ve küçük parça testlerini açar." },
  { key: "aquatic", label: "Su / Şişme Oyuncak", hint: "Su oyuncağı ve şişirilebilir ürün değerlendirmelerini açar." },
  { key: "plasticFilm", label: "Plastik Film / Torba", hint: "Film kalınlığı ve ambalaj boğulma riskini açar." },
  { key: "moving", label: "Hareketli Mekanizma", hint: "Katlanır, kayan, menteşeli ve yaylı mekanizma risklerini açar." },
];

const baseTests: TestRow[] = [
  {
    id: "general-cleanliness",
    source: "Zorunlu",
    group: "Genel",
    title: "Temizlik ve malzeme uygunluğu",
    clause: "Madde 4.1",
    method: "Görsel kontrol",
    reason: "Her üründe temel malzeme temizliği ve yabancı madde kontrolü yapılır.",
  },
  {
    id: "edges",
    source: "Zorunlu",
    group: "Genel",
    title: "Kenar keskinliği",
    clause: "Madde 4.7",
    method: "8.10 / 8.11",
    reason: "Erişilebilir kenarlarda kesilme riski değerlendirilir.",
  },
  {
    id: "points",
    source: "Zorunlu",
    group: "Genel",
    title: "Uç keskinliği ve metal tel kontrolü",
    clause: "Madde 4.8",
    method: "8.10 / 8.12 / 8.13",
    reason: "Erişilebilir uç, tel ve delinme riski değerlendirilir.",
  },
];

const testCatalog: Array<TestRow & { when: (state: FormState) => boolean }> = [
  {
    id: "small-parts-under36",
    source: "Zorunlu",
    group: "Yaş",
    title: "Küçük parça silindiri",
    clause: "Madde 5.1",
    method: "8.2",
    reason: "0-36 ay grubunda boğulma/yutma riski için en katı küçük parça kriteri uygulanır.",
    when: state => state.ageGroup === "under36",
  },
  {
    id: "under36-torque-tension",
    source: "Zorunlu",
    group: "Yaş",
    title: "Tork, çekme, düşme, darbe ve basınç sonrası küçük parça",
    clause: "Madde 5.1",
    method: "8.3 / 8.4 / 8.5 / 8.7 / 8.8",
    reason: "36 ay altı oyuncaklarda kullanım sonrası ayrılabilir küçük parça oluşumu kontrol edilir.",
    when: state => state.ageGroup === "under36",
  },
  {
    id: "long-fibres",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "Uzun lifli oyuncak değerlendirmesi",
    clause: "Madde 5.9",
    method: "Görsel / boyutsal değerlendirme",
    reason: "10 ay altı kullanımda monofilament/lif yapısı özel boğulma ve dolaşma riski doğurabilir.",
    when: state => state.criticalAges.under10 && state.toyTypes.soft,
  },
  {
    id: "cords-under18",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "18 ay altı ip/kordon uzunluğu",
    clause: "Madde 5.4",
    method: "8.20 / 8.32 / 8.36",
    reason: "18 ay altı oyuncaklarda kordon uzunluğu ve dolaşma riski özel olarak değerlendirilir.",
    when: state => state.criticalAges.under18 && state.toyTypes.corded,
  },
  {
    id: "cords",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "İp, zincir, kayış ve kablo kontrolleri",
    clause: "Madde 5.4 / 4.13",
    method: "8.19 / 8.20 / 8.32 / 8.34 / 8.35 / 8.36 / 8.37",
    reason: "İpli oyuncaklarda uzunluk, kopma, elektriksel direnç ve dolaşma potansiyeli değerlendirilir.",
    when: state => state.toyTypes.corded,
  },
  {
    id: "soft-filled",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Yumuşak/peluş dikiş ve dolgu değerlendirmesi",
    clause: "Madde 5.2",
    method: "8.4 / 8.7 / 8.8",
    reason: "Dikiş dayanımı, dolguya erişim ve küçük parça oluşumu kontrol edilir.",
    when: state => state.toyTypes.soft,
  },
  {
    id: "ride-on-strength",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Binit araç dayanım, stabilite ve fren performansı",
    clause: "Madde 4.15",
    method: "8.21",
    reason: "Çocuğun ağırlığını taşıyan oyuncaklarda statik/dinamik dayanım, stabilite ve fren performansı gerekir.",
    when: state => state.toyTypes.rideOn || state.purpose === "Binit araç",
  },
  {
    id: "acoustic",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Akustik testler",
    clause: "Madde 4.20",
    method: "8.25",
    reason: "Sesli oyuncaklarda ses basınç seviyesi ölçülür.",
    when: state => state.toyTypes.acoustic || state.purpose === "Sesli oyuncak",
  },
  {
    id: "projectile",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Projektil kinetik enerji ve darbe",
    clause: "Madde 4.17",
    method: "8.23 / 8.38 / 8.39 / 8.40 / 8.41",
    reason: "Ok, dart ve fırlatıcı oyuncaklarda kinetik enerji, menzil ve uç parça güvenliği değerlendirilir.",
    when: state => state.toyTypes.projectile || state.purpose === "Projektil / fırlatıcı",
  },
  {
    id: "magnet",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Mıknatıs flux indeksi ve ayrılma",
    clause: "Madde 4.23",
    method: "8.30 / 8.31",
    reason: "Mıknatıslı oyuncaklarda manyetik akı indeksi ve dayanım sonrası ayrılma kontrol edilir.",
    when: state => state.toyTypes.magnet || state.materials.includes("Mıknatıs"),
  },
  {
    id: "magnetic-set-age",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "Mıknatıslı deney seti yaş uyarısı",
    clause: "Madde 7.16",
    method: "Etiket / talimat kontrolü",
    reason: "8 yaş kırılımı mıknatıslı deney setleri için özel uyarı değerlendirmesi gerektirebilir.",
    when: state => state.criticalAges.under8 && state.toyTypes.magnet,
  },
  {
    id: "mouth",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Ağıza alınan / ağızla çalıştırılan oyuncak",
    clause: "Madde 4.11",
    method: "8.2 / 8.3 / 8.4 / 8.9 / 8.17",
    reason: "Ağıza alınan oyuncaklarda ayrılabilir parça, ıslanma ve dayanım testleri gerekir.",
    when: state => state.toyTypes.mouth || state.purpose === "Ağıza alınan oyuncak",
  },
  {
    id: "aquatic",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Su oyuncağı / şişirilebilir oyuncak",
    clause: "Madde 4.18",
    method: "8.2 / 8.3 / 8.4 / 8.5 / 8.7 / 8.8",
    reason: "Suda kullanılan veya şişirilebilir oyuncaklarda dayanım ve uyarı kontrolleri gerekir.",
    when: state => state.toyTypes.aquatic || state.purpose === "Su oyuncağı",
  },
  {
    id: "plastic-film",
    source: "Koşullu",
    group: "Materyal",
    title: "Plastik film / oyuncak torbası",
    clause: "Madde 4.3 / 4.4 / 6",
    method: "8.24",
    reason: "Esnek plastik film ve torbalarda film kalınlığı ve boğulma riski değerlendirilir.",
    when: state => state.toyTypes.plasticFilm || state.materials.includes("Yumuşak plastik"),
  },
  {
    id: "glass",
    source: "Koşullu",
    group: "Materyal",
    title: "Cam / porselen kırılma sonrası keskinlik",
    clause: "Madde 4.5 / 5.7",
    method: "8.7 / 8.10 / 8.11 / 8.12",
    reason: "Cam veya porselen parçalar kırılma ve erişilebilir keskinlik açısından değerlendirilir.",
    when: state => state.materials.includes("Cam/Porselen"),
  },
  {
    id: "liquid",
    source: "Koşullu",
    group: "Materyal",
    title: "Sıvı dolu oyuncak sızdırmazlık",
    clause: "Madde 5.5",
    method: "8.15",
    reason: "Sıvı içeren oyuncaklarda sızdırmazlık ve kullanım sonrası bütünlük kontrol edilir.",
    when: state => state.materials.includes("Sıvı içerik"),
  },
  {
    id: "moving-mechanism",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Hareketli mekanizma, katlanma ve sıkışma",
    clause: "Madde 4.10",
    method: "8.5 / 8.6 / 8.7 / 8.18",
    reason: "Katlanır, kayan veya yaylı mekanizmalarda sıkışma ve ani kapanma riski değerlendirilir.",
    when: state => state.toyTypes.moving,
  },
  {
    id: "en71-2-flammability-textile",
    source: "Koşullu",
    group: "EN 71-2",
    title: "Alevlenebilirlik değerlendirmesi",
    clause: "EN 71-2",
    method: "EN 71-2",
    reason: "Tekstil, peluş veya giyilebilir malzeme içeren oyuncaklarda alevlenebilirlik değerlendirmesi eklenir.",
    when: state => state.materials.includes("Tekstil") || state.toyTypes.soft || state.purpose === "Kostüm / giyilebilir",
  },
];

const en71RequirementTitles: Array<{ clause: string; title: string }> = [
  { clause: "4", title: "Genel gereklilikler" },
  { clause: "4.1", title: "Malzeme temizli\u011fi" },
  { clause: "4.2", title: "Montaj" },
  { clause: "4.3", title: "Esnek plastik tabaka" },
  { clause: "4.4", title: "Oyuncak torbalar\u0131" },
  { clause: "4.5", title: "Cam" },
  { clause: "4.6", title: "Geni\u015fleyen malzemeler" },
  { clause: "4.7", title: "Kenarlar" },
  { clause: "4.8", title: "U\u00e7lar ve metalik teller" },
  { clause: "4.9", title: "\u00c7\u0131k\u0131nt\u0131l\u0131 par\u00e7alar" },
  { clause: "4.10", title: "Birbirine kar\u015f\u0131 hareket eden par\u00e7alar" },
  { clause: "4.10.1", title: "Katlanan ve kayan mekanizmalar" },
  { clause: "4.10.2", title: "Tahrik mekanizmalar\u0131" },
  { clause: "4.10.3", title: "Mente\u015feler" },
  { clause: "4.10.4", title: "Yaylar" },
  { clause: "4.11", title: "A\u011f\u0131zla etkinle\u015ftirilen ve a\u011fza al\u0131nmas\u0131 ama\u00e7lanan oyuncaklar" },
  { clause: "4.12", title: "Balonlar" },
  { clause: "4.13", title: "U\u00e7urtma ve di\u011fer u\u00e7an oyuncaklar\u0131n kordonlar\u0131" },
  { clause: "4.14", title: "Kapal\u0131 hacimler / mahfazalar" },
  { clause: "4.14.1", title: "\u0130\u00e7ine girilebilen oyuncaklar" },
  { clause: "4.14.2", title: "Maskeler ve baretler" },
  { clause: "4.14.3", title: "Y\u00fcz\u00fc kaplayan sert malzemeler" },
  { clause: "4.14.4", title: "Taklit koruyucu maskeler ve kasklar" },
  { clause: "4.15", title: "\u00c7ocu\u011fun a\u011f\u0131rl\u0131\u011f\u0131n\u0131 ta\u015f\u0131mas\u0131 ama\u00e7lanan oyuncaklar" },
  { clause: "4.16", title: "A\u011f\u0131r, hareketsiz oyuncaklar" },
  { clause: "4.17", title: "Mermili (f\u0131rlatmal\u0131) oyuncaklar" },
  { clause: "4.18", title: "Su oyuncaklar\u0131 ve \u015fi\u015firilebilir oyuncaklar" },
  { clause: "4.19", title: "Oyuncaklar i\u00e7in \u00f6zel tapa/kaps\u00fcl (percussion caps)" },
  { clause: "4.20", title: "Akustik" },
  { clause: "4.21", title: "Elektriksel olmayan \u0131s\u0131 kayna\u011f\u0131 i\u00e7eren oyuncaklar" },
  { clause: "4.22", title: "K\u00fc\u00e7\u00fck toplar" },
  { clause: "4.23", title: "M\u0131knat\u0131slar" },
  { clause: "4.24", title: "Yoyo toplar\u0131" },
  { clause: "4.25", title: "Yiyece\u011fe ba\u011fl\u0131 oyuncaklar" },
  { clause: "4.26", title: "Oyuncak kost\u00fcmler (k\u0131l\u0131k de\u011fi\u015ftirme)" },
  { clause: "4.27", title: "U\u00e7an oyuncaklar" },
  { clause: "4.28", title: "Yiyecek taklidi oyuncaklar" },
  { clause: "5", title: "36 aydan k\u00fc\u00e7\u00fck \u00e7ocuklar i\u00e7in oyuncaklar" },
  { clause: "5.1", title: "Genel gereklilikler" },
  { clause: "5.2", title: "Yumu\u015fak dolgulu oyuncaklar ve par\u00e7alar\u0131" },
  { clause: "5.3", title: "Plastik tabaka" },
  { clause: "5.4", title: "Oyuncaklardaki kordonlar, zincirler ve elektrik kablolar\u0131" },
  { clause: "5.5", title: "S\u0131v\u0131yla doldurulmu\u015f oyuncaklar" },
  { clause: "5.6", title: "Elektrikle \u00e7al\u0131\u015fan binilebilir oyuncaklarda h\u0131z s\u0131n\u0131rlamas\u0131" },
  { clause: "5.7", title: "Cam ve porselen" },
  { clause: "5.8", title: "Belirli oyuncaklar\u0131n \u015fekil ve boyutu" },
  { clause: "5.9", title: "Monofilament liflerden olu\u015fan oyuncaklar" },
  { clause: "5.10", title: "K\u00fc\u00e7\u00fck toplar" },
  { clause: "5.11", title: "Oyun heykelleri" },
  { clause: "5.12", title: "Yar\u0131m k\u00fcresel oyuncaklar" },
  { clause: "5.13", title: "Vantuzlar" },
  { clause: "5.14", title: "Boyun \u00e7evresine tak\u0131lan kay\u0131\u015flar" },
  { clause: "5.15", title: "\u00c7ekme kordonlu k\u0131zaklar" },
  { clause: "6", title: "Ambalaj" },
  { clause: "7", title: "Uyar\u0131lar, i\u015faretlemeler ve kullan\u0131m talimatlar\u0131" },
  { clause: "7.1", title: "Genel" },
  { clause: "7.2", title: "36 aydan k\u00fc\u00e7\u00fckler i\u00e7in olmayan oyuncaklar" },
  { clause: "7.3", title: "Lateks balonlar" },
  { clause: "7.4", title: "Su oyuncaklar\u0131" },
  { clause: "7.5", title: "Fonksiyonel oyuncaklar" },
  { clause: "7.6", title: "Tehlikeli keskin fonksiyonel kenarlar ve u\u00e7lar" },
  { clause: "7.7", title: "Mermili oyuncaklar" },
  { clause: "7.8", title: "Taklit koruyucu maske ve baretler" },
  { clause: "7.9", title: "Oyuncak u\u00e7urtmalar" },
  { clause: "7.10", title: "Be\u015fik/karyola/puset \u00fczerine gerilen oyuncaklar" },
  { clause: "7.11", title: "S\u0131v\u0131 dolu di\u015f ka\u015f\u0131y\u0131c\u0131lar" },
  { clause: "7.12", title: "Oyuncaklar i\u00e7in \u00f6zel tapa/kaps\u00fcl" },
  { clause: "7.13", title: "Akustik" },
  { clause: "7.14", title: "\u00c7ocu\u011fun a\u011f\u0131rl\u0131\u011f\u0131n\u0131 ta\u015f\u0131yan oyuncaklar" },
  { clause: "7.15", title: "Monofilament lifli oyuncaklar" },
  { clause: "7.16", title: "Manyetik/elektriksel deney setleri" },
  { clause: "7.17", title: "300 mm'yi a\u015fan elektrik kablolu oyuncaklar" },
  { clause: "7.18", title: "18-36 ay aras\u0131 i\u00e7in kordon/zincirli oyuncaklar" },
  { clause: "7.19", title: "Be\u015fik/karyola/pusete tak\u0131lan oyuncaklar" },
  { clause: "7.20", title: "\u00c7ekme kordonlu k\u0131zaklar" },
  { clause: "7.21", title: "U\u00e7an oyuncaklar" },
  { clause: "7.22", title: "Do\u011fa\u00e7lama (ge\u00e7ici) mermiler" },
];

const en71MethodOptions = [
  { id: "Madde 8.1", label: "Madde 8.1 - Deney i\u00e7in genel gereklilikler" },
  { id: "Madde 8.2", label: "Madde 8.2 - K\u00fc\u00e7\u00fck par\u00e7a silindiri" },
  { id: "Madde 8.3", label: "Madde 8.3 - Tork (burulma) deneyi" },
  { id: "Madde 8.4", label: "Madde 8.4 - Germe (\u00e7ekme) deneyi" },
  { id: "Madde 8.5", label: "Madde 8.5 - D\u00fc\u015f\u00fcrme deneyi" },
  { id: "Madde 8.6", label: "Madde 8.6 - Devrilme deneyi" },
  { id: "Madde 8.7", label: "Madde 8.7 - \u00c7arpma (darbe) deneyi" },
  { id: "Madde 8.8", label: "Madde 8.8 - S\u0131k\u0131\u015ft\u0131rma deneyi" },
  { id: "Madde 8.9", label: "Madde 8.9 - Islatma deneyi" },
  { id: "Madde 8.10", label: "Madde 8.10 - Par\u00e7a/komponentin eri\u015filebilirli\u011fi" },
  { id: "Madde 8.11", label: "Madde 8.11 - Kenarlar\u0131n keskinli\u011fi" },
  { id: "Madde 8.12", label: "Madde 8.12 - U\u00e7lar\u0131n keskinli\u011fi" },
  { id: "Madde 8.13", label: "Madde 8.13 - Metalik tellerin esnekli\u011fi" },
  { id: "Madde 8.14", label: "Madde 8.14 - Geni\u015fleyen malzemeler" },
  { id: "Madde 8.15", label: "Madde 8.15 - S\u0131v\u0131 dolu oyuncaklar\u0131n s\u0131zd\u0131rmas\u0131" },
  { id: "Madde 8.16", label: "Madde 8.16 - Belirli oyuncaklar\u0131n geometrik \u015fekli" },
  { id: "Madde 8.17", label: "Madde 8.17 - A\u011f\u0131zla etkinle\u015ftirilen oyuncaklar\u0131n dayan\u0131kl\u0131l\u0131\u011f\u0131" },
  { id: "Madde 8.18", label: "Madde 8.18 - Katlanan veya kayan mekanizmalar" },
  { id: "Madde 8.19", label: "Madde 8.19 - Kordonlar\u0131n elektriksel direnci" },
  { id: "Madde 8.20", label: "Madde 8.20 - Kordonlar\u0131n enine kesit boyutu" },
  { id: "Madde 8.21", label: "Madde 8.21 - \u00c7ocu\u011fun a\u011f\u0131rl\u0131\u011f\u0131n\u0131 ta\u015f\u0131yan oyuncaklar" },
  { id: "Madde 8.22", label: "Madde 8.22 - Kararl\u0131l\u0131k, a\u011f\u0131r hareketsiz oyuncaklar" },
  { id: "Madde 8.23", label: "Madde 8.23 - Mermilerin kinetik enerjisi ve kinetik enerji yo\u011funlu\u011fu" },
  { id: "Madde 8.24", label: "Madde 8.24 - Plastik tabaka" },
  { id: "Madde 8.25", label: "Madde 8.25 - Emisyon ses bas\u0131nc\u0131 seviyelerinin tayini (akustik)" },
  { id: "Madde 8.26", label: "Madde 8.26 - S\u0131cakl\u0131k art\u0131\u015flar\u0131n\u0131n \u00f6l\u00e7\u00fcm\u00fc" },
  { id: "Madde 8.27", label: "Madde 8.27 - Oyuncak sand\u0131k kapaklar\u0131" },
  { id: "Madde 8.28", label: "Madde 8.28 - K\u00fc\u00e7\u00fck toplar ve vantuz deneyi" },
  { id: "Madde 8.29", label: "Madde 8.29 - Oyun heykelleri deneyi" },
  { id: "Madde 8.30", label: "Madde 8.30 - M\u0131knat\u0131slar i\u00e7in germe deneyi" },
  { id: "Madde 8.31", label: "Madde 8.31 - Manyetik ak\u0131 indeksi" },
  { id: "Madde 8.32", label: "Madde 8.32 - Kordon ve zincirlerin \u00e7evre uzunlu\u011fu" },
  { id: "Madde 8.33", label: "Madde 8.33 - Yoyo toplar\u0131 \u00f6l\u00e7\u00fcmleri" },
  { id: "Madde 8.34", label: "Madde 8.34 - Kopma \u00f6zelli\u011fi ayr\u0131lma deneyi" },
  { id: "Madde 8.35", label: "Madde 8.35 - Kendili\u011finden geri \u00e7ekilen kordonlar" },
  { id: "Madde 8.36", label: "Madde 8.36 - Kordon, zincir ve elektrik kablolar\u0131n\u0131n uzunlu\u011fu" },
  { id: "Madde 8.37", label: "Madde 8.37 - \u0130ki kordon/zincirin dolanma potansiyeli de\u011ferlendirmesi" },
  { id: "Madde 8.38", label: "Madde 8.38 - Mermi menzilinin tayini" },
  { id: "Madde 8.39", label: "Madde 8.39 - Mermi ve u\u00e7an oyuncaklar\u0131n \u00f6n k\u0131s\u0131mlar\u0131n\u0131n de\u011ferlendirmesi" },
  { id: "Madde 8.40", label: "Madde 8.40 - Vantuzlu mermilerin uzunlu\u011fu" },
  { id: "Madde 8.41", label: "Madde 8.41 - Mermilerin duvara \u00e7arpma deneyi" },
  { id: "Madde 8.42", label: "Madde 8.42 - \u0130\u00e7ine girilebilen oyuncaklar i\u00e7in ka\u00e7\u0131\u015f kuvveti" },
  { id: "Madde 8.43", label: "Madde 8.43 - Havaland\u0131rma a\u00e7\u0131kl\u0131klar\u0131n\u0131n kombinasyonlar\u0131" },
];

const methodLabelById = new Map(en71MethodOptions.map(option => [option.id, option.label]));

const formatMethodIds = (methodIds: string[]) =>
  methodIds.map(method => methodLabelById.get(method) || method).join(" / ");

// "Madde 8.X - <isim>" formatından numara → isim haritası çıkar.
// Test Listesi yöntem sütununda "8.X" rakamlarının yanına test isimlerini
// ekleyebilmek için kullanılır.
const methodNameByNumber: Record<string, string> = {};
for (const option of en71MethodOptions) {
  const match = option.label.match(/^Madde\s+([\d.]+)\s*-\s*(.+)$/);
  if (match) {
    methodNameByNumber[match[1]] = match[2].trim();
  }
}

// "8.4.2.1" gibi alt-numaralı maddeler için en yakın üst numarayı (8.4) bulup
// onun ismini döndürür.
function methodNumberToName(num: string): string | undefined {
  if (methodNameByNumber[num]) return methodNameByNumber[num];
  const parts = num.split(".");
  while (parts.length > 1) {
    parts.pop();
    const parent = parts.join(".");
    if (methodNameByNumber[parent]) return methodNameByNumber[parent];
  }
  return undefined;
}

// Bir method string'i içindeki "X.Y..." rakamlarının yanına, eğer hemen
// ardından yazılı bir açıklama YOKSA, " - <Madde adı>" ekler.
// Örnek: "8.2"             → "8.2 - Küçük parça silindiri"
// Örnek: "8.4 / 8.7"       → "8.4 - Germe (çekme) deneyi / 8.7 - Çarpma (darbe) deneyi"
// Örnek: "8.3 Tork"        → "8.3 Tork"  (zaten açıklamalı, dokunma)
// Örnek: "8.24.1 (plastik) → "8.24.1 (plastik)"  (parantezli açıklama var)
function enrichMethodCell(method: string): string {
  if (!method) return method;
  return method.replace(/\b(\d+(?:\.\d+)+)\b/g, (full, num, offset, source) => {
    const after = (source as string).slice(offset + (num as string).length).trimStart();
    // Hemen ardından bir harf veya parantez geliyorsa zaten açıklamalı kabul et
    if (/^[\p{L}(]/u.test(after)) return num as string;
    const name = methodNumberToName(num as string);
    return name ? `${num} - ${name}` : (num as string);
  });
}

const en71FullClauseOptions: TestRow[] = en71RequirementTitles.map(({ clause, title }) => ({
  id: "en71-1-clause-" + clause.replace(/\./g, "-"),
  source: "Harici",
  group: clause === "6" || clause.startsWith("7") ? "Genel De\u011ferlendirme" : "EN 71-1 Gereklilik",
  title,
  clause: "Madde " + clause,
  method: "Madde 8 y\u00f6ntemleri se\u00e7ilecek",
  reason: "Manuel olarak eklenen EN 71-1 gereklilik kontrol\u00fc.",
}));

const hiddenManualTestClauses = new Set([
  "Madde 4.3 / 4.4 / 6",
  "Madde 4.5 / 5.7",
  "Madde 5.4 / 4.13",
]);

const standardTestOptions: TestRow[] = [
  ...baseTests,
  ...testCatalog.map(test => ({
    id: test.id,
    source: test.source,
    group: test.group,
    title: test.title,
    clause: test.clause,
    method: test.method,
    reason: test.reason,
  })),
  ...en71FullClauseOptions.filter(option => ![...baseTests, ...testCatalog].some(test => test.clause === option.clause)),
].filter(test => !hiddenManualTestClauses.has(test.clause)).sort((a, b) => {
  const getParts = (clause: string) => (clause.match(/\d+(?:\.\d+)*/)?.[0] || "999")
    .split(".")
    .map(part => Number(part));
  const partsA = getParts(a.clause);
  const partsB = getParts(b.clause);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] || 0) - (partsB[index] || 0);
    if (diff !== 0) return diff;
  }
  return a.title.localeCompare(b.title, "tr");
});

export const en71StandardTestOptions = standardTestOptions;

interface FormState {
  reportNo: string;
  productName: string;
  brand: string;
  materials: string[];
  purpose: string;
  notes: string;
  ageGroup: AgeGroup;
  criticalAges: {
    under10: boolean;
    under18: boolean;
    under8: boolean;
  };
  // Eski (legacy) tip seçimi — kayıtlı kayıtlarda hâlâ olabilir.
  toyTypes: Record<string, boolean>;
  // Yeni: "Tip / Fonksiyon" adımında seçilen gereklilik (EN 71-1 tablosundan).
  selectedRequirements: string[];
}

const emptyState: FormState = {
  reportNo: "",
  productName: "",
  brand: "",
  materials: [],
  purpose: "Ev tipi oyuncak",
  notes: "",
  ageGroup: "",
  criticalAges: {
    under10: false,
    under18: false,
    under8: false,
  },
  toyTypes: Object.fromEntries(toyTypeOptions.map(option => [option.key, false])),
  selectedRequirements: [],
};

const decisionClass = (decision: TestDecision) => {
  if (decision === "Geçti") return "border-green-200 bg-green-50 text-green-700";
  if (decision === "Kaldı") return "border-red-200 bg-red-50 text-red-700";
  if (decision === "N/A") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const instructionNumberPattern = /\d+(?:\.\d+)*/g;

const instructionKey = (value: string) =>
  (value.match(instructionNumberPattern)?.[0] || value).trim().toLocaleLowerCase("tr-TR");

const extractClauseNumbers = (value: string) =>
  (value.match(instructionNumberPattern) || []).map(item => item.trim());

export default function En71RawDataFlow({ rawdataId }: { rawdataId?: string }) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepKey>("identity");
  const [form, setForm] = useState<FormState>(emptyState);
  const [records, setRecords] = useState<Record<string, RecordRow>>({});
  const [manualTests, setManualTests] = useState<TestRow[]>([]);
  const [manualTestForm, setManualTestForm] = useState<ManualTestFormState>({
    selectedId: "",
    methodIds: [],
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(rawdataId));
  const [saveError, setSaveError] = useState("");
  const [instructionMap, setInstructionMap] = useState<Record<string, InstructionRow>>({});
  const [requirementVisuals, setRequirementVisuals] = useState<Record<string, RequirementVisualRow>>({});
  const [visualDialogOpen, setVisualDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadInstructions() {
      try {
        const response = await fetch("/api/eurolab/rawdata-instructions?standard=EN%2071-1%3A2026", { credentials: "same-origin" });
        const json: InstructionRow[] & { error?: string } = await response.json();
        if (!response.ok) throw new Error(json.error || "Analiz talimatları alınamadı.");
        if (!alive) return;
        const entries = (Array.isArray(json) ? json : []).flatMap(row => {
          const keys = new Set<string>([instructionKey(row.clause)]);
          const methodKey = instructionKey(row.method);
          if (methodKey && methodKey !== "madde bazlı") keys.add(methodKey);
          return Array.from(keys).map(key => [key, row] as const);
        });
        setInstructionMap(Object.fromEntries(entries));
      } catch {
        if (alive) setInstructionMap({});
      }
    }

    loadInstructions();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadRequirementVisuals() {
      try {
        const response = await fetch("/api/eurolab/rawdata-requirement-visuals?standard=EN%2071-1%3A2026", { credentials: "same-origin" });
        const json: RequirementVisualRow[] & { error?: string } = await response.json();
        if (!response.ok) throw new Error(json.error || "Gereklilik görselleri alınamadı.");
        if (!alive) return;
        setRequirementVisuals(Object.fromEntries((Array.isArray(json) ? json : []).map(row => [instructionKey(row.clause), row])));
      } catch {
        if (alive) setRequirementVisuals({});
      }
    }

    loadRequirementVisuals();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!rawdataId) return;
    let alive = true;

    async function loadRecord() {
      setLoadingRecord(true);
      setSaveError("");
      try {
        const response = await fetch(`/api/eurolab/rawdata/${rawdataId}`, { credentials: "same-origin" });
        const json: RawdataDetail & { error?: string } = await response.json();
        if (!response.ok) throw new Error(json.error || "Hamveri kaydı alınamadı.");
        if (!alive) return;

        setForm({
          ...emptyState,
          ...json.product_data,
          criticalAges: {
            ...emptyState.criticalAges,
            ...(json.product_data?.criticalAges || {}),
          },
          toyTypes: {
            ...emptyState.toyTypes,
            ...(json.product_data?.toyTypes || {}),
          },
          materials: Array.isArray(json.product_data?.materials) ? json.product_data.materials : [],
          selectedRequirements: Array.isArray(json.product_data?.selectedRequirements) ? json.product_data.selectedRequirements : [],
        });
        setRecords(json.test_data?.records || {});
        // Hem kullanıcının manuel eklediği (Harici) hem de otomatik atanan
        // (auto-* id prefiksli) satırları geri yükle; useEffect'ler kayıttaki
        // materials/selectedRequirements'a göre auto'ları zaten regenere edecek.
        setManualTests((json.test_data?.selectedTests || []).filter(test => test.source === "Harici"));
      } catch (error: unknown) {
        if (alive) setSaveError(getErrorMessage(error, "Hamveri kaydı alınamadı."));
      } finally {
        if (alive) setLoadingRecord(false);
      }
    }

    loadRecord();
    return () => {
      alive = false;
    };
  }, [rawdataId]);

  const activeIndex = steps.findIndex(step => step.key === activeStep);

  // ── Otomatik test atamaları ──────────────────────────────────────────
  // 1) Kimliklendirme'de "Tekstil" seçili ise EN 71-2 alevlenebilirlik
  //    satırını test listesine otomatik ekle, kaldırılınca temizle.
  const AUTO_TEKSTIL_ID = "auto-en71-2-tekstil";
  useEffect(() => {
    const hasTekstil = form.materials.includes("Tekstil");
    setManualTests(current => {
      const without = current.filter(test => test.id !== AUTO_TEKSTIL_ID);
      if (!hasTekstil) return without;
      const row: TestRow = {
        id: AUTO_TEKSTIL_ID,
        source: "Zorunlu",
        group: "EN 71-2",
        title: "Alevlenebilirlik (EN 71-2)",
        clause: "EN 71-2",
        method: "EN 71-2",
        reason: "Tekstil malzeme seçildiği için otomatik atandı.",
      };
      return [...without, row];
    });
  }, [form.materials]);

  // 2) "Tip / Fonksiyon" adımında seçilen her gereklilik için kendi madde
  //    + test yöntemi satırlarını otomatik ekle. Kullanıcı yine "Harici"
  //    olarak manuel satır ekleyebilir; bunlar etkilenmez.
  const AUTO_REQ_PREFIX = "auto-req-";
  useEffect(() => {
    setManualTests(current => {
      // Otomatik gereklilik satırlarını temizle
      const preserved = current.filter(test => !test.id.startsWith(AUTO_REQ_PREFIX));
      const autoRows: TestRow[] = [];
      for (const reqName of form.selectedRequirements) {
        const rows = gereklilikDataset.filter(row => row.gereklilik === reqName);
        const slug = requirementSlug(reqName);
        rows.forEach((row, index) => {
          autoRows.push({
            id: `${AUTO_REQ_PREFIX}${slug}-${index}`,
            source: "Zorunlu",
            group: reqName,
            title: `${reqName} — ${row.yontem}`,
            clause: `Madde ${row.madde}`,
            method: row.yontem,
            reason: `${reqName} için Madde ${row.madde} kontrolü (otomatik atandı).`,
          });
        });
      }
      return [...preserved, ...autoRows];
    });
  }, [form.selectedRequirements]);

  const selectedTests = useMemo(() => manualTests, [manualTests]);

  const activeRequirementVisuals = useMemo(() => {
    const clauses = Array.from(new Set(selectedTests.flatMap(test => extractClauseNumbers(test.clause)).filter(clause => clause.startsWith("4."))));
    const rows = clauses
      .map(clause => requirementVisuals[instructionKey(clause)])
      .filter((row): row is RequirementVisualRow => Boolean(row));
    return Array.from(new Map(rows.map(row => [row.id, row])).values());
  }, [selectedTests, requirementVisuals]);

  const recordRows = useMemo(() => (
    selectedTests.map(test => ({
      ...test,
      record: records[test.id] || { measuredValue: "", decision: "Bekliyor" as TestDecision, observation: "" },
    }))
  ), [selectedTests, records]);

  const stats = useMemo(() => {
    const total = recordRows.length;
    const passed = recordRows.filter(row => row.record.decision === "Geçti").length;
    const failed = recordRows.filter(row => row.record.decision === "Kaldı").length;
    const na = recordRows.filter(row => row.record.decision === "N/A").length;
    return { total, passed, failed, na, waiting: total - passed - failed - na };
  }, [recordRows]);

  const testStatus = useMemo(() => {
    if (stats.failed > 0) return "Kaldı";
    if (stats.waiting > 0) return "Devam Ediyor";
    return "Tamamlandı";
  }, [stats]);

  const toggleMaterial = (material: string) => {
    setForm(current => ({
      ...current,
      materials: current.materials.includes(material)
        ? current.materials.filter(item => item !== material)
        : [...current.materials, material],
    }));
  };

  const updateRecord = (testId: string, patch: Partial<RecordRow>) => {
    const emptyRecord: RecordRow = {
      measuredValue: "",
      decision: "Bekliyor",
      observation: "",
    };
    setRecords(current => ({
      ...current,
      [testId]: {
        ...emptyRecord,
        ...(current[testId] || {}),
        ...patch,
      },
    }));
  };

  const addManualTest = () => {
    const selected = standardTestOptions.find(test => test.id === manualTestForm.selectedId);
    if (!selected) return;

    const test: TestRow = {
      id: `manual-${selected.id}-${Date.now()}`,
      source: "Harici",
      group: selected.group,
      title: selected.title,
      clause: selected.clause,
      method: selected.method,
      reason: manualTestForm.reason.trim() || selected.reason,
    };

    const selectedMethods = manualTestForm.methodIds.length > 0
      ? formatMethodIds(manualTestForm.methodIds)
      : selected.method;

    setManualTests(current => [...current, { ...test, method: selectedMethods }]);
    setManualTestForm({ selectedId: "", methodIds: [], reason: "" });
  };

  const removeManualTest = (testId: string) => {
    setManualTests(current => current.filter(test => test.id !== testId));
    setRecords(current => {
      const next = { ...current };
      delete next[testId];
      return next;
    });
  };

  const goNext = () => {
    const next = steps[Math.min(activeIndex + 1, steps.length - 1)];
    setActiveStep(next.key);
  };

  const goBack = () => {
    const prev = steps[Math.max(activeIndex - 1, 0)];
    setActiveStep(prev.key);
  };

  const handleSave = async () => {
    if (!form.reportNo.trim() || !form.productName.trim()) {
      setSaveError("Rapor no ve ürün adı zorunludur.");
      setActiveStep("identity");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const toyCategory = form.selectedRequirements.length > 0
        ? form.selectedRequirements.join(", ")
        : Object.entries(form.toyTypes)
            .filter(([, checked]) => checked)
            .map(([key]) => key)
            .join(", ");

      const response = await fetch(rawdataId ? `/api/eurolab/rawdata/${rawdataId}` : "/api/eurolab/rawdata", {
        method: rawdataId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          code: form.reportNo,
          sample_name: form.productName,
          standard: "EN 71-1:2026",
          toy_category: toyCategory || form.purpose,
          age_group: form.ageGroup === "under36" ? "0-36 Ay" : form.ageGroup === "over36" ? "36 Ay ve Üzeri" : "",
          status: testStatus,
          product_data: form,
          test_data: { stats, selectedTests, records },
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Hamveri kaydedilemedi.");
      window.alert(rawdataId ? "Güncellendi." : "Kaydedildi.");
      router.push("/laboratuvar/eurolab/hamveri");
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error, "Hamveri kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!rawdataId) {
      window.alert("Önce kaydetmelisiniz (DOCX indirme kayıtlı hamveri gerektirir).");
      return;
    }
    window.location.href = `/api/eurolab/rawdata/${rawdataId}/docx`;
  };

  return (
    <>
    <div className="space-y-5 hamveri-screen">
      {loadingRecord && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">
          Hamveri kaydı yükleniyor...
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/laboratuvar/eurolab/hamveri" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" style={{padding: "10px", marginBottom: "8px"}}>
          <ArrowLeft className="h-4 w-4" />
          Hamveri listesine dön
        </Link>
        
      </div>

      <section className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50" style={{ padding: "clamp(16px, 4vw, 20px) clamp(16px, 4vw, 24px)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[1rem] font-extrabold leading-6 text-slate-900">BS EN 71-1:2026 Test Karar Aracı</h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">Kimliklendirme, yaş filtresi, oyuncak tipi, dinamik test listesi ve karar defteri sırasıyla ilerler.</p>
            </div>
            <div className="min-w-0 w-full sm:min-w-[220px] lg:w-auto">
              <div className="mb-1 flex justify-between text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">
                <span>İlerleme</span>
                <span>{activeIndex + 1}/{steps.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-[640px]">
          <aside className="border-b border-slate-200 bg-white" style={{ padding: "16px 20px" }}>
            <div className="flex gap-3 overflow-x-auto">
              {steps.map((step, index) => {
                const isActive = step.key === activeStep;
                const isDone = index < activeIndex;
                return (
                  <button
                    key={step.key}
                    className={`flex min-w-[150px] items-center gap-3 rounded-lg border text-left text-sm transition sm:min-w-[178px] ${
                      isActive
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : isDone
                          ? "border-green-100 bg-green-50 text-green-700"
                          : "border-transparent text-slate-600 hover:bg-slate-50"
                    }`}
                    style={{ padding: "12px 14px" }}
                    onClick={() => setActiveStep(step.key)}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isActive ? "bg-blue-600 text-white" : isDone ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">{step.icon}{step.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main style={{ padding: "clamp(16px, 4vw, 28px)" }}>
            {activeStep === "identity" && (
              <div className="space-y-8">
                <PanelTitle title="1. Kademe: Temel Ürün Bilgisi" subtitle="Raporlama ve test motoru için ürün kimliği, malzeme bileşimi ve kullanım amacı belirlenir." />
                <div className="grid gap-5 md:grid-cols-3" style={{margin: "10px 0 10px 0"}}>
                  <Field label="Rapor No">
                    <input className="field-input" value={form.reportNo} onChange={event => setForm({ ...form, reportNo: event.target.value })} placeholder="Örn. EL-2026-001" />
                  </Field>
                  <Field label="Ürün Adı">
                    <input className="field-input" value={form.productName} onChange={event => setForm({ ...form, productName: event.target.value })} placeholder="Örn. Sesli peluş oyuncak" />
                  </Field>
                  <Field label="Marka">
                    <input className="field-input" value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} placeholder="Marka / model" />
                  </Field>
                </div>
                <Field label="Malzeme Bileşimi">
                  <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "10px" }}>
                    {materialOptions.map(material => (
                      <button key={material} className={`chip ${form.materials.includes(material) ? "chip-on" : ""}`} onClick={() => toggleMaterial(material)} type="button">
                        {material}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-5 md:grid-cols-2" style={{marginTop: "15px"}}>
                  <Field label="Kullanım Amacı">
                    <select className="field-input" value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })}>
                      {purposeOptions.map(option => <option key={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Not">
                    <textarea className="field-input min-h-[76px] resize-y" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Numune notu, ürün varyantı, özel kullanım bilgisi..." />
                  </Field>
                </div>
              </div>
            )}

            {activeStep === "age" && (
              <div className="space-y-6">
                <PanelTitle title="2. Kademe: Kritik Filtre - Yaş Seçimi" subtitle="Yaş seçimi test motorunun en öncelikli kararıdır. 0-36 ay grubu Madde 5 gerekliliklerini tetikler." />
                <div className="grid gap-5 md:grid-cols-2" style={{marginTop: "10px"}}>
                  <AgeCard
                    active={form.ageGroup === "under36"}
                    title="0 - 36 Ay"
                    subtitle="Küçük parça, boğulma ve yutma riski için en katı kriterler uygulanır."
                    onClick={() => setForm({ ...form, ageGroup: "under36" })}
                  />
                  <AgeCard
                    active={form.ageGroup === "over36"}
                    title="36 Ay ve Üzeri"
                    subtitle="Madde 4 genel gereksinimleri uygulanır; oyuncak tipine göre özel testler eklenir."
                    onClick={() => setForm({ ...form, ageGroup: "over36" })}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "18px", margin: "15px 0 15px 0" }}>
                  <h3 className="mb-3 text-sm font-bold text-slate-900" style={{ marginBottom: "5px" }}>Kritik yaş kırılımları</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <ToggleBox label="10 ay altı" hint="Uzun lifli oyuncaklar için ek kontrol." checked={form.criticalAges.under10} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under10: checked } })} />
                    <ToggleBox label="18 ay altı" hint="İpli/kordonlu oyuncaklarda özel uzunluk riski." checked={form.criticalAges.under18} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under18: checked } })} />
                    <ToggleBox label="8 yaş altı" hint="Mıknatıslı deney setleri için uyarı kırılımı." checked={form.criticalAges.under8} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under8: checked } })} />
                  </div>
                </div>
              </div>
            )}

            {activeStep === "type" && (
              <div className="space-y-6">
                <PanelTitle
                  title="3. Kademe: Oyuncak Tipi ve Fonksiyon"
                  subtitle="EN 71-1 gerekliliklerinden ürüne uygun olanları seçin. Seçilen her gereklilik için Madde + Test Yöntemi satırları Test Listesi'ne otomatik eklenir; bir gereklilik kaldırılırsa o satırlar da kalkar. Manuel eklemeler etkilenmez."
                />
                <RequirementMultiSelect
                  selected={form.selectedRequirements}
                  onToggle={(name) => setForm(current => ({
                    ...current,
                    selectedRequirements: current.selectedRequirements.includes(name)
                      ? current.selectedRequirements.filter(item => item !== name)
                      : [...current.selectedRequirements, name],
                  }))}
                  onClear={() => setForm(current => ({ ...current, selectedRequirements: [] }))}
                />
              </div>
            )}

            {activeStep === "tests" && (
              <div className="space-y-6">
                <PanelTitle title="4. Kademe: Test Listesi" subtitle="EN 71-1 kataloğundan uygulanacak testleri seçerek listeye ekleyin. Tüm seçimler manuel yapılır." />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50" style={{ padding: "14px 16px", margin: "10px 0 10px 0" }}>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900" >Gereklilik kontrol görseli</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Seçilen Madde 4 gereklilikleri için eşleşen {activeRequirementVisuals.length} karar akışı PDFi var.
                    </div>
                  </div>
                  <button type="button" className="rounded-full border border-blue-200 bg-white text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50" style={{ padding: "9px 16px" }} onClick={() => setVisualDialogOpen(current => !current)} disabled={activeRequirementVisuals.length === 0}>
                    {visualDialogOpen ? "Görselleri Gizle" : "Görseli Göster"}
                  </button>
                </div>
                {visualDialogOpen && (
                  <div className="grid gap-3 rounded-xl border border-blue-100 bg-white" style={{ padding: "12px", margin: "10px 0" }}>
                    {activeRequirementVisuals.map(visual => (
                      <a
                        key={visual.id}
                        href={`/api/eurolab/rawdata-requirement-visuals/${visual.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100"
                        style={{ padding: "11px 13px" }}
                      >
                        <span>
                          <span className="block text-sm font-extrabold">Madde {visual.clause}</span>
                          <span className="mt-1 block text-xs text-slate-600">{visual.title || "Gereklilik kontrol görseli"}</span>
                        </span>
                        <span className="text-sm font-bold">PDF Aç</span>
                      </a>
                    ))}
                  </div>
                )}
                <ManualTestCard form={manualTestForm} setForm={setManualTestForm} onAdd={addManualTest} tests={standardTestOptions} />
                <TestTable tests={selectedTests} instructions={instructionMap} onRemoveManual={removeManualTest} />
              </div>
            )}

            {activeStep === "records" && (
              <div className="space-y-6">
                <PanelTitle title="5. Kademe: Veri Girişi ve Hamveri Formu" subtitle="Analist ölçülen değer, karar ve hata gözlemini her test satırı için girer." />
                {saveError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700" style={{ padding: "12px 14px" }}>
                    {saveError}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-5" style={{ marginTop: "10px"}}>
                  <SummaryCard label="Toplam" value={stats.total} />
                  <SummaryCard label="Geçti" value={stats.passed} tone="green" />
                  <SummaryCard label="Kaldı" value={stats.failed} tone="red" />
                  <SummaryCard label="N/A" value={stats.na} />
                  <SummaryCard label="Bekliyor" value={stats.waiting} tone="amber" />
                </div>
                <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" style={{ padding: "8px", marginTop: "10px" }}>
                  <table className="w-full min-w-[760px] border-collapse text-sm sm:min-w-[980px] lg:min-w-[1100px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[0.7rem] uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3">Test</th>
                        <th className="px-4 py-3">Madde</th>
                        <th className="px-4 py-3">Yöntem</th>
                        <th className="px-4 py-3">Açıklama</th>
                        <th className="px-4 py-3">Karar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordRows.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">{row.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.source} - {row.group}</div>
                          </td>
                          <td className="px-4 py-4 align-top text-slate-700"><InstructionLink value={row.clause} instructions={instructionMap} /></td>
                          <td className="px-4 py-4 align-top text-slate-700"><InstructionLink value={enrichMethodCell(row.method)} instructions={instructionMap} /></td>
                          <td className="px-4 py-4 align-top">
                            <input className="field-input h-9 min-w-[260px]" value={row.record.measuredValue} onChange={event => updateRecord(row.id, { measuredValue: event.target.value })} placeholder="Kontrol açıklaması veya gözlem notu" />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <select className={`field-input h-9 min-w-[110px] font-semibold ${decisionClass(row.record.decision)}`} value={row.record.decision} onChange={event => updateRecord(row.id, { decision: event.target.value as TestDecision })}>
                              <option>Bekliyor</option>
                              <option>Geçti</option>
                              <option>Kaldı</option>
                              <option>N/A</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 sm:flex-row sm:justify-between" style={{ paddingTop: "18px" }}>
              <button className="rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40" style={{ padding: "9px 18px" }} onClick={goBack} disabled={activeIndex === 0}>
                Geri
              </button>
              {activeStep === "records" ? (
                <div className="flex flex-wrap gap-3 sm:justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    style={{ padding: "9px 18px" }}
                    onClick={handlePrint}
                    disabled={!rawdataId}
                    title={rawdataId ? "Ç.01.PR.19 formatında DOCX indir" : "Önce kaydedin"}
                  >
                    Yazdır
                  </button>
                  <button type="button" className="rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" style={{ padding: "9px 22px" }} onClick={handleSave} disabled={saving}>
                    {saving ? "Kaydediliyor..." : rawdataId ? "Güncelle" : "Kaydet"}
                  </button>
                </div>
              ) : (
                <button className="rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40" style={{ padding: "9px 22px" }} onClick={goNext} disabled={activeIndex === steps.length - 1}>
                  İleri
                </button>
              )}
            </div>
          </main>
        </div>
      </section>

      <style jsx>{`
        .field-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 0.86rem;
          padding: 10px 12px;
          outline: none;
        }
        .field-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
          background: #ffffff;
        }
        .chip {
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #475569;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 8px 14px;
        }
        .chip-on {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
        }
      `}</style>
    </div>

    <HamveriPrintReport
      reportNo={form.reportNo}
      productName={form.productName}
      brand={form.brand}
      standard="EN 71-1:2026"
      ageGroupLabel={form.ageGroup === "under36" ? "0 - 36 Ay" : form.ageGroup === "over36" ? "36 Ay ve Üzeri" : "-"}
      criticalAges={[
        form.criticalAges.under10 ? "10 ay altı" : "",
        form.criticalAges.under18 ? "18 ay altı" : "",
        form.criticalAges.under8 ? "8 yaş altı" : "",
      ].filter(Boolean)}
      purpose={form.purpose}
      status={testStatus}
      materials={form.materials}
      toyTypes={form.selectedRequirements.length > 0
        ? form.selectedRequirements
        : toyTypeOptions.filter(option => form.toyTypes[option.key]).map(option => option.label)}
      notes={form.notes}
      stats={stats}
      rows={selectedTests.map(test => ({
        id: test.id,
        title: test.title,
        source: test.source,
        group: test.group,
        clause: test.clause,
        method: test.method,
        measuredValue: (records[test.id]?.measuredValue) || "",
        decision: records[test.id]?.decision || "Bekliyor",
      }))}
    />
    </>
  );
}


// Print rapor şablonu için: ./HamveriPrintReport.tsx


function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-200" style={{ paddingBottom: "18px", marginBottom: "2px" }}>
      <h3 className="text-lg font-extrabold leading-7 text-slate-900">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.72rem] font-bold uppercase leading-4 tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AgeCard({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-lg border text-left transition ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"}`}
      style={{ padding: "20px" }}
      onClick={onClick}
    >
      <Ruler className={`mb-3 h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
      <span className="block text-base font-extrabold leading-6 text-slate-900">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-500">{subtitle}</span>
    </button>
  );
}

function ToggleBox({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white transition hover:border-blue-200 hover:bg-blue-50/30" style={{ padding: "16px" }}>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>
        <span className="block text-sm font-bold leading-5 text-slate-900">{label}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function ManualTestCard({
  form,
  setForm,
  onAdd,
  tests,
}: {
  form: ManualTestFormState;
  setForm: React.Dispatch<React.SetStateAction<ManualTestFormState>>;
  onAdd: () => void;
  tests: TestRow[];
}) {
  const selected = tests.find(test => test.id === form.selectedId);
  const chosenMethodLabel = form.methodIds.length > 0 ? formatMethodIds(form.methodIds) : selected?.method || "-";
  const showMethodPicker = Boolean(selected && selected.clause !== "EN 71-2");

  const handleRequirementChange = (selectedId: string) => {
    setForm(current => ({
      ...current,
      selectedId,
      methodIds: [],
    }));
  };

  const toggleMethod = (methodId: string) => {
    setForm(current => ({
      ...current,
      methodIds: current.methodIds.includes(methodId)
        ? current.methodIds.filter(item => item !== methodId)
        : [...current.methodIds, methodId],
    }));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ padding: "18px", marginBottom: "10px" }}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[0.95rem] font-extrabold leading-6 text-slate-900">Harici Gereklilik Ekle</h3>
          <p className="text-[0.82rem] leading-5 text-slate-500">Risk görülen durumlarda EN 71-1 kataloğundan ek kontrol seçin.</p>
        </div>
        <button type="button" className="rounded-full bg-blue-600 text-sm font-semibold leading-5 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" style={{ padding: "10px 20px" }} onClick={onAdd} disabled={!form.selectedId}>
          Gereklilik Ekle
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "14px" }}>
        <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm" style={{ padding: "10px" }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: "2px" }}>
              <span className="text-[0.74rem] font-extrabold uppercase tracking-wide text-slate-500">Test seçimi</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-bold text-slate-500">EN 71-1</span>
            </div>
            <div className="relative rounded-lg border border-slate-300 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
              <select
                aria-label="EN 71-1 test seçimi"
                className="h-11 w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-semibold text-slate-900 outline-none"
                value={form.selectedId}
                onChange={event => handleRequirementChange(event.target.value)}
              >
                <option value="">EN 71-1 test kataloğundan seçin</option>
                {tests.map(test => (
                  <option key={test.id} value={test.id}>{test.clause} - {test.title}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-11 items-center justify-center rounded-r-lg border-l border-slate-200 bg-slate-50 text-sm font-bold text-slate-600">⌄</span>
            </div>
          </div>

          <label className="block rounded-lg border border-slate-200 bg-white shadow-sm" style={{ padding: "10px" }}>
            <span className="block text-[0.74rem] font-extrabold uppercase tracking-wide text-slate-500" style={{ marginBottom: "2px" }}>Ekleme nedeni</span>
            <input
              aria-label="Harici ekleme nedeni"
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={form.reason}
              onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}
              placeholder="Risk notu veya ürün özelliği"
            />
          </label>
        </div>

        {!selected && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white text-[0.82rem] leading-5 text-slate-500" style={{ marginTop: "5px", padding: "11px 12px" }}>
            Seçim yapıldığında madde, yöntem ve test grubu burada özetlenecek.
          </div>
        )}
        {showMethodPicker && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ marginTop: "12px", padding: "18px 20px" }}>
            <div className="text-[0.74rem] font-extrabold uppercase tracking-wide text-slate-500" style={{ marginBottom: "10px" }}>
              Uygulanacak Madde 8 yöntemleri
            </div>
            <MethodMultiSelect
              methodIds={form.methodIds}
              onToggle={toggleMethod}
              onClear={() => setForm(current => ({ ...current, methodIds: [] }))}
            />
          </div>
        )}
      </div>

      {selected && (
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50 text-[0.84rem] leading-5 text-slate-700 md:grid-cols-3" style={{ marginTop: "5px", padding: "12px 14px" }}>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Madde</div>
            <div className="mt-1 font-semibold text-slate-900">{selected.clause}</div>
          </div>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Yöntem</div>
            <div className="mt-1 font-semibold text-slate-900">{chosenMethodLabel}</div>
          </div>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Grup</div>
            <div className="mt-1 font-semibold text-slate-900">{selected.group}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MethodMultiSelect({
  methodIds,
  onToggle,
  onClear,
}: {
  methodIds: string[];
  onToggle: (methodId: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredMethods = normalizedQuery
    ? en71MethodOptions.filter(method => method.label.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    : en71MethodOptions;

  return (
    <div ref={containerRef} className="relative">
      {methodIds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {methodIds.map(methodId => (
            <span
              key={methodId}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[0.72rem] font-bold text-blue-700"
            >
              {methodId}
              <button
                type="button"
                aria-label={`${methodId} yöntemini kaldır`}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100 hover:text-blue-800"
                onClick={() => onToggle(methodId)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white text-left transition focus:outline-none focus:ring-4 ${
          open
            ? "border-blue-500 ring-blue-100"
            : "border-slate-300 hover:border-blue-300"
        }`}
        style={{ padding: "11px 14px" }}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="truncate text-sm font-semibold text-slate-800">
            {methodIds.length > 0
              ? `${methodIds.length} yöntem seçili — eklemek/çıkarmak için tıklayın`
              : "Yöntem seçmek için tıklayın"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200" style={{ padding: "12px 14px" }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Yöntem ara (ör. 8.10, küçük parça)"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                style={{ paddingLeft: "40px", paddingRight: "14px" }}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto" role="listbox" aria-multiselectable="true">
            {filteredMethods.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                <Search className="h-5 w-5 text-slate-300" />
                <div className="text-sm font-semibold text-slate-600">Eşleşen yöntem yok</div>
                <div className="text-xs text-slate-500">Aramayı değiştirin veya temizleyin.</div>
              </div>
            ) : (
              filteredMethods.map(method => {
                const checked = methodIds.includes(method.id);
                return (
                  <label
                    key={method.id}
                    role="option"
                    aria-selected={checked}
                    className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 transition last:border-b-0 ${
                      checked ? "bg-blue-50/70" : "hover:bg-slate-50"
                    }`}
                    style={{ padding: "10px 14px" }}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-blue-600"
                      checked={checked}
                      onChange={() => onToggle(method.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold text-slate-800">
                      {method.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50" style={{ padding: "12px 16px" }}>
            <span className="text-xs font-semibold text-slate-600">
              {methodIds.length} seçili · {filteredMethods.length} sonuç
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ padding: "8px 18px" }}
                onClick={onClear}
                disabled={methodIds.length === 0}
              >
                Temizle
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                style={{ padding: "8px 20px" }}
                onClick={() => setOpen(false)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InstructionLink({ value, instructions }: { value: string; instructions: Record<string, InstructionRow> }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(instructionNumberPattern)) {
    const number = match[0];
    const index = match.index || 0;
    if (index > lastIndex) parts.push(value.slice(lastIndex, index));

    const instruction = instructions[instructionKey(number)];
    parts.push(instruction ? (
      <a
        key={`${number}-${index}`}
        href={`/api/eurolab/rawdata-instructions/${instruction.id}/file`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex rounded-md bg-blue-50 px-2 py-1 font-bold text-blue-700 underline underline-offset-2 hover:bg-blue-100 hover:text-blue-800"
        title={instruction.title || "Analiz talimatı PDF"}
      >
        {number}
      </a>
    ) : number);
    lastIndex = index + number.length;
  }

  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return <span className="inline-flex flex-wrap items-center gap-1">{parts.length ? parts : value}</span>;
}

function TestTable({ tests, instructions, onRemoveManual }: { tests: TestRow[]; instructions: Record<string, InstructionRow>; onRemoveManual: (testId: string) => void }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" style={{ padding: "10px" }}>
      <table className="w-full min-w-[760px] border-collapse text-sm sm:min-w-[920px] lg:min-w-[1050px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[0.76rem] font-bold uppercase leading-5 tracking-wide text-slate-500">
            <th className="px-4 py-4" style={{ width: 300 }}>Test</th>
            <th className="px-4 py-4" style={{ width: 140 }}>Madde</th>
            <th className="px-4 py-4" style={{ width: 260 }}>Yöntem</th>
            <th className="px-4 py-4">Ekleme Nedeni</th>
            <th className="px-4 py-4 text-right" style={{ width: 90 }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {tests.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm italic text-slate-500">
                Henüz test eklenmedi. Yukarıdaki katalogdan seçim yapıp &quot;Gereklilik Ekle&quot; diyerek listeye ekleyin.
              </td>
            </tr>
          ) : tests.map(test => (
            <tr key={test.id} className="border-b border-slate-100 text-sm leading-6 last:border-b-0">
              <td className="px-4 py-4 align-top">
                <div className="font-semibold leading-6 text-slate-900">{test.title}</div>
                <div className="mt-1 text-[0.78rem] leading-5 text-slate-500">{test.group}</div>
              </td>
              <td className="px-4 py-4 align-top text-slate-700"><InstructionLink value={test.clause} instructions={instructions} /></td>
              <td className="px-4 py-4 align-top text-slate-700"><InstructionLink value={enrichMethodCell(test.method)} instructions={instructions} /></td>
              <td className="px-4 py-4 align-top text-[0.82rem] leading-6 text-slate-500">{test.reason}</td>
              <td className="px-4 py-4 align-top text-right">
                {test.source === "Harici" && (
                  <button type="button" className="rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100" style={{ padding: "6px 11px" }} onClick={() => onRemoveManual(test.id)}>
                    Sil
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequirementMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = normalizedQuery
    ? gereklilikNames.filter(name => name.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    : gereklilikNames;

  const countByRequirement = (name: string) =>
    gereklilikDataset.filter(row => row.gereklilik === name).length;

  return (
    <div ref={containerRef} className="relative">
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selected.map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[0.78rem] font-bold text-blue-700"
            >
              {name}
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-200/70 px-1.5 text-[0.66rem] text-blue-800">
                {countByRequirement(name)}
              </span>
              <button
                type="button"
                aria-label={`${name} gerekliliğini kaldır`}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-500 hover:bg-blue-100 hover:text-blue-800"
                onClick={() => onToggle(name)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white text-left transition focus:outline-none focus:ring-4 ${
          open
            ? "border-blue-500 ring-blue-100"
            : "border-slate-300 hover:border-blue-300"
        }`}
        style={{ padding: "12px 16px" }}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Shapes className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="truncate text-sm font-semibold text-slate-800">
            {selected.length > 0
              ? `${selected.length} gereklilik seçili — eklemek/çıkarmak için tıklayın`
              : "Gereklilik seçmek için tıklayın"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200" style={{ padding: "12px 14px" }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Gereklilik ara (ör. Cam, Mıknatıs, Küçük Toplar)"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                style={{ paddingLeft: "40px", paddingRight: "14px" }}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                <Search className="h-5 w-5 text-slate-300" />
                <div className="text-sm font-semibold text-slate-600">Eşleşen gereklilik yok</div>
              </div>
            ) : (
              filtered.map(name => {
                const checked = selected.includes(name);
                const count = countByRequirement(name);
                return (
                  <label
                    key={name}
                    role="option"
                    aria-selected={checked}
                    className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 transition last:border-b-0 ${
                      checked ? "bg-blue-50/70" : "hover:bg-slate-50"
                    }`}
                    style={{ padding: "10px 14px" }}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-blue-600"
                      checked={checked}
                      onChange={() => onToggle(name)}
                    />
                    <span className="min-w-0 flex-1 text-[0.84rem] font-semibold text-slate-800">{name}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[0.66rem] font-bold text-slate-600">
                      {count} satır
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50" style={{ padding: "12px 16px" }}>
            <span className="text-xs font-semibold text-slate-600">
              {selected.length} seçili · {filtered.length} sonuç
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ padding: "8px 18px" }}
                onClick={onClear}
                disabled={selected.length === 0}
              >
                Temizle
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                style={{ padding: "8px 20px" }}
                onClick={() => setOpen(false)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" | "amber" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    green: "border-green-200 bg-green-50 text-green-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone]}`}>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="mt-1 text-[0.7rem] font-bold uppercase tracking-wide">{label}</div>
    </div>
  );
}
