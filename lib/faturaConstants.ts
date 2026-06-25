// Ödeme durumu aşamaları — kaynak: cosmo `Odeme` tablosu (Evrak_No bazlı, append-only;
// güncel durum = en son ID'li satırın Odeme_Durumu'su). numune-takip "Ödeme" sütunu da
// aynı tablodan beslenir. Proforma faturalaşınca 'Ödeme Bekliyor' yazılır, ödeme alınınca
// 'Ödendi'. Değerler DB'deki gerçek (legacy) yazımlarla birebir aynı olmalı.
export const ODEME_DURUMLARI = ["Ödeme Bekliyor", "Kısmen Ödendi", "Ödendi", "İptal"];
