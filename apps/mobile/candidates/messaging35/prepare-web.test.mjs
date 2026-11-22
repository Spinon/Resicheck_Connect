// One focused AST/config check. No clone write, bundle, browser or backend.
import test from'node:test';import assert from'node:assert/strict';
import fs from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';
import{patchMessaging35DefaultExport,admitMessaging35PublicConfig}from'./prepare-web.mjs';
const ts=createRequire(new URL('../../package.json',import.meta.url))('typescript');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('candidate33 default-only patch preserves factory, version and public-file contract',async()=>{
 const app=new URL('../../App.web.tsx',import.meta.url),source=await fs.readFile(app),preview=await fs.readFile(new URL('../../previews/company-preview-lot.web.tsx',import.meta.url),'utf8'),plan=JSON.parse(await fs.readFile(new URL('./release-plan.PREPARED.json',import.meta.url),'utf8'));
 const before=sha(source),patch=patchMessaging35DefaultExport(source.toString('utf8'),preview,plan,ts);
 assert(patch.factoryUnchanged&&patch.otherSourceBytesUnchanged);
 assert.deepEqual(patch.modes,['candidate-on-demand-check','candidate-scoped-chat','candidate-own-company','candidate-selection-v1','candidate-secret-v1','candidate-preview-v1','candidate-private-v1']);
 assert.deepEqual(patch.version,{versionName:plan.release,versionCode:plan.versionCode,internalQa:false});
 const changed=patch.source.slice(patch.defaultExportRange.start);
 assert(changed.includes('Messaging35BuildInfoProvider'));
 assert(!changed.includes('company-preview-lot.web')&&!changed.includes('publishableKey'));
 assert.equal(patch.source.slice(0,patch.defaultExportRange.start),source.toString('utf8').slice(0,patch.defaultExportRange.start));
 assert.throws(()=>patchMessaging35DefaultExport(patch.source,preview,plan,ts));
 const publicConfig={schemaVersion:1,projectRef:plan.projectRef,projectUrl:'https://'+plan.projectRef+'.supabase.co',publishableKey:'sb_publishable_'+'F'.repeat(32)};
 assert.deepEqual(admitMessaging35PublicConfig(publicConfig,plan),publicConfig);
 for(const invalid of[null,{...publicConfig,projectRef:'wrong'},{...publicConfig,projectUrl:'http://localhost'},{...publicConfig,publishableKey:'legacy.'+'invalid.'+'not-a-key'},{...publicConfig,access_token:'forbidden'},{...publicConfig,publishableKey:'sb_publishable_placeholder_unavailable'}])assert.throws(()=>admitMessaging35PublicConfig(invalid,plan));
 assert.equal(sha(await fs.readFile(app)),before);
 console.log(JSON.stringify({state:'passed-web33-default-ast-public-config-local',parser:ts.version,scope:'existing-main-typescript-parser-only',mainEntryUnchanged:true,rollbackBytesAvailableFromOriginal:true,cloneWrites:0,expoExports:0,realLogins:0,networkCalls:0,browserTested:false}));
});
