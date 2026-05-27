import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function getSecret() {
  return (
    process.env.TEKLIF_ONAY_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-teklif-onay-secret"
  );
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createTeklifApprovalToken(teklifId: string | number, ttlMs = DEFAULT_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const payload = `${teklifId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyTeklifApprovalToken(token: string | null, expectedTeklifId: string | number) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [id, expRaw, receivedSignature] = parts;
  if (id !== String(expectedTeklifId)) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const payload = `${id}.${expRaw}`;
  const expectedSignature = sign(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && timingSafeEqual(received, expected);
}
