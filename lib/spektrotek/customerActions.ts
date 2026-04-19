'use server';

import poolPromise from '@/lib/db';
import type { SktCustomer } from './types';

export type CustomerFilter = {
  search?: string;
  status?: string;
  page: number;
  limit: number;
};

type CustomerRow = {
  ID: number;
  Ad?: string | null;
  Tur2?: string | null;
  Yetkili?: string | null;
  Telefon?: string | null;
  Email?: string | null;
  Web?: string | null;
  Adres?: string | null;
  VergiDairesi?: string | null;
  VergiNo?: string | null;
  Notlar?: string | null;
  Durum?: string | null;
};

export async function getCustomers(filter: CustomerFilter = { page: 1, limit: 15, status: 'Active' }) {
  try {
    const pool = await poolPromise;

    let where = "Kimin = 'Spektrotek'";

    if (filter.search) {
      where += ` AND (Ad LIKE @search OR Yetkili LIKE @search OR Telefon LIKE @search OR Email LIKE @search)`;
    }
    if (filter.status && filter.status !== 'All') {
      const statusVal = filter.status === 'Passive' ? 'Pasif' : 'Aktif';
      where += ` AND Durum = @status`;
      // We'll bind below
      void statusVal;
    } else if (!filter.status) {
      where += ` AND Durum = 'Aktif'`;
    }

    const offset = (filter.page - 1) * filter.limit;

    const req = pool.request()
      .input('offset', offset)
      .input('limit', filter.limit);

    if (filter.search) req.input('search', `%${filter.search}%`);
    if (filter.status && filter.status !== 'All') {
      req.input('status', filter.status === 'Passive' ? 'Pasif' : 'Aktif');
    }

    const countReq = pool.request();
    if (filter.search) countReq.input('search', `%${filter.search}%`);
    if (filter.status && filter.status !== 'All') {
      countReq.input('status', filter.status === 'Passive' ? 'Pasif' : 'Aktif');
    }

    const [data, count] = await Promise.all([
      req.query(`SELECT ID, Ad, Tur2, Yetkili, Telefon, Email, Web, Adres, VergiDairesi, VergiNo, Notlar, Durum
        FROM RootTedarikci WITH (NOLOCK) WHERE ${where}
        ORDER BY Ad ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`),
      countReq.query(`SELECT COUNT(*) as total FROM RootTedarikci WITH (NOLOCK) WHERE ${where}`),
    ]);

    const customers: SktCustomer[] = (data.recordset as CustomerRow[]).map((r) => ({
      id: r.ID.toString(),
      name: r.Ad || 'İsimsiz',
      type: r.Tur2 || 'Tedarikçi',
      phone: r.Telefon || '',
      email: r.Email || '',
      web: r.Web || '',
      address: r.Adres || '',
      authorizedPerson: r.Yetkili || '',
      taxOffice: r.VergiDairesi || '',
      taxNumber: r.VergiNo || '',
      notes: r.Notlar || '',
      status: r.Durum === 'Pasif' ? 'Passive' : 'Active',
    }));

    return { customers, totalCount: count.recordset[0].total as number };
  } catch (e) {
    console.error('getCustomers error:', e);
    return { customers: [], totalCount: 0 };
  }
}

export async function addCustomer(data: Partial<SktCustomer>) {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('Ad', data.name)
      .input('Tur2', data.type)
      .input('Yetkili', data.authorizedPerson)
      .input('Telefon', data.phone)
      .input('Email', data.email)
      .input('Web', data.web)
      .input('Adres', data.address)
      .input('VergiDairesi', data.taxOffice)
      .input('VergiNo', data.taxNumber)
      .input('Notlar', data.notes)
      .query(`INSERT INTO RootTedarikci(Ad, Tur2, Yetkili, Telefon, Email, Web, Adres, VergiDairesi, VergiNo, Notlar, Kimin, Durum)
              VALUES(@Ad, @Tur2, @Yetkili, @Telefon, @Email, @Web, @Adres, @VergiDairesi, @VergiNo, @Notlar, 'Spektrotek', 'Aktif');
              SELECT SCOPE_IDENTITY() as newId`);
    const idResult = await pool.request().query(`SELECT TOP 1 ID FROM RootTedarikci WHERE Kimin='Spektrotek' ORDER BY ID DESC`);
    const customerId = idResult.recordset[0]?.ID?.toString();
    return { success: true, customerId };
  } catch (e) {
    console.error('addCustomer error:', e);
    return { success: false, customerId: undefined };
  }
}

export async function updateCustomer(id: string, data: Partial<SktCustomer>) {
  try {
    const pool = await poolPromise;
    const req = pool.request().input('ID', id);
    const updates: string[] = [];
    if (data.name !== undefined)             { req.input('Ad', data.name); updates.push('Ad=@Ad'); }
    if (data.type !== undefined)             { req.input('Tur2', data.type); updates.push('Tur2=@Tur2'); }
    if (data.authorizedPerson !== undefined) { req.input('Yetkili', data.authorizedPerson); updates.push('Yetkili=@Yetkili'); }
    if (data.phone !== undefined)            { req.input('Telefon', data.phone); updates.push('Telefon=@Telefon'); }
    if (data.email !== undefined)            { req.input('Email', data.email); updates.push('Email=@Email'); }
    if (data.web !== undefined)              { req.input('Web', data.web); updates.push('Web=@Web'); }
    if (data.address !== undefined)          { req.input('Adres', data.address); updates.push('Adres=@Adres'); }
    if (data.taxOffice !== undefined)        { req.input('VergiDairesi', data.taxOffice); updates.push('VergiDairesi=@VergiDairesi'); }
    if (data.taxNumber !== undefined)        { req.input('VergiNo', data.taxNumber); updates.push('VergiNo=@VergiNo'); }
    if (data.notes !== undefined)            { req.input('Notlar', data.notes); updates.push('Notlar=@Notlar'); }
    if (data.status !== undefined) {
      req.input('Durum', data.status === 'Passive' ? 'Pasif' : 'Aktif');
      updates.push('Durum=@Durum');
    }
    if (updates.length > 0) {
      await req.query(`UPDATE RootTedarikci SET ${updates.join(',')} WHERE ID=@ID`);
    }
    return { success: true };
  } catch (e) {
    console.error('updateCustomer error:', e);
    return { success: false };
  }
}

export async function deleteCustomer(id: string) {
  return updateCustomer(id, { status: 'Passive' });
}
