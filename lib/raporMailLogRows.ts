export type MailLogRow = {
  LogID: string; NkrID: number; RaporFormati: string | null; EvrakNo: string | null;
  FirmaAdi: string | null; MailAdresi: string; GonderimTarihi: string | null;
  Durum: string; Aciklama: string | null; Gonderen: string | null; MessageId: string | null; DeliveryKey?: string;
};
export type MailDeliveryRow = MailLogRow & { RaporSayisi: number };

/** SMTP message IDs identify a send, including all reports attached to it.
 * Logs without an ID remain separate: matching recipients/dates is not proof of one send. */
export function mailDeliveryRows(rows: MailLogRow[]): MailDeliveryRow[] {
  const groups = new Map<string, MailLogRow[]>();
  for (const row of rows) {
    const key = row.DeliveryKey || row.MessageId || row.LogID;
    const group = groups.get(key) || [];
    group.push(row); groups.set(key, group);
  }
  const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))].join(", ") || null;
  return [...groups.values()].map(group => ({
    ...group[0],
    EvrakNo: unique(group.map(row => row.EvrakNo || `NKR ${row.NkrID}`)),
    FirmaAdi: unique(group.map(row => row.FirmaAdi)),
    RaporFormati: unique(group.map(row => row.RaporFormati)),
    Aciklama: unique(group.map(row => row.Aciklama)),
    RaporSayisi: group.length,
  }));
}
