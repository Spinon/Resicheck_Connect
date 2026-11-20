import fs from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{createRequire}from'node:module';import os from'node:os';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await fs.readFile(p,'utf8')),uuidRoot='ibdlvlwdzmsrbqadrudb';
export async function assertMessaging33CandidateRoot(root){
 root=await fs.realpath(root);const owner=await json(path.join(root,'output/messaging33-candidate/owner.json')),main=await fs.realpath(owner.mainCheckout);
 assert.equal(owner.purpose,'messaging33-candidate-clone');assert.notEqual(root.toLowerCase(),main.toLowerCase());const bases=[path.join(main,'output')];if(owner.managedCandidateBase){assert.equal(await fs.realpath(owner.managedCandidateBase),await fs.realpath(os.tmpdir()));bases.push(await fs.realpath(os.tmpdir()));}assert(bases.some(b=>root.toLowerCase().startsWith((b+path.sep).toLowerCase())));
 return root;
}
export async function readMessaging33Plan(root){const p=await json(path.join(root,'apps/mobile/candidates/messaging33/release-plan.PREPARED.json'));assert.equal(p.release,'0.0.33-mensagens');assert.equal(p.versionCode,33);assert.equal(p.projectRef,uuidRoot);return p;}
export async function readMessaging33PublicConfig(root){
 const p=await json(path.join(root,'apps/mobile/candidates/messaging33/connect-public-config.INPUT.json'));
 assert.equal(Object.keys(p).sort().join(','),'projectRef,projectUrl,publishableKey,schemaVersion');assert.equal(p.schemaVersion,1);assert.equal(p.projectRef,uuidRoot);assert.equal(p.projectUrl,'https://'+uuidRoot+'.supabase.co');assert(/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(p.publishableKey));
 return p;
}
export async function snapshotMessaging33Source(input){
 const root=await assertMessaging33CandidateRoot(input),plan=await readMessaging33Plan(root),config=await readMessaging33PublicConfig(root);
 const req=createRequire(path.join(root,'apps/mobile/package.json')),ts=req('typescript'),base=path.join(root,'output/messaging33-candidate'),target=path.join(base,'source-snapshot.json');
 let old=null;try{old=await json(target);}catch(e){if(e.code!=='ENOENT')throw e;}
 const sources=new Map(),todo=[],add=p=>{p=p.replaceAll('\\','/');assert(!p.startsWith('../')&&!path.isAbsolute(p));if(!sources.has(p)){sources.set(p,null);todo.push(p);}};
 for(const p of['package.json','apps/mobile/App.tsx','apps/mobile/App.web.tsx','apps/mobile/candidates/messaging33/entry.android.tsx.template','apps/mobile/candidates/messaging33/entry.web.tsx.template','apps/mobile/candidates/messaging33/release-plan.PREPARED.json','apps/mobile/candidates/messaging33/prepare-source.mjs','apps/mobile/candidates/messaging33/prepare-android.mjs','apps/mobile/candidates/messaging33/prepare-web.mjs','apps/mobile/candidates/messaging33/expo-config.mjs','apps/mobile/candidates/messaging33/TEMPLATE.lock.json','apps/mobile/candidates/messaging33/messaging33-android.init.gradle','apps/mobile/candidates/connected-basic-text/AndroidManifest.xml','apps/mobile/candidates/connected-basic-text/res/xml/connect_basic_text_network.xml','apps/mobile/scripts/build-messaging33-android.ps1','apps/mobile/scripts/inspect-messaging33-apk.ps1','apps/mobile/package.json','apps/mobile/package-lock.json','apps/mobile/metro.config.cjs','apps/mobile/tsconfig.json','packages/text/package-lock.json','packages/text/UNICODE-SEGMENTER-LICENSE.txt','packages/text/tests/fixtures/UNICODE-LICENSE.txt'])add(p);
 for(const d of await fs.readdir(path.join(root,'packages')))for(const p of['package.json','tsconfig.json']){const f='packages/'+d+'/'+p;try{await fs.access(path.join(root,f));add(f);}catch{}}
 for(const p of await fs.readdir(path.join(root,'apps/mobile/native/privacy')))if(/\.(?:kt|java|xml)$/.test(p))add('apps/mobile/native/privacy/'+p);
 async function bytes(p){
  const actual=await fs.readFile(path.join(root,p));
  if(old&&p==='apps/mobile/App.web.tsx'&&sha(actual)!==old.files.find(x=>x.path===p)?.sha256){
   const receipt=await json(path.join(base,'web/receipt.json')),original=await fs.readFile(path.join(base,'web/App.web.original.tsx'));
   assert.equal(sha(actual),receipt.preparedSha256);assert.equal(sha(original),receipt.originalSha256);assert.equal(receipt.originalSha256,old.files.find(x=>x.path===p).sha256);return original;
  }return actual;
 }
 while(todo.length){const p=todo.shift(),b=await bytes(p);sources.set(p,{path:p,sha256:sha(b),bytes:b.length});if(!/\.(?:[cm]?[jt]sx?|tsx\.template)$/.test(p))continue;
  const source=ts.createSourceFile(p,b.toString('utf8'),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')||p.endsWith('.tsx.template')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(source.parseDiagnostics.length,0,p);
  const refs=[];const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteralLike(n.moduleSpecifier))refs.push(n.moduleSpecifier.text);if(ts.isCallExpression(n)&&n.arguments.length&&ts.isStringLiteralLike(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require'))refs.push(n.arguments[0].text);ts.forEachChild(n,visit);};visit(source);
  for(const r of refs){if(!r.startsWith('.'))continue;const q=path.posix.normalize(path.posix.join(path.posix.dirname(p),r));let resolved=null;for(const f of[q,...['.ts','.tsx','.js','.mjs','.json'].map(e=>q+e),q+'/index.ts',q+'/index.tsx']){try{if((await fs.lstat(path.join(root,f))).isFile()){resolved=f;break;}}catch{}}assert(resolved,'Missing source import '+p);add(resolved);}
 }
 const files=[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path)),planSha256=files.find(x=>x.path==='apps/mobile/candidates/messaging33/release-plan.PREPARED.json').sha256,publicConfigSha256=sha(Buffer.from(JSON.stringify(config)));
 const value={schemaVersion:1,purpose:'messaging33-common-source',release:plan.release,versionCode:plan.versionCode,planSha256,publicConfigSha256,files,fingerprint:sha(Buffer.from(JSON.stringify({files,planSha256,publicConfigSha256}))),apkBuilt:false,webPublished:false};
 if(old)assert.equal(old.fingerprint,value.fingerprint,'Candidate source changed; create a new deliberate candidate snapshot');
 else await fs.writeFile(target,JSON.stringify(value,null,2)+'\n');
 return value;
}
