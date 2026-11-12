// Fake Chrome processes only. Tests startup retry and cleanup without launching a browser.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const ts = require('typescript'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
const file = 'lib/chromiumPdf.ts';
const input = fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path.resolve(file)).href))
  + '\nexport { waitForDevtoolsUrl, withChromeSpawnRetry, closeChromeProcess, withChromeRenderSlot, withDevtoolsTimeout, withChromeHostSlot };';
const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const mod = { exports: {} }, timers = [];
new Function('require', 'module', 'exports', 'process', 'setTimeout', 'clearTimeout', source)(
  name => name === '@/lib/loadDotenv' ? { loadDotenvOnce() {} } : require(name), mod, mod.exports,
  { ...process, env: { CHROME_SPAWN_RETRIES: '2', CHROME_RENDER_CONCURRENCY: '1' } },
  (fn, ms) => { timers.push(ms); return setImmediate(fn); }, clearImmediate,
);
(async () => {
  const api = mod.exports;
  await assert.rejects(api.withDevtoolsTimeout(new Promise(() => {}), 'test command'), /PDF motoru yanıt vermedi/);
  assert.equal(await api.withDevtoolsTimeout(Promise.resolve('ready'), 'test command'), 'ready');
  const proc = new EventEmitter(); proc.stderr = new EventEmitter();
  await assert.rejects(api.waitForDevtoolsUrl(proc), error => error.code === 'CHROME_STARTUP_TIMEOUT');
  assert(timers.includes(45000), 'Startup should not retain the legacy 10-second deadline');
  let attempts = 0;
  const result = await api.withChromeSpawnRetry(async () => { attempts++; if (attempts === 1) throw Object.assign(new Error('startup timeout'), { code: 'CHROME_STARTUP_TIMEOUT' }); return 'PDF'; });
  assert.equal(result, 'PDF'); assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(api.withChromeSpawnRetry(async () => { attempts++; throw new Error('missing library'); }));
  assert.equal(attempts, 1, 'Permanent startup errors must not be repeatedly retried');
  const stuck = new EventEmitter(); Object.assign(stuck, { exitCode: null, signalCode: null, killed: false }); const signals = [];
  stuck.kill = signal => { signals.push(signal); stuck.killed = true; if (signal === 'SIGKILL') { stuck.signalCode = signal; stuck.emit('exit', null); } return true; };
  await api.closeChromeProcess(stuck); assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  let active = 0, peak = 0;
  await Promise.all(Array.from({ length: 5 }, () => api.withChromeRenderSlot(async () => { peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--; })));
  assert.equal(peak, 1);
  // A separately evaluated Next route bundle must share the process-wide queue.
  const other = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    name => name === '@/lib/loadDotenv' ? { loadDotenvOnce() {} } : require(name), other, other.exports,
  );
  active = 0; peak = 0;
  const render = async () => { peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--; };
  await Promise.all([api.withChromeRenderSlot(render), other.exports.withChromeRenderSlot(render)]);
  assert.equal(peak, 1, 'Separate route bundles must not start Chrome concurrently');
  // Host lock must also be released after a failed render.
  await assert.rejects(api.withChromeHostSlot(async () => { throw new Error('render failed'); }), /render failed/);
  assert.equal(await api.withChromeHostSlot(async () => 'released'), 'released');
  console.log('PASS: 45-second startup window, transient startup retry, permanent error handling, forced process cleanup and serial PDF rendering. No Chrome or server used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
