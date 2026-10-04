import { readFileSync, writeFileSync } from 'node:fs';

// ICO supports an embedded PNG, preserving the supplied artwork exactly.
const png = readFileSync(new URL('../public/unique-icon.png', import.meta.url));
const size = png.readUInt32BE(16);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size >= 256 ? 0 : size;
header[7] = size >= 256 ? 0 : size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, png]));
