'use server';

import poolPromise from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { SktRequest } from './types';

export type RequestFilter = {
  search?: string;
  status?: string;
  priority?: string;
  year?: number;
  page: number;
  limit: number;
};

type RequestRow = {
  id: string | number;
  dbId?: number | null;
  priority?: string | null;
  dateCreated?: Date | string | null;
  contactType?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  category?: string | null;
  distributor?: string | null;
  subject?: string | null;
  description?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  assigneeSurname?: string | null;
  status?: string | null;
};

type UserRow = {
  ID: number;
  Ad?: string | null;
  Soyad?: string | null;
};

export type RequestNote = {
  id?: string;
  note: string;
  date: Date | string;
  userId?: string;
  userName: string;
};

type RequestNoteRow = {
  ID?: number | null;
  note?: string | null;
  date?: Date | string | null;
  userId?: number | null;
  userName?: string | null;
};

export async function getRequests(filter: RequestFilter = { page: 1, limit: 15 }) {
  try {
    const pool = await poolPromise;
    let where = '1=1';

    const req = pool.request();
    const countReq = pool.request();

    if (filter.search) {
      req.input('search', `%${filter.search}%`);
      countReq.input('search', `%${filter.search}%`);
      where += ` AND (CAST(t.TalepNo AS NVARCHAR) LIKE @search OR t.Kaynak LIKE @search OR t.Detay LIKE @search OR c.Ad LIKE @search)`;
    }
    if (filter.status) {
      req.input('status', filter.status);
      countReq.input('status', filter.status);
      where += ` AND t.Durum = @status`;
    }
    if (filter.priority) {
      req.input('priority', filter.priority);
      countReq.input('priority', filter.priority);
      where += ` AND t.Onem = @priority`;
    }
    if (filter.year) {
      req.input('year', filter.year);
      countReq.input('year', filter.year);
      where += ` AND YEAR(t.Tarih) = @year`;
    }

    const offset = (filter.page - 1) * filter.limit;
    req.input('offset', offset).input('limit', filter.limit);

    const [data, count] = await Promise.all([
      req.query(`
        SELECT t.TalepNo as id, t.ID as dbId, t.Onem as priority, t.Tarih as dateCreated,
               t.Tur as contactType, t.FirmaID as customerId, c.Ad as customerName,
               t.Kategori as category, t.Distributor as distributor,
               t.Kaynak as subject, t.Detay as description,
               t.AtananID as assigneeId,
               u.Ad as assigneeName, u.Soyad as assigneeSurname,
               t.Durum as status
        FROM STalepListe t WITH (NOLOCK)
        LEFT JOIN RootTedarikci c WITH (NOLOCK) ON t.FirmaID = c.ID
        LEFT JOIN RootKullanici u WITH (NOLOCK) ON t.AtananID = u.ID
        WHERE ${where}
        ORDER BY t.TalepNo DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
      countReq.query(`
        SELECT COUNT(*) as total FROM STalepListe t WITH (NOLOCK)
        LEFT JOIN RootTedarikci c WITH (NOLOCK) ON t.FirmaID = c.ID
        WHERE ${where}
      `),
    ]);

    const requests: SktRequest[] = (data.recordset as RequestRow[]).map((r) => ({
      id: r.id,
      dbId: r.dbId?.toString(),
      priority: r.priority || 'Orta',
      dateCreated: r.dateCreated ? new Date(r.dateCreated).toISOString().split('T')[0] : '',
      contactType: r.contactType || 'Telefon',
      customerId: r.customerId?.toString() || '',
      customerName: r.customerName || 'Bilinmiyor',
      category: r.category || 'Diğer',
      distributor: r.distributor || 'Diğer',
      subject: r.subject || '',
      description: r.description || '',
      assigneeId: r.assigneeId?.toString() || '',
      assigneeName: r.assigneeName ? `${r.assigneeName} ${r.assigneeSurname || ''}`.trim() : 'Bilinmiyor',
      status: (r.status || 'Yeni Talep').trim(),
    }));

    return { requests, totalCount: count.recordset[0].total as number };
  } catch (e) {
    console.error('getRequests error:', e);
    return { requests: [], totalCount: 0 };
  }
}

export async function getRequest(id: string): Promise<SktRequest | null> {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT t.TalepNo as id, t.ID as dbId, t.Onem as priority, t.Tarih as dateCreated,
               t.Tur as contactType, t.FirmaID as customerId, c.Ad as customerName,
               t.Kategori as category, t.Distributor as distributor,
               t.Kaynak as subject, t.Detay as description,
               t.AtananID as assigneeId,
               u.Ad as assigneeName, u.Soyad as assigneeSurname,
               t.Durum as status
        FROM STalepListe t WITH (NOLOCK)
        LEFT JOIN RootTedarikci c WITH (NOLOCK) ON t.FirmaID = c.ID
        LEFT JOIN RootKullanici u WITH (NOLOCK) ON t.AtananID = u.ID
        WHERE t.TalepNo = @id
      `);
    const r = result.recordset[0];
    if (!r) return null;
    return {
      id: r.id, dbId: r.dbId?.toString(),
      priority: r.priority || 'Orta',
      dateCreated: r.dateCreated ? new Date(r.dateCreated).toISOString().split('T')[0] : '',
      contactType: r.contactType || 'Telefon',
      customerId: r.customerId?.toString() || '',
      customerName: r.customerName || 'Bilinmiyor',
      category: r.category || 'Diğer',
      distributor: r.distributor || 'Diğer',
      subject: r.subject || '',
      description: r.description || '',
      assigneeId: r.assigneeId?.toString() || '',
      assigneeName: r.assigneeName ? `${r.assigneeName} ${r.assigneeSurname || ''}`.trim() : 'Bilinmiyor',
      status: (r.status || 'Yeni Talep').trim(),
    };
  } catch (e) {
    console.error('getRequest error:', e);
    return null;
  }
}

export async function getUsers() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ID, Ad, Soyad FROM RootKullanici WITH (NOLOCK) WHERE Durum='Aktif' ORDER BY Ad ASC
    `);
    return (result.recordset as UserRow[]).map((r) => ({ id: r.ID.toString(), name: `${r.Ad || ''} ${r.Soyad || ''}`.trim() }));
  } catch {
    return [];
  }
}

export async function createRequest(data: Partial<SktRequest>) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.userId ? parseInt(session.user.userId) : 1;
    const pool = await poolPromise;

    const maxResult = await pool.request().query(`SELECT MAX(TalepNo) as maxNo FROM STalepListe`);
    const nextNo = maxResult.recordset[0].maxNo ? parseInt(maxResult.recordset[0].maxNo, 10) + 1 : 1;

    const assigneeId = data.assigneeId ? parseInt(String(data.assigneeId), 10) : userId;
    const customerId = data.customerId ? parseInt(String(data.customerId), 10) : null;

    await pool.request()
      .input('TalepNo', nextNo)
      .input('Onem', data.priority)
      .input('Tarih', data.dateCreated)
      .input('OlusturanID', userId)
      .input('Tur', data.contactType)
      .input('FirmaID', customerId)
      .input('Kategori', data.category)
      .input('Distributor', data.distributor)
      .input('Kaynak', data.subject)
      .input('Detay', data.description)
      .input('AtananID', isNaN(assigneeId) ? 1 : assigneeId)
      .input('Durum', data.status || 'Yeni Talep')
      .input('GenelDurum', 'Açık')
      .query(`INSERT INTO STalepListe (TalepNo, Onem, Tarih, OlusturanID, Tur, FirmaID, Kategori, Distributor, Kaynak, Detay, AtananID, Durum, GenelDurum)
              VALUES (@TalepNo, @Onem, @Tarih, @OlusturanID, @Tur, @FirmaID, @Kategori, @Distributor, @Kaynak, @Detay, @AtananID, @Durum, @GenelDurum)`);

    return { success: true, id: nextNo };
  } catch (e) {
    console.error('createRequest error:', e);
    return { success: false };
  }
}

export async function updateRequest(id: string, data: Partial<SktRequest>) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.userId ? parseInt(session.user.userId) : 1;
    const pool = await poolPromise;

    const req = pool.request().input('ID', id);
    const updates: string[] = [];
    if (data.priority)    { req.input('Onem', data.priority); updates.push('Onem=@Onem'); }
    if (data.dateCreated) { req.input('Tarih', data.dateCreated); updates.push('Tarih=@Tarih'); }
    if (data.contactType) { req.input('Tur', data.contactType); updates.push('Tur=@Tur'); }
    if (data.customerId)  { req.input('FirmaID', parseInt(data.customerId, 10)); updates.push('FirmaID=@FirmaID'); }
    if (data.category)    { req.input('Kategori', data.category); updates.push('Kategori=@Kategori'); }
    if (data.distributor) { req.input('Distributor', data.distributor); updates.push('Distributor=@Distributor'); }
    if (data.subject)     { req.input('Kaynak', data.subject); updates.push('Kaynak=@Kaynak'); }
    if (data.description) { req.input('Detay', data.description); updates.push('Detay=@Detay'); }
    if (data.assigneeId)  { req.input('AtananID', parseInt(data.assigneeId, 10)); updates.push('AtananID=@AtananID'); }
    if (data.status)      { req.input('Durum', data.status); updates.push('Durum=@Durum'); }

    if (updates.length > 0) {
      await req.query(`UPDATE STalepListe SET ${updates.join(',')} WHERE TalepNo=@ID`);

      if (data.status) {
        await pool.request()
          .input('TalepID', id)
          .input('YetkiliID', userId)
          .input('Tarih', new Date())
          .input('Notlar', `Durum güncellendi: ${data.status}`)
          .query(`INSERT INTO STalepNot (TalepID, YetkiliID, Tarih, Notlar) VALUES (@TalepID, @YetkiliID, @Tarih, @Notlar)`);
      }
    }
    return { success: true };
  } catch (e) {
    console.error('updateRequest error:', e);
    return { success: false };
  }
}

export async function getRequestNotes(requestId: string): Promise<RequestNote[]> {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('requestId', requestId)
      .query(`
        SELECT N.ID, N.Notlar as note, N.Tarih as date, N.YetkiliID as userId,
               U.Ad + ' ' + U.Soyad as userName
        FROM STalepNot N WITH (NOLOCK)
        LEFT JOIN RootKullanici U WITH (NOLOCK) ON N.YetkiliID = U.ID
        WHERE N.TalepID = @requestId ORDER BY N.Tarih DESC
      `);
    return (result.recordset as RequestNoteRow[]).map((r) => ({
      id: r.ID?.toString(),
      note: r.note || '',
      date: r.date || '',
      userId: r.userId?.toString(),
      userName: r.userName || 'Bilinmiyor',
    }));
  } catch {
    return [];
  }
}

export async function addRequestNote(requestId: string, note: string) {
  const trimmedNote = note.trim();
  if (!trimmedNote) return { success: false, error: 'Not boş olamaz.' };

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.userId ? parseInt(session.user.userId, 10) : 1;
    const pool = await poolPromise;

    await pool.request()
      .input('TalepID', requestId)
      .input('YetkiliID', userId)
      .input('Tarih', new Date())
      .input('Notlar', trimmedNote)
      .query(`INSERT INTO STalepNot (TalepID, YetkiliID, Tarih, Notlar) VALUES (@TalepID, @YetkiliID, @Tarih, @Notlar)`);

    return { success: true };
  } catch (e) {
    console.error('addRequestNote error:', e);
    return { success: false, error: 'Not kaydedilemedi.' };
  }
}
