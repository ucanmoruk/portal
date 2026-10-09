export const requestStatuses = ["Talep oluşturuldu", "İşleme Alındı", "Tamamlandı"] as const;
export type RequestStatus = typeof requestStatuses[number];
export type RequestSource = "spektrotek" | "uniqueanalyse";
export type RequestFields = { type: string; company: string; name: string; email: string; phone: string; subject: string; body: string };
export type CustomerRequest = RequestFields & { number: string; source: RequestSource; status: RequestStatus; createdAt: string };
export type RequestMessage = { id: string; role: "customer" | "staff"; text: string; createdAt: string; files: { name: string; size: number }[] };
