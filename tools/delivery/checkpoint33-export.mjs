// Source-only checkpoint export. No Git stage, credentials, network, build or app tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=process.cwd(),req=createRequire(import.meta.url),ts=req('../../apps/mobile/node_modules/typescript/lib/typescript.js');
if(process.argv.length!==3||!['--export-dry-run','--refresh-export'].includes(process.argv[2]))throw Error('Use --export-dry-run or --refresh-export');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFile(path.join(root,p)),exists=async p=>fs.access(path.join(root,p)).then(()=>true,()=>false);
const reviews=JSON.parse(await read('tools/delivery/checkpoint33-review-policy.json'));
const baseline={proposedFiles:{length:reviews.originalProposed}};
assert.equal(reviews.files.length,reviews.count);assert(reviews.count>=65);
for(const r of reviews.files)assert.equal(sha(await read(r.path)),r.sourceSha256,'Review input changed: '+r.path);
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(r.status)throw Error('Git read failed');return r.stdout.trim();};
const index=git(['rev-parse','--git-path','index']),indexBefore=sha(await fs.readFile(index));
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out='output/checkpoint33-export-'+stamp,tree=out+'/source';
await fs.mkdir(tree,{recursive:true});
const selected=new Set(),todo=[],edges=[],blocked=[],runtimeLocations=[],external=new Set(),syntaxIssues=[];
const deny=p=>/(^|\/)(node_modules|output|\.git|\.expo|\.gradle|android|ios)\//.test(p)||/\.INPUT\.json$|\.env(?:\.|$)|\.(?:dpapi|pem|key|jks|keystore|p12|apk|aab|zip|gz|tar|log)$/i.test(p)||(p.startsWith('supabase/deployment/')&&p!=='supabase/deployment/company-registry-managed-runtime/preview-runtime.ts')||/(?:^|\/)(?:screenshots|test-results|coverage)\//.test(p)||/(?:credential-private|session-private|auth-state|host-audio-public-keys|closure-public|receipt|validation|proof|audit|snapshot|evidence).*\.json$/i.test(p);
async function add(p,via='seed'){
 p=path.posix.normalize(p.replaceAll('\\','/'));
 if(p.startsWith('../')||path.isAbsolute(p)||deny(p)){blocked.push({path:p,via,reason:'outside-source-or-evidence-custody'});return;}
 if(!await exists(p)){blocked.push({path:p,via,reason:'missing-source'});return;}
 const st=await fs.lstat(path.join(root,p));if(!st.isFile()||st.isSymbolicLink()){blocked.push({path:p,via,reason:'not-regular'});return;}
 if(!selected.has(p)){selected.add(p);todo.push(p);}
}
async function walk(p,predicate){for(const d of await fs.readdir(path.join(root,p),{withFileTypes:true})){const f=p+'/'+d.name;if(d.isDirectory())await walk(f,predicate);else if(d.isFile()&&predicate(f))await add(f);}}
const fixed=['tools/web-e2e/smoke-messaging33-export.mjs','AGENTS.md','README.md','.gitignore','package.json','project-board.json','scripts/project.mjs','docs/project/AMBIENTE.md','docs/project/STATUS.md','docs/delivery/ENTREGAS.md','docs/testing/ESTRATEGIA.md','docs/testing/ROTEIRO-APK-WEB-0.0.33-PREPARED.md','delivery/manifest-0.0.33.PREPARED.json','apps/mobile/App.tsx','apps/mobile/App.web.tsx','apps/mobile/index.ts','apps/mobile/app.json','apps/mobile/metro.config.cjs','apps/mobile/tsconfig.json','apps/mobile/package.json','apps/mobile/package-lock.json','apps/mobile/scripts/expo.mjs','apps/mobile/scripts/build-connected-basic-text-android.ps1','apps/mobile/scripts/prepare-connected-basic-text.mjs','apps/mobile/scripts/connected-expo-config.mjs','apps/mobile/scripts/inspect-connected-basic-text-apk.ps1','apps/mobile/scripts/connected-basic-text-android.init.gradle','apps/mobile/scripts/keyboard-receipts32-android.init.gradle','apps/mobile/scripts/build-messaging33-android.ps1','apps/mobile/scripts/inspect-messaging33-apk.ps1','packages/text/UNICODE-SEGMENTER-LICENSE.txt','packages/text/tests/fixtures/UNICODE-LICENSE.txt','tools/delivery/prepare-messaging33.mjs','tools/delivery/checkpoint33-export.mjs','tools/delivery/checkpoint33-review-policy.json','tools/delivery/checkpoint33-retake-dry-run.mjs','tools/delivery/checkpoint33-classify-references.mjs','delivery/checkpoint33-SOURCE-EXPORT.md'];
for(const f of fixed)await add(f);
await walk('apps/mobile/src',p=>/\.(?:ts|tsx|json)$/.test(p));
await walk('apps/mobile/native',p=>/\.(?:kt|java|xml|json)$/.test(p));
await walk('apps/mobile/assets',p=>!/\.(?:apk|aab|zip)$/.test(p));
await walk('apps/mobile/candidates/messaging33',()=>true);
await walk('apps/mobile/candidates/connected-basic-text',p=>/\.(?:xml|json|tsx|template)$/.test(p));
const focused=['company-preview-focused.test.mjs','conversation-cache.test.mjs','conversation-image-read.test.ts','empty-conversation-refresh.test.mjs','keyboard-message-viewport.test.ts','membership-invite-flow.test.mjs','message-removal-audio-action.test.mjs','message-removal-bridge.test.ts','message-removal-controller.test.ts','message-removal-http.test.ts','message-removal-image-selection.test.mjs','message-removal-normal-entry.test.mjs','message-removal-sync.test.ts','quiet-latest-refresh.test.mjs','receipt-indicators-integration.test.mjs','received-audio-cache.test.mjs','recent-local-images.test.ts','web-composer-keyboard.test.mjs'];
for(const f of focused)await add('apps/mobile/tests/'+f);
for(const d of await fs.readdir(path.join(root,'packages'))){
 await walk('packages/'+d+'/src',p=>/\.(?:ts|tsx|json)$/.test(p));
 for(const f of await fs.readdir(path.join(root,'packages',d)))if(/^(?:package(?:-lock)?\.json|tsconfig.*\.json|README\.md)$/.test(f))await add('packages/'+d+'/'+f);
}
await walk('supabase/migrations',p=>p.endsWith('.sql'));
await walk('supabase/candidates/image-message/normal-eligibility',p=>/\.(?:mjs|sql|md)$/.test(p));
for(const d of await fs.readdir(path.join(root,'supabase/candidates/image-message'),{withFileTypes:true}))if(d.isFile()&&/\.(?:LOCAL|CANDIDATE)\.sql$/.test(d.name))await add('supabase/candidates/image-message/'+d.name);
await add('supabase/candidates/image-message/test-normal-eligibility-local.mjs');
await walk('supabase/tests/checkpoint-fixture',p=>/\.(?:mjs|sql|json|md)$/.test(p));
await walk('supabase/runtime/image-node/normal/linux-validation',p=>/\.(?:mjs|py|md)$/.test(p));
for(const directory of ['audio-one-task','audio-one-producer'])await walk('supabase/candidates/'+directory,p=>p.endsWith('/guard.LOCAL.sql'));
await add('supabase/tests/local-postgres-harness.mjs');
await add('supabase/tests/postgres-auth-fixture.sql');
await add('supabase/runtime/image-node/normal/entry.mjs');
await add('supabase/runtime/image-node/normal/boundary.test.mjs');
await add('supabase/runtime/image-node/normal/README.md');
await add('supabase/runtime/image-node/normal/CONFIG.example.json');
await add('supabase/runtime/image-node/normal/codec-connection.py');
await add('supabase/runtime/image-node/normal/health.mjs');
await add('supabase/runtime/image-node/normal/access-review.PREPARED.json');
await add('supabase/runtime/image-node/normal/remote-effects.PREPARED.json');
await walk('supabase/runtime/image-node/normal/systemd',()=>true);
await walk('docs/product',p=>p.endsWith('.md'));
async function resolveImport(p,ref){
 const base=path.posix.normalize(path.posix.join(path.posix.dirname(p),ref));
 for(const file of[base,...['.ts','.tsx','.mjs','.js','.cjs','.json'].map(e=>base+e),base+'/index.ts',base+'/index.tsx'])if(await exists(file))return file;
 return base;
}
while(todo.length){
 const p=todo.shift();
 if(!/\.(?:[cm]?[jt]sx?|tsx\.template)$/.test(p))continue;
 const text=(await read(p)).toString('utf8'),source=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,p.endsWith('.tsx')||p.endsWith('.tsx.template')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(source.parseDiagnostics.length)syntaxIssues.push({path:p,parseErrors:source.parseDiagnostics.length});
 const refs=[];
 const visit=n=>{
  if(ts.isStringLiteralLike(n)&&/^supabase\/.+\.(?:sql|mjs|ts|json)$/.test(n.text)&&!/(?:READONLY|UNAPPLIED|COMPILED)/.test(n.text))refs.push(path.posix.relative(path.posix.dirname(p),n.text).replace(/^(?!\.)/,'./'));
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteralLike(n.moduleSpecifier))refs.push(n.moduleSpecifier.text);
  if(ts.isCallExpression(n)&&n.arguments.length&&ts.isStringLiteralLike(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require'))refs.push(n.arguments[0].text);
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='URL'&&n.arguments?.length&&ts.isStringLiteralLike(n.arguments[0])&&n.arguments[0].text.startsWith('.')){const ref=n.arguments[0].text;if(ref.endsWith('/')||ref.includes('/node_modules/'))runtimeLocations.push({from:p,relativePath:ref,kind:ref.includes('/node_modules/')?'locked-installed-tool':'source-or-generated-directory'});else refs.push(ref);}
  ts.forEachChild(n,visit);
 };visit(source);
 for(const ref of refs){if(!ref.startsWith('.')){external.add(ref);continue;}const target=await resolveImport(p,ref);if(target.includes('/node_modules/')){const part=target.split('/node_modules/')[1],module=part.startsWith('@')?part.split('/').slice(0,2).join('/'):part.split('/')[0];const lock=JSON.parse(await read('apps/mobile/package-lock.json'));assert(lock.packages['node_modules/'+module],'Installed module missing lockfile pin');external.add(module);runtimeLocations.push({from:p,relativePath:ref,kind:'locked-installed-module',module,version:lock.packages['node_modules/'+module].version});continue;}edges.push({from:p,to:target});await add(target,p);}
}
const sourceFiles=[];
for(const p of [...selected].sort()){
 const b=await read(p),st=await fs.lstat(path.join(root,p));assert(st.isFile()&&!st.isSymbolicLink());
 if(/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}/.test(b.toString('utf8')))throw Error('JWT literal cannot be exported; prepare public configuration placeholder instead: '+p);
 const target=path.join(root,tree,p);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,b);
 assert.equal(sha(await fs.readFile(target)),sha(b));
 sourceFiles.push({path:p,bytes:b.length,sha256:sha(b)});
}
// Existing source-only synthetic literals can be retained; real custody and
// ephemeral session/receipt files are absent by construction. This is not a DLP claim.
const decisions=reviews.files.map(r=>({path:r.path,categories:r.categories,decision:r.decision,basis:r.basis,sourceSha256:r.sourceSha256,included:selected.has(r.path)}));
const board=JSON.parse(await read('project-board.json')),refs=[];
for(const item of board.items)for(const p of item.evidence??[]){if(selected.has(p))continue;let digest=null,size=null;try{if(/\.env|credential-private|session-private|\.dpapi|\.pem|\.keystore|\.jks/i.test(p))throw Error('Private path omitted');const st=await fs.lstat(path.join(root,p));if(st.isFile()&&!st.isSymbolicLink()){const b=await read(p);digest=sha(b);size=b.length;}}catch{}refs.push({item:item.id,path:p,sha256:digest,bytes:size,status:'historical-reference-not-exported',functionalResultNotRevalidated:true});}
const project=process.argv[2]==='--export-dry-run'?spawnSync(process.execPath,['scripts/project.mjs','--check'],{cwd:path.join(root,tree),encoding:'utf8',windowsHide:true,timeout:10000}):{status:null,stderr:'',notRerunReason:'Known historical evidence-path gate; metadata refresh only.'};
const failure=(project.stderr??'').includes('ENOENT')?'historical-evidence-path-absent':project.status===0?null:project.status===null?'known-gate-not-rerun':'check-failed';
assert.equal(sha(await fs.readFile(index)),indexBefore,'Main index changed');
const result={schemaVersion:1,state:'curated-source-export-verified-release-reproduction-still-blocked',export:tree,sourceBranch:git(['branch','--show-current']),sourceHead:git(['rev-parse','HEAD']),sourceCommitCreated:false,
 literalPolicySha256:sha(await read('tools/delivery/checkpoint33-review-policy.json')),sourceFiles,sourceFingerprint:sha(Buffer.from(JSON.stringify(sourceFiles))),
 originalProposed:baseline.proposedFiles.length,curatedFiles:sourceFiles.length,reviewedLiteralFiles:decisions.length,literalDecisions:decisions,
 dependencyEdges:edges.length,runtimeLocations,blockedDependencies:blocked,externalModuleNames:[...external].sort(),syntaxIssues,
 checks:{fileHashes:true,relativeImportClosure:!blocked.some(x=>x.via!=='seed'),typescriptSyntax:syntaxIssues.length===0,mainIndexUnchanged:true,canonicalProjectCheck:{exitCode:project.status,reason:failure,notRerunReason:project.notRerunReason??null},cleanCloneInstall:false,androidBuild:false,webBuild:false,authOrNetwork:false,applicationTestsRun:0},
 history:{unexportedReferences:refs.length,manifest:out+'/historical-reference-provenance.json',notEvidenceOfFunctionalResult:true},
 gates:['No fresh npm-ci/Android native regeneration/build or Linux runtime run; cannot claim release reproducibility.','Review root/builders that still require historical deployment receipts and version-specific pins.','Canonical project checker requires historical evidence file paths. Retain immutable provenance and review archive-reference contract before source-only clone can pass; do not create fake evidence files or silently weaken check.'],
 noStage:true,noPush:true,noApk:true,noPublish:true};
await fs.writeFile(path.join(root,out,'historical-reference-provenance.json'),JSON.stringify({state:'path-hash-provenance-only-not-functional-evidence',references:refs},null,2)+'\n');
await fs.writeFile(path.join(root,out,'result.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(root,'output/checkpoint33-review/export-current.json'),JSON.stringify({export:tree,result:out+'/result.json',sourceFingerprint:result.sourceFingerprint},null,2)+'\n');
console.log(JSON.stringify({state:result.state,export:tree,originalProposed:baseline.proposedFiles.length,curatedFiles:sourceFiles.length,literalsReviewed:decisions.length,dependencyEdges:edges.length,blockedDependencyCount:blocked.filter(x=>x.via!=='seed').length,syntaxIssues:syntaxIssues.length,projectCheckExit:project.status,projectCheckReason:failure,unexportedHistoricalReferences:refs.length,indexUnchanged:true,sourceFingerprint:result.sourceFingerprint}));

