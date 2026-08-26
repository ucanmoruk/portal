// Doküman yönetimi yetki anahtarları ve tek noktadan yetki hesabı.
// Menü ağacındaki (lib/menuConfig.ts) sanal anahtarlarla birebir eşleşir.

import type { PortalUser } from "@/lib/portalYetki";

export const DOKUMAN_YETKI = {
  goruntule: "laboratuvar.kys.dokuman-yonetimi",
  olustur: "laboratuvar.kys.dokuman-yonetimi.olustur",
  duzenle: "laboratuvar.kys.dokuman-yonetimi.duzenle",
  kontrol: "laboratuvar.kys.dokuman-yonetimi.kontrol",
  onayla: "laboratuvar.kys.dokuman-yonetimi.onayla",
} as const;

export type DokumanYetkiOzeti = {
  goruntule: boolean;
  olustur: boolean;
  duzenle: boolean;
  kontrol: boolean;
  onayla: boolean;
  sil: boolean;
  isAdmin: boolean;
};

/**
 * Yazma yetkileri (oluştur/düzenle) modül erişimine de düşer: modüle erişimi olan
 * kullanıcı taslak hazırlayabilir. Onay yetkileri (kontrol/yayın) ise SADECE ilgili
 * sanal anahtar atanmışsa verilir — görev ayrılığı korunur.
 */
export function dokumanYetkileri(user: PortalUser): DokumanYetkiOzeti {
  const goruntule = user.can(DOKUMAN_YETKI.goruntule);
  const olustur = user.can(DOKUMAN_YETKI.olustur) || goruntule;
  const duzenle = user.can(DOKUMAN_YETKI.duzenle) || goruntule;
  return {
    goruntule,
    olustur,
    duzenle,
    kontrol: user.can(DOKUMAN_YETKI.kontrol),
    onayla: user.can(DOKUMAN_YETKI.onayla),
    sil: user.isAdmin || user.can(DOKUMAN_YETKI.onayla),
    isAdmin: user.isAdmin,
  };
}

/** Bir aksiyonun gerektirdiği anahtarlardan en az birine sahip mi? */
export function aksiyonaIzinVar(user: PortalUser, yetkiKeys: string[]): boolean {
  const ozet = dokumanYetkileri(user);
  return yetkiKeys.some(key => {
    if (key === DOKUMAN_YETKI.kontrol) return ozet.kontrol;
    if (key === DOKUMAN_YETKI.onayla) return ozet.onayla;
    if (key === DOKUMAN_YETKI.duzenle) return ozet.duzenle;
    if (key === DOKUMAN_YETKI.olustur) return ozet.olustur;
    if (key === DOKUMAN_YETKI.goruntule) return ozet.goruntule;
    return user.can(key);
  });
}
