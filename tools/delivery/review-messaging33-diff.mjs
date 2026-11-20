// Local hygiene only: overlay selected current sources onto local origin/main.
// No index, commit, branch, remote call, application test or package install.
import fs from'node:fs/promises';import path from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';import assert from'node:assert/strict';
assert.deepEqual(process.argv.slice(2),['--review-only']);
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFile(p),exists=p=>fs.access(p).then(()=>true,()=>false);
const git=(args,encoding='utf8')=>{const r=spawnSync('git',args,{encoding,windowsHide:true,maxBuffer:32*1024*1024});if(r.status!==0)throw Error('Git read failed: '+args[0]);return r.stdout;};
const root=process.cwd(),baseRef='origin/main',baseSha=git(['rev-parse',baseRef]).trim(),head=git(['rev-parse','HEAD']).trim(),index=git(['rev-parse','--git-path','index']).trim(),indexBefore=sha(await read(index));
assert.equal(baseSha,'34d1066709ccc862c1234c575d96675ac1c3b86f','Unexpected local remote-tracking base');
const previous=JSON.parse(await read('output/checkpoint33-review/export-current.json')),snapshot=JSON.parse(await read(previous.result)),policy=JSON.parse(await read('tools/delivery/checkpoint33-review-policy.json'));
const approved=new Map(policy.files.map(x=>[x.path,x]));
const candidates=new Set(snapshot.sourceFiles.map(x=>x.path));
const forbidden=p=>/(^|\/)(node_modules|output|\.git|\.expo|\.gradle|android|ios|__pycache__|screenshots|test-results|coverage)\//.test(p)||/\.INPUT\.json$|(?:^|\/)\.env(?:\.|$)|\.(?:dpapi|pem|key|jks|keystore|p12|apk|aab|zip|gz|tar|log|pyc)$/i.test(p)||/(?:READONLY|REQUEST|receipt|validation|proof|audit|snapshot|evidence|metadata|execution|staged-runtime-real|transient-boundary-real).*\.json$/i.test(p);
const manual=new Map([
 ['project-board.json','Canonical board contains embedded historical results; review source-only context/reference contract before checkpoint, never copy evidence payload to satisfy check.'],
 ['docs/project/AMBIENTE.md','Living context includes historical execution payload; needs concise portable source context, preserve original checkout.'],
 ['docs/project/STATUS.md','Generated from canonical board; regenerate only with reviewed source-only reference contract.'],
 ['delivery/manifest-0.0.33.PREPARED.json','Generated local preparation/inventory; final release manifest belongs to closure.'],
 ['apps/mobile/candidates/messaging33/preparation.json','Local preparation receipt, not build source.'],
 ['supabase/candidates/image-message/normal-service-edge-preparation.json','Recorded preparation evidence, regenerate from source when needed.']
]);
async function walk(dir,keep){for(const x of await fs.readdir(dir,{withFileTypes:true})){const p=dir+'/'+x.name;if(x.isDirectory()&&!forbidden(p+'/'))await walk(p,keep);else if(x.isFile()&&keep(p))candidates.add(p);}}
await walk('supabase/candidates/image-message/normal-activation',p=>/\.(mjs|sql|md)$/.test(p));
for(const p of['supabase/runtime/image-node/normal/linux-validation/selected-runtime-v4.py','supabase/runtime/image-node/normal/linux-validation/verify-staged-elf.py','tools/web-e2e/smoke-messaging33-export.mjs','tools/delivery/review-messaging33-diff.mjs','supabase/runtime/image-node/normal/ACTIVATION-PLAN.PREPARED.md'])candidates.add(p);
for(const p of ['supabase/runtime/image-node/normal/install-normal.py','supabase/runtime/image-node/normal/prepare-install.py','supabase/runtime/image-node/normal/install-check.py','supabase/runtime/image-node/normal/INSTALL-NORMAL.md','supabase/candidates/image-message/normal-activation/normal-access.mjs','supabase/candidates/image-message/normal-activation/normal-access-local.mjs','supabase/candidates/image-message/normal-activation/history-off-local.mjs','supabase/candidates/image-message/normal-activation/activate.NORMAL.UNAPPLIED.sql','supabase/candidates/image-message/normal-activation/close.NORMAL.UNAPPLIED.sql','supabase/candidates/image-message/normal-activation/restore.BASELINE-ACL.UNAPPLIED.sql','supabase/candidates/image-message/normal-activation/audit.NORMAL.READONLY.sql'])candidates.add(p);
for(const p of ['supabase/runtime/image-node/normal/credential-acl.py','supabase/runtime/image-node/normal/credential-permissions.test.mjs','supabase/runtime/image-node/normal/activation-gate.mjs','supabase/runtime/image-node/normal/activation-gate.test.mjs'])candidates.add(p);
for(const p of ['scripts/project-evidence.mjs','scripts/project-evidence.test.mjs','tools/delivery/prepare-checkpoint33-final.mjs'])candidates.add(p);
candidates.add('docs/delivery/CONNECT-0.0.33-CANDIDATO.md');
const baseRows=git(['ls-tree','-r','-z',baseRef]).split('\0').filter(Boolean).map(x=>{const [meta,p]=x.split('\t');const[mode,type,oid]=meta.split(' ');return{path:p,mode,type,oid};}),baseFiles=new Map(baseRows.map(x=>[x.path,x]));
const out='output/checkpoint33-main-diff-'+new Date().toISOString().replace(/[:.]/g,'-'),before=out+'/before',after=out+'/after';await fs.mkdir(before,{recursive:true});await fs.mkdir(after,{recursive:true});
const selected=[],held=[],excluded=[],reviewed=[];
function findings(bytes){const s=bytes.toString('utf8'),classes=[];
 if(/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}/.test(s))classes.push('serialized-JWT');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40}/.test(s))classes.push('private-key');
 if(/\$2[aby]\$\d\d\$[A-Za-z0-9./]{50,}/.test(s))classes.push('password-hash');
 if(/(?:password|service_role_key|secret_key)\s*[:=]\s*['"][^'"\r\n]{8,}['"]/i.test(s))classes.push('credential-looking-literal');
 return classes;}
for(const p of[...candidates].sort()){
 if(forbidden(p)){excluded.push({path:p,reason:'custody-evidence-generated-or-dependency'});continue;}
 if(manual.has(p)){held.push({path:p,reason:manual.get(p)});continue;}
 if(!await exists(p)){held.push({path:p,reason:'selected-source-missing'});continue;}
 const st=await fs.lstat(p);if(!st.isFile()||st.isSymbolicLink()){held.push({path:p,reason:'not-regular-source'});continue;}
 const bytes=await read(p),fp=sha(bytes),prior=approved.get(p),flags=findings(bytes);
 if(prior&&prior.sourceSha256!==fp){held.push({path:p,reason:'previous-literal-review-hash-changed',categories:flags});continue;}
 if(flags.some(x=>x!=='credential-looking-literal')||flags.length&&!prior){held.push({path:p,reason:'literal-review-required-no-values-printed',categories:flags});continue;}
 if(prior)reviewed.push({path:p,decision:prior.decision,hashMatches:true});
 const old=baseFiles.get(p),baseline=old?.type==='blob'?git(['cat-file','blob',old.oid],null):null;
 if(baseline&&findings(baseline).some(x=>x!=='credential-looking-literal')){held.push({path:p,reason:'base-literal-cannot-be-included-in-patch'});continue;}
 if(baseline){await fs.mkdir(path.dirname(before+'/'+p),{recursive:true});await fs.writeFile(before+'/'+p,baseline);}
 await fs.mkdir(path.dirname(after+'/'+p),{recursive:true});await fs.writeFile(after+'/'+p,bytes);
 selected.push({path:p,status:!baseline?'added':baseline.equals(bytes)?'unchanged':'modified',bytes:bytes.length,sha256:fp,baseBlob:old?.oid??null});
}
const diff=spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--binary','--no-renames','--src-prefix=a/','--dst-prefix=b/','before','after'],{cwd:path.resolve(out),encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});assert([0,1].includes(diff.status));
const patch=diff.stdout.replaceAll('a/before/','a/').replaceAll('a/after/','a/').replaceAll('b/after/','b/');await fs.writeFile(out+'/curated-origin-main.diff',patch);
// Read-only patch applicability check against exactly the selected origin/main bytes.
// --check never applies files or stages; unselected base paths are untouched by patch.
const gitDir=git(['rev-parse','--absolute-git-dir']).trim();
const applicability=spawnSync('git',['--git-dir='+gitDir,'--work-tree='+path.resolve(before),'apply','--check',path.resolve(out+'/curated-origin-main.diff')],{cwd:path.resolve(before),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
assert.equal(sha(await read(index)),indexBefore,'Main index changed');assert.equal(git(['rev-parse','HEAD']).trim(),head);
const result={state:'delimited-source-overlay-diff-not-a-release-checkpoint',base:{ref:baseRef,sha:baseSha,source:'local remote-tracking ref; not refreshed or remotely verified this round'},workingHead:head,historyCommitsIncluded:0,baseTrackedFiles:baseRows.length,selectedFiles:selected.length,changes:{added:selected.filter(x=>x.status==='added').length,modified:selected.filter(x=>x.status==='modified').length,unchanged:selected.filter(x=>x.status==='unchanged').length,deleted:0},unselectedBaseFilesPreserved:true,patch:out+'/curated-origin-main.diff',patchSha256:sha(Buffer.from(patch)),patchBytes:Buffer.byteLength(patch),patchApplicabilityCheck:{exitCode:applicability.status,against:'selected origin/main blob bytes; --check only, no apply/index',diagnosticCount:applicability.stderr.split('\n').filter(Boolean).length},selected,held,excluded,reviewedLiteralFiles:reviewed,previousClosureEvidence:previous.result,claim:'Existing import-closure/lock/build checks are reused, NOT rerun. This new step only selects/hashes/scans current sources and generates a base-anchored diff.',gates:['Held literals/context/generated files need closure review; no evidence archive imported.','Admin compilers use external recorded structure/ACL inputs excluded from source checkpoint; compiled UNAPPLIED SQL is included for review.','Canonical board historical evidence/reference contract remains unresolved; no checker weakened or fake receipts created.','This source overlay is not a commit/clean-clone build or final signed release.'],mainIndexUnchanged:true,noStage:true,noCommit:true,noPush:true,noBuild:true,noApplicationTests:true,noRemoteCalls:true};
await fs.writeFile(out+'/review.json',JSON.stringify(result,null,2)+'\n');await fs.writeFile('output/checkpoint33-review/main-diff-current.json',JSON.stringify({review:out+'/review.json',patch:result.patch,baseSha,patchSha256:result.patchSha256},null,2)+'\n');
console.log(JSON.stringify({state:result.state,baseSha,selected:result.selectedFiles,changes:result.changes,held:held.length,excluded:excluded.length,patch:result.patch,patchBytes:result.patchBytes,patchSha256:result.patchSha256,mainIndexUnchanged:true,noStage:true,noCommit:true,noRemoteCalls:true}));
