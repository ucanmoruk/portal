// Read-only connectivity check. Prints counts only, never message bodies or credentials.
require('./register-local-ts.cjs');
const { ImapFlow } = require('imapflow');
(async () => {
  const cfg = await require('../lib/settings.ts').getAllSettings();
  const setting = (key, fallback = '') => cfg[key] || process.env[key] || fallback;
  const user = setting('UNIQUE_IMAP_USER', setting('MAIL_USER'));
  if (user.toLowerCase() !== 'info@uniqueanalyse.com') throw new Error('Info mailbox is not configured.');
  const client = new ImapFlow({ host: setting('UNIQUE_IMAP_HOST', setting('MAIL_HOST')), port: Number(setting('UNIQUE_IMAP_PORT', '993')), secure: true,
    auth: { user, pass: setting('UNIQUE_IMAP_PASS', setting('MAIL_PASS')) }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try { console.log(JSON.stringify({ connected: true, readOnly: client.mailbox.readOnly, messages: client.mailbox.exists })); }
    finally { lock.release(); }
  } finally { await client.logout().catch(() => client.close()); }
})().catch(error => { console.error('Mailbox check failed:', error.code || error.name); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100).unref());
