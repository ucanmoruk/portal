require('./register-local-ts.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function compile(file, mocks) { const source = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText; const mod={exports:{}}; new Function('require','module','exports',source)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports); return mod.exports; }
let admin = false, settings = { CRM_SALES_ANTHROPIC_API_KEY: 'private-anthropic-key', CRM_SALES_OPENAI_API_KEY: 'private-openai-key', CRM_SALES_AI_PROVIDER: 'anthropic' };
const storage = { getAllSettings: async () => ({...settings}), setSettings: async updates => {settings={...settings,...updates};} };
const config = compile('lib/crmSalesAi.ts', {'@/lib/settings':storage, '@/lib/crmAi':require('../lib/crmAi.ts')});
const route = compile('app/api/crm/sales/settings/route.ts', {'@/lib/settings':storage,'@/lib/crmSalesAi':config,'@/lib/portalYetki':{getPortalUser:async()=>({isAdmin:admin})}});
const request = (body, origin = 'https://portal.test') => new Request('https://portal.test/api/crm/sales/settings',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)});
(async()=>{
 assert.equal((await route.GET()).status,403); assert.equal((await route.POST(request({provider:'anthropic',model:'',apiKey:''}))).status,403); admin=true;
 const result = await (await route.GET()).text(); assert(!result.includes('private-')); assert(JSON.parse(result).configured);
 assert.equal((await config.crmSalesAiConfig()).apiKey,'private-anthropic-key');
 assert.equal((await route.POST(request({provider:'openai',model:'custom-model',apiKey:''}))).status,200);
 assert.equal(settings.CRM_SALES_OPENAI_API_KEY,'private-openai-key'); const openai=await config.crmSalesAiConfig(); assert.equal(openai.provider,'openai'); assert.equal(openai.model,'custom-model'); assert.equal(openai.apiKey,'private-openai-key');
 assert.equal((await route.POST(request({provider:'openai',model:'',apiKey:'replaced-secret-key'}))).status,200); assert.equal(settings.CRM_SALES_OPENAI_API_KEY,'replaced-secret-key');
 assert(!(await (await route.GET()).text()).includes('replaced-secret-key'));
 assert.equal((await route.POST(request({provider:'openai',model:'',apiKey:'bad\nkey'}))).status,400);
 assert.equal((await route.POST(request({provider:'openai',model:'',apiKey:''},'https://other.test'))).status,403);
 assert.equal((await route.POST(request({provider:'other',model:'',apiKey:''}))).status,400);
 console.log('PASS sales AI settings: admin-only, no key returned, selected-provider isolation, blank-key preservation, key replacement, model selection, origin and input validation. In-memory settings only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
