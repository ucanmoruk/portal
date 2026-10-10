import { randomUUID } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import type { CustomerRequest } from "./customerRequestTypes";

type Writer = { request(): { input(name: string, value: string): unknown } };
let ready: Promise<void> | undefined;
export async function notificationSchema() {
  if (!ready) ready = (async () => {
    const pool = await cosmoPool;
    const columns = `ID VARCHAR(36) PRIMARY KEY, Payload ${hasMysqlConfig() ? "LONGTEXT" : "NVARCHAR(MAX)"} NOT NULL,
      Attempts INT NOT NULL, NextAttempt VARCHAR(30) NOT NULL, SentAt VARCHAR(30) NULL,
      LeaseID VARCHAR(36) NULL, LeaseUntil VARCHAR(30) NULL, LastError VARCHAR(100) NULL`;
    await pool.request().query(hasMysqlConfig()
      ? `CREATE TABLE IF NOT EXISTS CustomerRequestNotifications (${columns}, KEY IX_CustomerNotificationDue (SentAt,NextAttempt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      : `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CustomerRequestNotifications') CREATE TABLE CustomerRequestNotifications (${columns})`);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}

// Use the mutation's transaction: a saved reply and its notification cannot diverge.
export async function enqueueNotification(writer: Writer, request: CustomerRequest, eventId: string,
  eventType: "staff_message" | "status_changed", text = "", status = "") {
  if (request.source !== "spektrotek") return;
  const payload = { eventId, eventType, number: request.number, email: request.email,
    name: request.name, subject: request.subject, text, status };
  const query = writer.request() as ReturnType<Awaited<typeof cosmoPool>["request"]>;
  await query.input("id", eventId).input("payload", JSON.stringify(payload)).input("now", new Date().toISOString())
    .query("INSERT INTO CustomerRequestNotifications (ID,Payload,Attempts,NextAttempt) VALUES (@id,@payload,0,@now)");
}

let running = false;
export async function dispatchNotifications() {
  if (running) return;
  const key = process.env.CUSTOMER_REQUEST_SPEKTROTEK_API_KEY;
  if (!key || key.length < 32) return;
  running = true;
  try {
    await notificationSchema();
    const pool = await cosmoPool;
    const now = new Date().toISOString();
    const rows = await pool.request().input("now", now).query(`SELECT ${hasMysqlConfig() ? "" : "TOP 10"} ID,Payload,Attempts
      FROM CustomerRequestNotifications WHERE SentAt IS NULL AND NextAttempt<=@now
      AND (LeaseUntil IS NULL OR LeaseUntil<=@now) ORDER BY NextAttempt ${hasMysqlConfig() ? "LIMIT 10" : ""}`);
    for (const row of rows.recordset) {
      const lease = randomUUID();
      await pool.request().input("id", row.ID).input("lease", lease).input("now", new Date().toISOString())
        .input("until", new Date(Date.now() + 60000).toISOString()).query(`UPDATE CustomerRequestNotifications
          SET LeaseID=@lease,LeaseUntil=@until WHERE ID=@id AND SentAt IS NULL AND (LeaseUntil IS NULL OR LeaseUntil<=@now)`);
      const owned = await pool.request().input("id", row.ID).input("lease", lease)
        .query("SELECT ID FROM CustomerRequestNotifications WHERE ID=@id AND LeaseID=@lease AND SentAt IS NULL");
      if (!owned.recordset.length) continue;
      let failure = "";
      try {
        const response = await fetch("https://talep.spektrotek.com/api/integrations/customer-request-notifications", {
          method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key },
          body: String(row.Payload), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        if (!response.ok) failure = `HTTP ${response.status}`;
      } catch { failure = "Network error or timeout"; }
      if (!failure) {
        await pool.request().input("id", row.ID).input("lease", lease).input("now", new Date().toISOString())
          .query("UPDATE CustomerRequestNotifications SET SentAt=@now,LeaseID=NULL,LeaseUntil=NULL,LastError=NULL WHERE ID=@id AND LeaseID=@lease");
      } else {
        const attempts = Number(row.Attempts) + 1;
        const delay = Math.min(3600000, 30000 * 2 ** Math.min(attempts - 1, 7));
        await pool.request().input("id", row.ID).input("lease", lease).input("attempts", attempts)
          .input("next", new Date(Date.now() + delay).toISOString()).input("error", failure)
          .query("UPDATE CustomerRequestNotifications SET Attempts=@attempts,NextAttempt=@next,LastError=@error,LeaseID=NULL,LeaseUntil=NULL WHERE ID=@id AND LeaseID=@lease");
        console.error("Customer request notification pending", { eventId: row.ID, attempts, error: failure });
      }
    }
  } catch { console.error("Customer request notification queue unavailable"); }
  finally { running = false; }
}

const worker = globalThis as typeof globalThis & { customerNotificationTimer?: ReturnType<typeof setInterval> };
export function startNotificationWorker() {
  if (worker.customerNotificationTimer) return;
  worker.customerNotificationTimer = setInterval(() => { void dispatchNotifications(); }, 30000);
  worker.customerNotificationTimer.unref();
}
