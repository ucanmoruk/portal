import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd());
async function main() {
  const { loadKabulMailData, buildKabulMail, kabulMailDate } = await import("../lib/numuneKabulMail");
  assert.equal(kabulMailDate("2026-08-19"), "19.08.2026");
  assert.equal(kabulMailDate(null), "Belirtilmedi");
  const data = await loadKabulMailData([41125,41126]);
  assert(data.firmaAd.includes("EVYAP"));
  assert.equal(new Set(data.rows.map(r => r.id)).size, 2);
  assert(data.rows.every(r => r.evrakNo === "261412" && r.test && r.termin && r.kabulTarihi === "19.08.2026"));
  const content = buildKabulMail(data, "<script>Test</script>");
  assert(content.html.includes("&lt;script&gt;Test&lt;/script&gt;"));
  assert(!content.html.includes("<script>"));
  assert(content.text.includes("Whitening"));
  await assert.rejects(loadKabulMailData([41125,37311]), /aynı müşteriye/);
  console.log(`PASS: ${data.rows.length} test satırı, tarih/şablon/HTML escaping/farklı müşteri kontrolü. Mail gönderilmedi.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
