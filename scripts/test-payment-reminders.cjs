const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] || require(name), process, console, Buffer, URL, Request, Response, __dirname: process.cwd() }, { filename: file });
  return module.exports;
}

const rules = load("lib/paymentReminderRules.ts");
const today = rules.istanbulDate();
const row = { ID: 7, FaturaNo: "UNA20260007", VadeTarihi: today, Tutar: 1000, DirektOdenen: 100, Mahsup: 200, OdemeDurumu: "Kısmen Ödendi", FirmaAd: "Test firma", FirmaEmail: "test@example.com" };

async function main() {
  assert.equal(rules.istanbulDate(new Date("2026-10-18T21:01:00Z")), "2026-10-19");
  assert.equal(rules.dueInvoice(row, today).balance, 700);
  assert.equal(rules.dueInvoice({ ...row, OdemeDurumu: "Ödendi" }, today), null);
  assert.equal(rules.dueInvoice({ ...row, OdemeDurumu: "İptal" }, today), null);
  assert.equal(rules.dueInvoice({ ...row, DirektOdenen: 1000 }, today), null);
  assert.equal(rules.dueInvoice({ ...row, VadeTarihi: "2099-01-01" }, today), null);
  assert.equal(rules.dueInvoice({ ...row, VadeTarihi: null }, today), null);
  assert.equal(rules.reminderAddresses("good@example.com, invalid").length, 0);
  assert.equal(rules.reminderAddresses("a@example.com\r\nBcc: other@example.com").length, 0);
  assert.notEqual(rules.dueInvoice(row, today).fingerprint, rules.dueInvoice({ ...row, FirmaEmail: "changed@example.com" }, today).fingerprint);

  let current = { ...row }, sent = [], delivery = new Map(), failRecipient = "";
  const pool = { request() {
    const params = {};
    return { input(key, value) { params[key] = value; return this; }, async query(sql) {
      if (sql.includes("CREATE TABLE") || sql.includes("ALTER TABLE")) return { recordset: [] };
      if (sql.includes("FROM Fatura f")) return { recordset: [current] };
      if (sql.includes("WHERE DeliveryKey LIKE @prefix")) return { recordset: [...delivery].map(([DeliveryKey, value]) => ({ DeliveryKey, State: value.state })) };
      if (sql.startsWith("INSERT INTO PaymentReminderDelivery")) {
        if (delivery.has(params.key)) throw new Error("duplicate primary key");
        delivery.set(params.key, { state: "sending", approvedBy: params.approvedBy, recipient: params.recipient, details: params.details });
        return { recordset: [] };
      }
      if (sql.startsWith("SELECT State")) return { recordset: delivery.has(params.key) ? [{ State: delivery.get(params.key).state }] : [] };
      if (sql.startsWith("UPDATE PaymentReminderDelivery")) { Object.assign(delivery.get(params.key), { state: params.state, details: params.details }); return { recordset: [] }; }
      if (sql.startsWith("SELECT TOP")) {
        const type = sql.includes("LIKE 'report:%'") ? "report:" : sql.includes("LIKE 'reminder:%'") ? "reminder:" : "run:";
        return { recordset: [...delivery].filter(([key]) => key.startsWith(type)).map(([DeliveryKey, value]) => ({ DeliveryKey, State: value.state, Recipient: value.recipient, ApprovedBy: value.approvedBy, Details: value.details })) };
      }
      throw new Error(`Unhandled query: ${sql}`);
    } };
  } };
  const service = load("lib/paymentReminders.ts", {
    nodemailer: { createTransport() { return { async sendMail(message) {
      if (message.to === failRecipient) throw new Error("SMTP connection lost");
      sent.push(message); return { messageId: "test-message", rejected: [] };
    } }; } },
    "@/lib/db": { cosmoPool: Promise.resolve(pool) },
    "@/lib/loadDotenv": { loadDotenvOnce() {} },
    "@/lib/mysqlCompat": { hasMysqlConfig: () => true },
    "@/lib/settings": { getAllSettings: async () => ({ MAIL_HOST: "smtp.example.com", MAIL_USER: "user", MAIL_PASS: "fake" }) },
    "@/lib/paymentReminderRules": rules,
    "@/lib/laboratuvarMailTemplate": { escapeMailHtml: value => value, laboratoryMailBrand: () => ({}), renderLaboratoryMail: data => JSON.stringify(data) },
    "@/lib/invoiceMailContent": { invoiceMailClosing: [] },
  });
  const fingerprint = rules.dueInvoice(row, today).fingerprint;
  current.FirmaEmail = "changed@example.com";
  assert.equal((await service.sendApprovedReminder(7, fingerprint, "2")).state, "changed");
  assert.equal(sent.length, 0);
  current = { ...row };
  const simultaneous = await Promise.all([service.sendApprovedReminder(7, fingerprint, "2"), service.sendApprovedReminder(7, fingerprint, "2")]);
  assert.equal(simultaneous.filter(result => result.state === "sent").length, 1);
  assert.equal(sent.length, 1);
  assert.equal(delivery.get(`reminder:${today}:7`).approvedBy, "2");
  current.OdemeDurumu = "Ödendi";
  assert.equal((await service.sendApprovedReminder(7, fingerprint, "2")).state, "changed");

  current = { ...row }; sent = []; delivery = new Map();
  const previousUrl = process.env.PAYMENT_PORTAL_URL;
  process.env.PAYMENT_PORTAL_URL = "https://portal.example.com";
  failRecipient = rules.paymentReportRecipients[1];
  const report = await service.sendDailyPaymentReport();
  assert.equal(report[0].state, "sent");
  assert.equal(report[1].state, "uncertain");
  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes("/musteriler/fatura-takip/hatirlatmalar"));
  assert.ok(sent[0].html.includes("700"));
  await service.sendDailyPaymentReport();
  assert.equal(sent.length, 1, "Retry must not duplicate the successful or uncertain delivery");
  const overview = await service.getPaymentAutomationOverview();
  assert.equal(overview.todayReports[0].state, "sent");
  assert.equal(overview.todayReports[1].state, "uncertain");
  assert.equal(overview.configuration.smtpReady, true);
  assert.equal(overview.configuration.portalReady, true);
  assert.equal(overview.lastRun.state, "uncertain");
  assert.ok(overview.deliveries.some(item => item.type === "run"));
  assert.equal(overview.deliveries.filter(item => item.type === "report").length, 2);
  assert.ok(!JSON.stringify(overview).includes('"MAIL_PASS"'), "Monitor must never expose SMTP secrets");
  process.env.PAYMENT_PORTAL_URL = "http://localhost:3000";
  await assert.rejects(service.sendDailyPaymentReport(), /HTTPS/);
  const failedOverview = await service.getPaymentAutomationOverview();
  assert.equal(failedOverview.configuration.portalReady, false);
  assert.ok(failedOverview.deliveries.some(item => item.type === "run" && item.state === "failed"));
  if (previousUrl === undefined) delete process.env.PAYMENT_PORTAL_URL; else process.env.PAYMENT_PORTAL_URL = previousUrl;
  const previousSecret = process.env.PAYMENT_REPORT_CRON_SECRET;
  delete process.env.PAYMENT_REPORT_CRON_SECRET;
  let reportCalls = 0;
  const secret = "a".repeat(64);
  const route = load("app/api/cron/payment-report/route.ts", {
    "@/lib/loadDotenv": { loadDotenvOnce() { process.env.PAYMENT_REPORT_CRON_SECRET = secret; } },
    "@/lib/paymentReminders": { async sendDailyPaymentReport() { reportCalls++; return [{ state: "sent" }]; } },
  });
  assert.equal((await route.GET(new Request("https://portal.example.com/api/cron/payment-report", { headers: { Authorization: `Bearer ${secret}` } }))).status, 200, "Cron must load the server environment before checking the secret");
  assert.equal((await route.GET(new Request("https://portal.example.com/api/cron/payment-report", { headers: { Authorization: "Bearer wrong" } }))).status, 401);
  assert.equal(reportCalls, 1, "Wrong secrets must not trigger report delivery");
  const proxy = load("proxy.ts", {
    "next-auth/jwt": { async getToken() { return null; } },
    "next/server": { NextResponse: { next: () => new Response(null, { status: 204 }), json: (body, init) => Response.json(body, init) } },
  }).default;
  const proxyRequest = pathname => ({ nextUrl: { pathname, search: "" }, url: `https://portal.example.com${pathname}` });
  assert.equal((await proxy(proxyRequest("/api/cron/payment-report"))).status, 204, "Scheduler requests must reach the route's own Bearer authentication without a session cookie");
  assert.equal((await proxy(proxyRequest("/api/cron/payment-report-other"))).status, 401, "Only the exact cron endpoint may bypass session authentication");
  assert.equal((await proxy(proxyRequest("/api/admin/otomasyonlar"))).status, 401, "Automation monitoring must continue requiring a session");
  if (previousSecret === undefined) delete process.env.PAYMENT_REPORT_CRON_SECRET; else process.env.PAYMENT_REPORT_CRON_SECRET = previousSecret;
  console.log("Payment reminder tests passed: dates, balances, exclusions, address validation, stale approval, concurrent duplicate protection, partial report failure, retry protection, monitoring and failed-run tracking.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
