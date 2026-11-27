// PREPARE ONLY: candidate clone App.web default export and static public config.
// No npm/Expo, bundle/export, Auth, backend, APK, deployment or Git mutation.
import fs from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{createRequire}from'node:module';
import{fileURLToPath}from'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const failure=()=>Error('Messaging36 web preparation unavailable');
const configRelative='apps/mobile/candidates/messaging36/connect-public-config.INPUT.json';
const outputRelative='output/messaging36-candidate/web';
export const messaging36PublicConfigExample=Object.freeze({schemaVersion:1,projectRef:'PROJECT_REF_REQUIRED',projectUrl:'https://PROJECT_REF_REQUIRED.supabase.co',publishableKey:'PUBLIC_PUBLISHABLE_KEY_REQUIRED'});
export function admitMessaging36PublicConfig(raw,plan){
 try{
  assert(raw&&typeof raw==='object'&&!Array.isArray(raw));
  assert.equal(Object.keys(raw).sort().join(','),'projectRef,projectUrl,publishableKey,schemaVersion');
  assert.equal(raw.schemaVersion,1);assert.equal(raw.projectRef,plan.projectRef);
  assert.equal(raw.projectUrl,'https://'+plan.projectRef+'.supabase.co');
  assert(typeof raw.publishableKey==='string'&&/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(raw.publishableKey)&&!/synthetic|example|placeholder/i.test(raw.publishableKey));
  return Object.freeze({...raw});
 }catch{throw failure();}
}
function parse(ts,source,name){const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(ast.parseDiagnostics.length,0,'Web source syntax differs');return ast;}
function factory(ts,ast){const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createConnectWebRoot');assert.equal(nodes.length,1);return nodes[0];}
export function patchMessaging36DefaultExport(source,previewSource,plan,ts){
 try{
  assert.equal(typeof source,'string');assert.equal(typeof previewSource,'string');
  assert(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(plan.release));assert.equal(plan.versionCode,36);
  assert.equal(plan.web.origin,'https://connect.resicheck.com.br');
  assert.equal(plan.sourceRoots.imagesOption,'candidate-private-v1');
  const before=parse(ts,source,'App.web.tsx'),preview=parse(ts,previewSource,'company-preview-lot.web.tsx'),fn=factory(ts,before);
  const candidates=preview.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createCompanyPreviewLotWebRoot');
  assert.equal(candidates.length,1);
  const returns=candidates[0].body.statements.filter(n=>ts.isReturnStatement(n));
  assert.equal(returns.length,1);const call=returns[0].expression;
  assert(ts.isCallExpression(call)&&ts.isIdentifier(call.expression)&&call.expression.text==='createConnectWebRoot');
  assert.equal(call.arguments.length,7);assert(call.arguments.slice(0,6).every(ts.isStringLiteral));
  assert(ts.isIdentifier(call.arguments[6])&&call.arguments[6].text==='imageMode');
  const modes=[...call.arguments.slice(0,6).map(n=>n.text),plan.sourceRoots.imagesOption];
  const defaults=before.statements.filter(n=>ts.isExportAssignment(n)&&!n.isExportEquals);
  assert.equal(defaults.length,1);const node=defaults[0];
  assert(ts.isCallExpression(node.expression)&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==='createConnectWebRoot'&&node.expression.arguments.length===0);
  for(const name of['Messaging36BuildInfoProvider','Messaging36WebRoot','Messaging36WebCandidate'])assert(!new RegExp('\\b'+name+'\\b').test(source));
  assert(source.includes("fetch('/connect-public-config.json'"),'Existing public file contract differs');
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const version={versionName:plan.release,versionCode:plan.versionCode,internalQa:false};
  const replacement=[
   "// Candidate33 default-export patch only; factory and existing release source are preserved.",
   "import{ConnectBuildInfoProvider as Messaging36BuildInfoProvider}from'./src/ConnectBuildInfo.tsx';",
   'const Messaging36WebRoot=createConnectWebRoot('+modes.map(v=>JSON.stringify(v)).join(',')+');',
   'export default function Messaging36WebCandidate(){',
   ' return <Messaging36BuildInfoProvider value={'+JSON.stringify(version)+'}><Messaging36WebRoot/></Messaging36BuildInfoProvider>;',
   '}'].join(eol);
  const start=node.getStart(before),end=node.end,prepared=source.slice(0,start)+replacement+source.slice(end);
  const after=parse(ts,prepared,'App.web.tsx'),afterFactory=factory(ts,after);
  assert.equal(prepared.slice(afterFactory.getStart(after),afterFactory.end),source.slice(fn.getStart(before),fn.end));
  assert.equal(prepared.slice(0,start),source.slice(0,start));assert.equal(prepared.slice(start+replacement.length),source.slice(end));
  assert(!replacement.includes('company-preview-lot.web')&&!replacement.includes('publishableKey'));
  return{source:prepared,modes,version,defaultExportRange:{start,end},factoryUnchanged:true,otherSourceBytesUnchanged:true};
 }catch{throw failure();}
}
async function safe(root,relative,{directory=false}={}){
 const resolved=path.resolve(root,relative),prefix=root+path.sep;
 assert(resolved.startsWith(prefix)&&resolved!==root);
 let current=root;
 for(const part of path.relative(root,resolved).split(path.sep)){
  current=path.join(current,part);
  try{assert(!(await fs.lstat(current)).isSymbolicLink(),'Candidate path cannot be a link');}catch(e){if(e.code==='ENOENT')break;throw e;}
 }
 if(directory)await fs.mkdir(resolved,{recursive:true});
 return resolved;
}
async function readOptional(p){try{return await fs.readFile(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function parserFor(root){
 try{return{ts:createRequire(path.join(root,'apps/mobile/package.json'))('typescript'),scope:'candidate-installed-parser-only'};}
 catch{return{ts:createRequire(new URL('../../package.json',import.meta.url))('typescript'),scope:'existing-checkout-parser-only-no-bundler'};}
}
export async function prepareMessaging36Web(candidate){
 const common=await import('./prepare-source.mjs');
 await common.assertMessaging36CandidateRoot(candidate);
 const root=await fs.realpath(path.resolve(candidate)),snapshot=await common.snapshotMessaging36Source(root);
 const planPath=await safe(root,'apps/mobile/candidates/messaging36/release-plan.PREPARED.json'),planBytes=await fs.readFile(planPath),plan=JSON.parse(planBytes);
 assert.equal(hash(planBytes),snapshot.planSha256);assert.equal(snapshot.release,plan.release);assert.equal(snapshot.versionCode,plan.versionCode);
 const appPath=await safe(root,'apps/mobile/App.web.tsx'),previewPath=await safe(root,plan.sourceRoots.web);
 const output=await safe(root,outputRelative,{directory:true}),originalPath=await safe(root,outputRelative+'/App.web.original.tsx'),receiptPath=await safe(root,outputRelative+'/receipt.json');
 const oldReceiptBytes=await readOptional(receiptPath),currentBytes=await fs.readFile(appPath),oldReceipt=oldReceiptBytes?JSON.parse(oldReceiptBytes):null;
 const archived=await readOptional(originalPath);
 if(oldReceipt){assert(archived);assert.equal(hash(archived),oldReceipt.originalSha256);assert([oldReceipt.originalSha256,oldReceipt.preparedSha256].includes(hash(currentBytes)));}
 else if(archived)assert.equal(hash(archived),hash(currentBytes),'Orphan backup differs');
 const original=archived??currentBytes;
 const parser=parserFor(root),patch=patchMessaging36DefaultExport(original.toString('utf8'),(await fs.readFile(previewPath)).toString('utf8'),plan,parser.ts);
 const prepared=Buffer.from(patch.source),config=admitMessaging36PublicConfig(await common.readMessaging36PublicConfig(root),plan),input=Buffer.from(JSON.stringify(config)+'\n');
 const configReady=true,configHash=hash(Buffer.from(JSON.stringify(config)));
 assert.equal(configHash,snapshot.publicConfigSha256);
 if(oldReceipt){assert.equal(oldReceipt.originalSha256,hash(original));assert.equal(oldReceipt.preparedSha256,hash(prepared));assert.equal(oldReceipt.sourceFingerprint,snapshot.fingerprint);}
 if(!archived)await fs.writeFile(originalPath,original,{flag:'wx'});
 const publicDir=await safe(root,outputRelative+'/public',{directory:true});
 const notices=path.join(publicDir,'third-party');await fs.mkdir(notices,{recursive:true});await fs.copyFile(await safe(root,'packages/text/UNICODE-SEGMENTER-LICENSE.txt'),path.join(notices,'unicode-segmenter-MIT.txt'));await fs.copyFile(await safe(root,'packages/text/tests/fixtures/UNICODE-LICENSE.txt'),path.join(notices,'unicode-data-V3.txt'));
 if(configReady)await fs.writeFile(path.join(publicDir,'connect-public-config.json'),input);
 else await fs.writeFile(path.join(publicDir,'connect-public-config.example.json'),JSON.stringify(messaging36PublicConfigExample,null,2)+'\n');
 const receipt={schemaVersion:1,state:configReady?'prepared-not-exported-not-published':'prepared-config-required-not-exportable',sourceFingerprint:snapshot.fingerprint,planSha256:snapshot.planSha256,release:plan.release,versionCode:plan.versionCode,
  originalSha256:hash(original),preparedSha256:hash(prepared),publicConfigSha256:configHash,publicConfigInput:configRelative,publicConfigOutput:configReady?outputRelative+'/public/connect-public-config.json':null,
  factoryUnchanged:patch.factoryUnchanged,otherSourceBytesUnchanged:patch.otherSourceBytesUnchanged,modes:patch.modes,version:patch.version,parser:{scope:parser.scope,version:parser.ts.version,astOnly:true},
  rollback:{source:outputRelative+'/App.web.original.tsx',target:'apps/mobile/App.web.tsx',method:'prepare-web.mjs --root CANDIDATE --restore-only; exact hashes required'},
  defaultEntryPatchedOnlyInOwnedClone:true,backendAccessChanged:false,expoExecuted:false,bundleExported:false,browserTested:false,published:false};
 // Receipt precedes the only source write so an interrupted patch can be restored.
 await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
 await fs.writeFile(appPath,prepared);
 assert.equal(hash(await fs.readFile(appPath)),receipt.preparedSha256);
 return receipt;
}
export async function restoreMessaging36Web(candidate){
 const common=await import('./prepare-source.mjs');await common.assertMessaging36CandidateRoot(candidate);
 const root=await fs.realpath(path.resolve(candidate)),receiptPath=await safe(root,outputRelative+'/receipt.json'),receipt=JSON.parse(await fs.readFile(receiptPath));
 const original=await fs.readFile(await safe(root,outputRelative+'/App.web.original.tsx')),target=await safe(root,'apps/mobile/App.web.tsx'),current=await fs.readFile(target);
 assert.equal(hash(original),receipt.originalSha256);assert([receipt.originalSha256,receipt.preparedSha256].includes(hash(current)));
 if(hash(current)!==receipt.originalSha256)await fs.writeFile(target,original);
 assert.equal(hash(await fs.readFile(target)),receipt.originalSha256);
 return{state:'restored-exact-original-web-default',originalSha256:receipt.originalSha256,otherFilesChanged:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  assert.equal(process.argv.length,5);assert.equal(process.argv[2],'--root');assert(['--prepare-only','--restore-only'].includes(process.argv[4]));
  const result=process.argv[4]==='--prepare-only'?await prepareMessaging36Web(process.argv[3]):await restoreMessaging36Web(process.argv[3]);
  console.log(JSON.stringify(result));
 }catch{console.error('Messaging36 web preparation unavailable; no builder/deploy was invoked.');process.exitCode=1;}
}
