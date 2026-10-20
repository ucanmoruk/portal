const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  let now = new Date('2026-10-20T05:59:00Z').getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let tick, startup, checks = 0, sends = 0, complete = false, fail = false;
  const module = { exports: {} };
  const dependencies = {
    '@/lib/loadDotenv': { loadDotenvOnce() {} },
    '@/lib/paymentReminderRules': { istanbulDate: () => new Clock().toISOString().slice(0, 10) },
    '@/lib/paymentReminders': {
      async paymentReportComplete() { checks++; if (fail) throw new Error('temporary DB outage'); return complete; },
      async sendDailyPaymentReport() { sends++; return [{ state: complete ? 'sent' : 'uncertain' }]; },
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/paymentReportWorker.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module, exports: module.exports, Date: Clock,
    process: { env: { PAYMENT_REPORT_CRON_SECRET: 'a'.repeat(64) } },
    console: { warn() {}, error() {} },
    require: name => dependencies[name],
    setInterval(fn) { assert.equal(tick, undefined); tick = fn; return { unref() {} }; },
    setTimeout(fn) { startup = fn; return { unref() {} }; },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  module.exports.startPaymentReportWorker();
  module.exports.startPaymentReportWorker();
  startup(); await flush();
  assert.equal(checks, 0, 'No report before 09:00 Istanbul');
  now += 60_000;
  tick(); tick(); await flush();
  assert.equal(checks, 1, 'No overlapping runs in a worker');
  assert.equal(sends, 1, 'Missed cron runs recover after 09:00');
  now += 60_000;
  tick(); await flush();
  assert.equal(sends, 1, 'Failed reports have a five-minute retry delay');
  now += 4 * 60_000;
  fail = true;
  tick(); await flush();
  assert.equal(checks, 2);
  now += 5 * 60_000;
  fail = false;
  tick(); await flush();
  assert.equal(sends, 2, 'Worker survives database failures');
  now += 5 * 60_000;
  complete = true;
  tick(); await flush();
  assert.equal(sends, 2, 'Previously sent reports do not send again');
  const completedChecks = checks;
  now += 60 * 60_000;
  tick(); await flush();
  assert.equal(checks, completedChecks, 'Successful days are cached');
  now += 24 * 60 * 60_000;
  tick(); await flush();
  assert.equal(checks, completedChecks + 1, 'The following day is checked again');
  console.log('Payment report worker tests passed: Istanbul schedule, startup catch-up, overlap prevention, retry delay, outage recovery, daily reset.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
