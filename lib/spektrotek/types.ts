export interface SktCustomer {
  id: string;
  name: string;
  type: string;
  phone: string;
  email: string;
  web?: string;
  address: string;
  taxNumber?: string;
  taxOffice?: string;
  authorizedPerson?: string;
  notes?: string;
  status: 'Active' | 'Passive';
}

export interface SktProduct {
  id: string;
  code: string;
  category: string;
  brand: string;
  name: string;
  stock: number;
  unit: string;
  sellPrice: number;
  currency: string;
  vat: number | null;
}

export interface SktRequest {
  dbId?: string;
  id: string | number;
  priority: string;
  dateCreated: string;
  contactType: string;
  customerId: string;
  customerName?: string;
  assigneeName?: string;
  category: string;
  distributor: string;
  subject: string;
  description: string;
  assigneeId?: string;
  status: string;
}

export interface SktQuoteItem {
  id: string;
  quoteId: string;
  productId: number;
  productName?: string;
  productCode?: string;
  description?: string;
  brand?: string;
  quantity: number;
  unit: string;
  price: number;
  vatRate: number;
  amount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface SktQuote {
  id: string;
  quoteNo: number | null;
  rev: number | null;
  requestId: number | null;
  requestDisplayNo?: string | number;
  date: Date;
  customerId: number | null;
  customerName?: string;
  customerAddress?: string;
  customerEmail?: string;
  salesPersonId?: number | null;
  salesPersonName?: string;
  amount: number | null;
  status: string;
  currency: string | null;
  notes?: string;
  discount?: number | null;
  items?: SktQuoteItem[];
}

export interface SktTicket {
  id: string;
  customerId: string;
  productId: string;
  status: 'Açık' | 'İşlemde' | 'Parça Bekliyor' | 'Kapalı';
  priority: 'Düşük' | 'Orta' | 'Yüksek' | 'Kritik';
  subject: string;
  dateCreated: string;
}

export interface SktInvoice {
  id: string;
  customerId: string;
  quoteId?: string;
  amount: number;
  currency: string;
  dateIssued: string;
  dueDate: string;
  status: 'Ödendi' | 'Bekliyor' | 'Gecikmiş';
}

export interface SktPurchase {
  id: string;
  supplier: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
}

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  [key: string]: number;
}
