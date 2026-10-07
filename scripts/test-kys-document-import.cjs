/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { module: testModule, exports: testModule.exports, Buffer, require: name => imports[name] || require(name) });
  return testModule.exports;
}

(async () => {
  const sanitizer = load('lib/htmlSanitize.ts');
  const textCase = load('lib/kysTextCase.ts');
  assert.equal(textCase.convertTextCase('İSTANBUL IĞDIR', 'lower'), 'istanbul ığdır');
  assert.equal(textCase.convertTextCase('istanbul ığdır', 'upper'), 'İSTANBUL IĞDIR');
  assert.equal(textCase.convertTextCase('İLK TÜMCE. İKİNCİ TÜMCE! ÜÇÜNCÜ?', 'sentence'), 'İlk tümce. İkinci tümce! Üçüncü?');
  const sentenceState = { sentenceStart: true };
  assert.equal(textCase.convertTextCase('İLK ', 'sentence', sentenceState), 'İlk ');
  assert.equal(textCase.convertTextCase('TÜMCE. SONRA', 'sentence', sentenceState), 'tümce. Sonra');
  assert.equal(textCase.convertTextCase('DEĞER 1.5 GRAM.', 'sentence'), 'Değer 1.5 gram.');
  const spacing = load('lib/kysDocumentSpacing.ts');
  const legacy = '<p style="line-height:100%;margin-bottom:0cm"><i>Test</i></p>';
  const normalized = spacing.normalizeKysDocumentSpacing(legacy);
  assert.match(normalized, /line-height: 1.56/);
  assert.match(normalized, /margin-bottom: 9px/);
  assert.match(normalized, /<i>Test<\/i>/);
  assert.equal(spacing.normalizeKysDocumentSpacing(normalized), normalized);
  const custom = '<p style="line-height:1;margin-bottom:0px">Custom</p>';
  assert.equal(spacing.normalizeKysDocumentSpacing(custom), custom);
  assert.equal(spacing.normalizeKysDocumentSpacing('<td style="margin-bottom:0cm">Cell</td>'), '<td style="margin-bottom:0cm">Cell</td>');
  const api = load('lib/kysDocumentImport.ts', { '@/lib/htmlSanitize': sanitizer, '@/lib/kysDocumentSpacing': spacing });
  const { Document, Packer, Paragraph } = require('docx');
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Aktarım denemesi')] }] }));
  assert.match((await api.importKysDocument('test.docx', docx)).html, /Aktarım denemesi/);
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('PDF import test', { x: 50, y: 700, font });
  assert.match((await api.importKysDocument('test.pdf', Buffer.from(await pdf.save()))).html, /PDF import test/);
  await assert.rejects(api.importKysDocument('broken.pdf', Buffer.from('invalid PDF')));
  await assert.rejects(api.importKysDocument('broken.docx', Buffer.from('invalid DOCX')));
  await assert.rejects(api.importKysDocument('test.txt', Buffer.from('text')), /DOCX veya PDF/);
  assert.match(sanitizer.sanitizeDocumentHtml('<p style="line-height:2;margin-bottom:18px">Test</p>'), /line-height:2; margin-bottom:18px/);
  // A PDF runtime failure must not prevent Word imports.
  const isolated = load('lib/kysDocumentImport.ts', {
    '@/lib/htmlSanitize': sanitizer,
    '@/lib/kysDocumentSpacing': spacing,
    'pdf-parse': new Proxy({}, { get() { throw new Error('PDF runtime unavailable'); } }),
  });
  assert.match((await isolated.importKysDocument('test.docx', docx)).html, /Aktarım denemesi/);
  await assert.rejects(isolated.importKysDocument('test.pdf', Buffer.from('PDF')), /PDF runtime unavailable/);
  console.log('PASS: DOCX/PDF import, invalid files, PDF failure isolation, saved paragraph spacing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
