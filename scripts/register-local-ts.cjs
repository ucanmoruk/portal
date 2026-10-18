const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
require("@next/env").loadEnvConfig(process.cwd());
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith("@/") ? path.resolve(process.cwd(), name.slice(2)) : name, ...args); };
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
