'use server';

import poolPromise from '@/lib/db';
import mssql from 'mssql';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { SktQuote, SktQuoteItem } from './types';

export type QuoteFilter = {
  search?: string;
  status?: string;
  page: number;
  limit: number;
};

export async function getQuotes(filter: QuoteFilter = { page: 1, limit: 15 }) {
  try {
    const pool = await poolPromise;
    let where = "Q.Durum = 'Aktif'";

    const req = pool.request();
    const countReq = pool.request();

    if (filter.search) {
      req.input('search', `%${filter.search}%`);
      countReq.input('search', `%${filter.search}%`);
      where += ` AND (CAST(Q.TeklifNo as NVARCHAR) LIKE @search OR C.Ad LIKE @search OR Q.GenelDurum LIKE @search)`;
    }
    if (filter.status) {
      req.input('status', filter.status);
      countReq.input('status', filter.status);
      where += ` AND Q.GenelDurum = @status`;
    }

    const offset = (filter.page - 1) * filter.limit;
    req.input('offset', offset).input('limit', filter.limit);

    const [data, count] = await Promise.all([
      req.query(`
        SELECT Q.ID, Q.TeklifNo, Q.Rev, Q.TalepNo as TalepID, T.TalepNo as GercekTalepNo,
               Q.Tarih, Q.FirmaID, Q.YetkiliID, Q.Toplam, Q.GenelDurum, Q.ParaBirimi,
               Q.TeklifNot, Q.Iskonto, C.Adres as FirmaAdres, C.Ad as FirmaAdi,
               U.Ad + ' ' + U.Soyad as YetkiliAdi
        FROM STeklifListe Q WITH (NOLOCK)
        LEFT JOIN RootTedarikci C WITH (NOLOCK) ON Q.FirmaID = C.ID
        LEFT JOIN RootKullanici U WITH (NOLOCK) ON Q.YetkiliID = U.ID
        LEFT JOIN STalepListe T WITH (NOLOCK) ON T.ID = Q.TalepNo
        WHERE ${where} ORDER BY Q.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
      countReq.query(`
        SELECT COUNT(*) as total FROM STeklifListe Q WITH (NOLOCK)
        LEFT JOIN RootTedarikci C WITH (NOLOCK) ON Q.FirmaID = C.ID
        WHERE ${where}
      `),
    ]);

    const quotes: SktQuote[] = data.recordset.map((r: any) => ({
      id: r.ID.toString(),
      quoteNo: r.TeklifNo,
      rev: r.Rev,
      requestId: r.TalepID,
      requestDisplayNo: r.GercekTalepNo,
      date: r.Tarih,
      customerId: r.FirmaID,
      customerName: r.FirmaAdi || '-',
      customerAddress: r.FirmaAdres || '',
      salesPersonId: r.YetkiliID,
      salesPersonName: r.YetkiliAdi || '-',
      amount: r.Toplam,
      status: r.GenelDurum || 'Yeni Teklif',
      currency: r.ParaBirimi,
      notes: r.TeklifNot,
      discount: r.Iskonto,
    }));

    return { quotes, totalCount: count.recordset[0].total as number };
  } catch (e) {
    console.error('getQuotes error:', e);
    return { quotes: [], totalCount: 0 };
  }
}

export async function getQuote(id: string): Promise<SktQuote | null> {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', id).query(`
      SELECT Q.ID, Q.TeklifNo, Q.Rev, Q.TalepNo as TalepID, T.TalepNo as GercekTalepNo,
             Q.Tarih, Q.FirmaID, Q.YetkiliID, Q.Toplam, Q.GenelDurum, Q.ParaBirimi,
             Q.TeklifNot, Q.Iskonto, C.Adres as FirmaAdres, C.Ad as FirmaAdi,
             C.Email as FirmaEmail, U.Ad + ' ' + U.Soyad as YetkiliAdi
      FROM STeklifListe Q WITH (NOLOCK)
      LEFT JOIN RootTedarikci C WITH (NOLOCK) ON Q.FirmaID = C.ID
      LEFT JOIN RootKullanici U WITH (NOLOCK) ON Q.YetkiliID = U.ID
      LEFT JOIN STalepListe T WITH (NOLOCK) ON T.ID = Q.TalepNo
      WHERE Q.ID = @id
    `);
    if (!result.recordset.length) return null;
    const r = result.recordset[0];
    return {
      id: r.ID.toString(), quoteNo: r.TeklifNo, rev: r.Rev,
      requestId: r.TalepID, requestDisplayNo: r.GercekTalepNo,
      date: r.Tarih, customerId: r.FirmaID,
      customerName: r.FirmaAdi || '-', customerAddress: r.FirmaAdres || '',
      customerEmail: r.FirmaEmail || '',
      salesPersonId: r.YetkiliID, salesPersonName: r.YetkiliAdi || '-',
      amount: r.Toplam, status: r.GenelDurum || 'Yeni Teklif',
      currency: r.ParaBirimi, notes: r.TeklifNot, discount: r.Iskonto,
    };
  } catch (e) {
    console.error('getQuote error:', e);
    return null;
  }
}

export async function getQuoteItems(quoteId: string): Promise<SktQuoteItem[]> {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('quoteId', quoteId).query(`
      SELECT D.ID, D.TeklifID, D.StokID, D.StokDurumu, D.Miktar, D.Birim,
             D.Fiyat, D.KDV, D.Tutar, D.KDVTutar, D.GTutar,
             S.Kod as StokKodu, S.Ad as StokAdi, S.Marka
      FROM STeklifDetay D WITH (NOLOCK)
      LEFT JOIN SStokListe S WITH (NOLOCK) ON D.StokID = S.ID
      WHERE D.TeklifID = @quoteId
    `);
    return result.recordset.map((r: any) => ({
      id: r.ID.toString(), quoteId: r.TeklifID.toString(),
      productId: r.StokID, productCode: r.StokKodu, productName: r.StokAdi,
      description: r.StokDurumu || r.StokAdi || '',
      brand: r.Marka, quantity: r.Miktar, unit: r.Birim,
      price: r.Fiyat, vatRate: r.KDV, amount: r.Tutar,
      vatAmount: r.KDVTutar, totalAmount: r.GTutar,
    }));
  } catch {
    return [];
  }
}

export async function updateQuoteStatus(id: string, newStatus: string) {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', id).input('status', newStatus)
      .query(`UPDATE STeklifListe SET GenelDurum=@status WHERE ID=@id`);
    revalidatePath('/laboratuvar/spektrotek/teklifler');
    return { success: true };
  } catch (e) {
    console.error('updateQuoteStatus error:', e);
    return { success: false };
  }
}

export async function saveQuote(quoteId: string, data: Partial<SktQuote>, items: SktQuoteItem[]) {
  try {
    const pool = await poolPromise;
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();
    try {
      await transaction.request()
        .input('id', quoteId)
        .input('currency', data.currency)
        .input('notes', data.notes)
        .input('amount', data.amount)
        .input('discount', data.discount || 0)
        .input('status', data.status || 'Hazırlanıyor')
        .query(`UPDATE STeklifListe SET ParaBirimi=@currency, TeklifNot=@notes, Toplam=@amount, Iskonto=@discount, GenelDurum=@status WHERE ID=@id`);

      await transaction.request().input('quoteId', quoteId)
        .query(`DELETE FROM STeklifDetay WHERE TeklifID=@quoteId`);

      for (const item of items) {
        await transaction.request()
          .input('quoteId', quoteId)
          .input('productId', item.productId || 0)
          .input('stokDurumu', item.description || '')
          .input('qty', item.quantity)
          .input('unit', item.unit)
          .input('price', item.price)
          .input('vat', item.vatRate)
          .input('amount', item.amount)
          .input('vatAmount', item.vatAmount)
          .input('totalAmount', item.totalAmount)
          .query(`INSERT INTO STeklifDetay (TeklifID, StokID, StokDurumu, Miktar, Birim, Fiyat, KDV, Tutar, KDVTutar, GTutar)
                  VALUES (@quoteId, @productId, @stokDurumu, @qty, @unit, @price, @vat, @amount, @vatAmount, @totalAmount)`);
      }

      await transaction.commit();
      revalidatePath('/laboratuvar/spektrotek/teklifler');
      revalidatePath(`/laboratuvar/spektrotek/teklifler/${quoteId}`);
      return { success: true };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (e) {
    console.error('saveQuote error:', e);
    return { success: false };
  }
}

export async function createRevision(currentQuoteId: string) {
  try {
    const pool = await poolPromise;
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();
    try {
      const qResult = await transaction.request().input('id', currentQuoteId)
        .query(`SELECT * FROM STeklifListe WHERE ID=@id`);
      if (!qResult.recordset.length) throw new Error('Quote not found');
      const current = qResult.recordset[0];
      const newRev = (current.Rev || 0) + 1;

      const insertQ = await transaction.request()
        .input('teklifNo', current.TeklifNo)
        .input('rev', newRev)
        .input('talepNo', current.TalepNo)
        .input('firmaId', current.FirmaID)
        .input('tarih', new Date())
        .input('yetkiliId', current.YetkiliID)
        .input('notes', current.TeklifNot)
        .input('currency', current.ParaBirimi)
        .input('total', current.Toplam)
        .input('disk', current.Iskonto)
        .query(`INSERT INTO STeklifListe (TeklifNo, Rev, TalepNo, FirmaID, Tarih, YetkiliID, TeklifNot, ParaBirimi, Iskonto, Toplam, GenelDurum, Durum)
                OUTPUT INSERTED.ID
                VALUES (@teklifNo, @rev, @talepNo, @firmaId, @tarih, @yetkiliId, @notes, @currency, @disk, @total, 'Hazırlanıyor', 'Aktif')`);

      const newId = insertQ.recordset[0].ID;

      const itemsResult = await transaction.request().input('oldId', currentQuoteId)
        .query(`SELECT * FROM STeklifDetay WHERE TeklifID=@oldId`);

      for (const item of itemsResult.recordset) {
        await transaction.request()
          .input('newId', newId).input('stokId', item.StokID).input('stokDurumu', item.StokDurumu)
          .input('miktar', item.Miktar).input('birim', item.Birim).input('fiyat', item.Fiyat)
          .input('kdv', item.KDV).input('tutar', item.Tutar).input('kdvTutar', item.KDVTutar).input('gTutar', item.GTutar)
          .query(`INSERT INTO STeklifDetay (TeklifID, StokID, StokDurumu, Miktar, Birim, Fiyat, KDV, Tutar, KDVTutar, GTutar)
                  VALUES (@newId, @stokId, @stokDurumu, @miktar, @birim, @fiyat, @kdv, @tutar, @kdvTutar, @gTutar)`);
      }

      await transaction.request().input('id', currentQuoteId)
        .query(`UPDATE STeklifListe SET GenelDurum='Revize' WHERE ID=@id`);

      await transaction.commit();
      revalidatePath('/laboratuvar/spektrotek/teklifler');
      return { success: true, newQuoteId: newId };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (e) {
    console.error('createRevision error:', e);
    return { success: false };
  }
}

export async function createQuoteFromRequest(requestId: string | number) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error('Unauthorized');
    const salesPersonId = session.user.userId ? parseInt(session.user.userId) : 1;

    const pool = await poolPromise;
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();
    try {
      const currentYear = new Date().getFullYear();
      const maxResult = await transaction.request()
        .input('yearPrefix', currentYear.toString() + '%')
        .query(`SELECT MAX(TeklifNo) as MaxNo FROM STeklifListe WHERE CAST(TeklifNo as VARCHAR) LIKE @yearPrefix`);

      const maxNo = maxResult.recordset[0].MaxNo;
      const newQuoteNo = maxNo ? maxNo + 1 : parseInt(`${currentYear}0001`);

      const reqResult = await transaction.request().input('val', requestId)
        .query(`SELECT ID, FirmaID FROM STalepListe WHERE TalepNo=@val OR ID=@val`);
      if (!reqResult.recordset.length) throw new Error('Request not found');
      const { FirmaID: firmaId, ID: requestDbId } = reqResult.recordset[0];

      const defaultNote = `1. Ödeme yöntemimiz siparişte peşindir.\n2. Fatura tutarı, fatura tarihindeki TCMB döviz satış kurundan hesaplanır.\n3. Teslim süresi 6-8 Haftadır.`;

      const insertResult = await transaction.request()
        .input('teklifNo', newQuoteNo).input('talepNo', requestDbId)
        .input('firmaId', firmaId).input('tarih', new Date())
        .input('yetkiliId', salesPersonId).input('note', defaultNote)
        .query(`INSERT INTO STeklifListe (TeklifNo, TalepNo, FirmaID, Tarih, YetkiliID, Rev, GenelDurum, Durum, TeklifNot)
                OUTPUT INSERTED.ID
                VALUES (@teklifNo, @talepNo, @firmaId, @tarih, @yetkiliId, 0, 'Hazırlanıyor', 'Aktif', @note)`);

      const newQuoteId = insertResult.recordset[0].ID;

      await transaction.request().input('requestId', requestDbId)
        .query(`UPDATE STalepListe SET Durum='Teklif İletildi' WHERE ID=@requestId`);

      await transaction.commit();
      revalidatePath('/laboratuvar/spektrotek/teklifler');
      return { success: true, quoteId: newQuoteId };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (e) {
    console.error('createQuoteFromRequest error:', e);
    return { success: false };
  }
}

export async function getLatestQuoteIdByRequest(requestId: string): Promise<string | null> {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('val', requestId).query(`
      SELECT TOP 1 ID FROM STeklifListe
      WHERE TalepNo = (SELECT TOP 1 ID FROM STalepListe WHERE TalepNo=@val OR ID=@val)
      ORDER BY TeklifNo DESC, Rev DESC
    `);
    return result.recordset.length ? result.recordset[0].ID.toString() : null;
  } catch {
    return null;
  }
}
