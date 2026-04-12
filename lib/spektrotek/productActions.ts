'use server';

import poolPromise from '@/lib/db';
import type { SktProduct } from './types';

export type ProductFilter = {
  search?: string;
  category?: string;
  brand?: string;
  page: number;
  limit: number;
};

export async function getProducts(filter: ProductFilter = { page: 1, limit: 15 }) {
  try {
    const pool = await poolPromise;
    let where = "Durum = 'Aktif'";

    const req = pool.request();
    const countReq = pool.request();

    if (filter.search) {
      req.input('search', `%${filter.search}%`);
      countReq.input('search', `%${filter.search}%`);
      where += ` AND (Ad LIKE @search OR Kod LIKE @search OR Marka LIKE @search)`;
    }
    if (filter.category) {
      req.input('category', filter.category);
      countReq.input('category', filter.category);
      where += ` AND Kategori = @category`;
    }
    if (filter.brand) {
      req.input('brand', filter.brand);
      countReq.input('brand', filter.brand);
      where += ` AND Marka = @brand`;
    }

    const offset = (filter.page - 1) * filter.limit;
    req.input('offset', offset).input('limit', filter.limit);

    const [data, count] = await Promise.all([
      req.query(`SELECT ID, Ad, Kategori, Kod, Marka, Stok, Birim, Satis, ParaBirimi, KDV
        FROM SStokListe WITH (NOLOCK) WHERE ${where}
        ORDER BY Ad ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`),
      countReq.query(`SELECT COUNT(*) as total FROM SStokListe WITH (NOLOCK) WHERE ${where}`),
    ]);

    const products: SktProduct[] = data.recordset.map((r: any) => ({
      id: r.ID.toString(),
      name: r.Ad || 'İsimsiz',
      category: r.Kategori || '',
      code: r.Kod || '',
      brand: r.Marka || '',
      stock: r.Stok || 0,
      unit: r.Birim || 'Adet',
      sellPrice: r.Satis || 0,
      currency: r.ParaBirimi || 'USD',
      vat: r.KDV,
    }));

    return { products, totalCount: count.recordset[0].total as number };
  } catch (e) {
    console.error('getProducts error:', e);
    return { products: [], totalCount: 0 };
  }
}

export async function addProduct(data: Partial<SktProduct>) {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('Ad', data.name)
      .input('Kategori', data.category)
      .input('Kod', data.code)
      .input('Marka', data.brand)
      .input('Stok', data.stock || 0)
      .input('Birim', data.unit || 'Adet')
      .input('Satis', data.sellPrice || 0)
      .input('ParaBirimi', data.currency || 'USD')
      .input('KDV', data.vat || 20)
      .query(`INSERT INTO SStokListe (Ad, Kategori, Kod, Marka, Stok, Birim, Satis, ParaBirimi, KDV, Durum, Tarih)
              VALUES (@Ad, @Kategori, @Kod, @Marka, @Stok, @Birim, @Satis, @ParaBirimi, @KDV, 'Aktif', GETDATE())`);
    return { success: true };
  } catch (e) {
    console.error('addProduct error:', e);
    return { success: false };
  }
}

export async function updateProduct(id: string, data: Partial<SktProduct>) {
  try {
    const pool = await poolPromise;
    const req = pool.request().input('ID', id);
    const updates: string[] = [];
    if (data.name !== undefined)      { req.input('Ad', data.name); updates.push('Ad=@Ad'); }
    if (data.category !== undefined)  { req.input('Kategori', data.category); updates.push('Kategori=@Kategori'); }
    if (data.code !== undefined)      { req.input('Kod', data.code); updates.push('Kod=@Kod'); }
    if (data.brand !== undefined)     { req.input('Marka', data.brand); updates.push('Marka=@Marka'); }
    if (data.stock !== undefined)     { req.input('Stok', data.stock); updates.push('Stok=@Stok'); }
    if (data.unit !== undefined)      { req.input('Birim', data.unit); updates.push('Birim=@Birim'); }
    if (data.sellPrice !== undefined) { req.input('Satis', data.sellPrice); updates.push('Satis=@Satis'); }
    if (data.currency !== undefined)  { req.input('ParaBirimi', data.currency); updates.push('ParaBirimi=@ParaBirimi'); }
    if (data.vat !== undefined)       { req.input('KDV', data.vat); updates.push('KDV=@KDV'); }
    if (updates.length > 0) {
      await req.query(`UPDATE SStokListe SET ${updates.join(',')} WHERE ID=@ID`);
    }
    return { success: true };
  } catch (e) {
    console.error('updateProduct error:', e);
    return { success: false };
  }
}

export async function deleteProduct(id: string) {
  try {
    const pool = await poolPromise;
    await pool.request().input('ID', id).query(`UPDATE SStokListe SET Durum='Pasif' WHERE ID=@ID`);
    return { success: true };
  } catch (e) {
    console.error('deleteProduct error:', e);
    return { success: false };
  }
}

export async function getProductMetadata() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT DISTINCT Kategori FROM SStokListe WITH (NOLOCK) WHERE Durum='Aktif' ORDER BY Kategori;
      SELECT DISTINCT Marka FROM SStokListe WITH (NOLOCK) WHERE Durum='Aktif' ORDER BY Marka;
    `);
    const categories = (result.recordsets as any)[0].map((r: any) => r.Kategori).filter(Boolean);
    const brands = (result.recordsets as any)[1].map((r: any) => r.Marka).filter(Boolean);
    return { categories, brands };
  } catch (e) {
    console.error('getProductMetadata error:', e);
    return { categories: [], brands: [] };
  }
}
