export const KYS_REQUEST_COMPANIES = {
  Spektrotek: {
    name: "Spektrotek Laboratuvar Cihazları Paz. Pro. ve Dan. A.Ş.",
    address: "Atatürk Mah. Hadımköy Yolu Cad. No:10 / 7 Esenyurt İstanbul - Turkey",
    website: "www.spektrotek.com", email: "info@spektrotek.com", phone: "+90 212 706 10 76",
    logo: "/spektrotek-logo.png", width: 2364, height: 539,
  },
  Root: {
    name: "Root Kozmetik A.Ş.",
    address: "Atatürk Mah. Hadımköy Yolu Cad. No:10 / 7 Esenyurt İstanbul - Turkey",
    website: "www.rootkozmetik.com", email: "info@rootkozmetik.com", phone: "+90 212 909 82 08",
    logo: "/root-logo.png", width: 1250, height: 975,
  },
} as const;

export function kysRequestCompany(series: string) {
  return series === "Root" ? KYS_REQUEST_COMPANIES.Root : series === "Spektrotek" ? KYS_REQUEST_COMPANIES.Spektrotek : null;
}
