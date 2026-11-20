// PREPARE ONLY. No build, install, server, deploy, stage, commit or push.
import fs from'node:fs/promises';import path from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';import assert from'node:assert/strict';
if(process.argv.length!==3||process.argv[2]!=='--prepare-only')throw Error('Preparation only');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFile(p,'utf8'),root=process.cwd();
const plan=JSON.parse(await read('apps/mobile/candidates/messaging33/release-plan.PREPARED.json'));
assert.equal(plan.release,'0.0.33-mensagens');assert.equal(plan.versionCode,33);assert.equal(plan.web.origin,'https://connect.resicheck.com.br');
const version={versionName:plan.release,versionCode:plan.versionCode,internalQa:false},out='output/messaging33-normal-preparation';
await fs.mkdir(out,{recursive:true});
const identities=[];
for(const platform of['android','web']){
 const file='apps/mobile/candidates/messaging33/entry.'+platform+'.tsx.template',entry=await read(file);
 assert(entry.includes(version.versionName)&&entry.includes('versionCode":33'));assert(entry.includes('candidate-private-v1'));
 identities.push({platform,entryTemplate:file,sha256:sha(entry),version});
}
const spec={schemaVersion:1,status:'prepared-not-built-not-bumped-not-published',version:plan.release,versionCode:33,sourceRevision:null,
 common:{gate:'Normal image availability reviewed and enabled before grouped artifact regression; proof already passed and remains OFF.',manifest:'delivery/manifest-0.0.33.PREPARED.json'},
 android:{status:'prepared',candidateCount:0,package:plan.android.package,abis:plan.android.architectures,certificateSha256:plan.android.signingCertificateSha256,signingMaterial:'existing private custody, excluded from Git',apk:null,apkSha256:null,regression:'not-run-on-candidate',entry:identities[0]},
 web:{status:'prepared',origin:plan.web.origin,version:plan.release,bundle:null,bundleSha256:null,browserSmoke:'not-run',published:false,rollback:'retain previous Connect frontend only',entry:identities[1],hostingHeaderGate:'Verify scoped Connect img-src permits required blob preview; do not change main site CSP.'},
 git:{status:'mapping-only',stage:false,push:false,remoteRef:null,sourceCommit:null,cleanCloneVerified:false},
 regression:JSON.parse(await read('apps/mobile/candidates/messaging33/regression-plan.json')).cases?.map(c=>({id:c.id,title:c.title,checks:c.candidateChecks??[],status:'not-run'}))??[],
 knownLimits:['Backend image proof passed but normal service/permissions are OFF.','New non-root/systemd/decoder boundary has local contract checks only; Linux validation pending.','Current image inspector is bound to one company; no unreviewed global/multi-company enablement.','Physical first-resume crash remains open.']};

// Isolated source inputs only, never Gradle/Expo or default entry mutation.
await fs.mkdir(out+'/android',{recursive:true});await fs.mkdir(out+'/web',{recursive:true});
let nativeManifest=await read('apps/mobile/candidates/connected-basic-text/AndroidManifest.xml');
assert.equal(nativeManifest.split('__APP_LABEL__').length,2);
nativeManifest=nativeManifest.replace('__APP_LABEL__',plan.android.label).replace('android.permission.RECORD_AUDIO" tools:node="remove"','android.permission.RECORD_AUDIO"');
assert(nativeManifest.includes('android:allowBackup="false"')&&nativeManifest.includes('android:usesCleartextTraffic="false"'));
await fs.writeFile(out+'/android/AndroidManifest.xml',nativeManifest);
await fs.writeFile(out+'/android/entry.tsx',await read(identities[0].entryTemplate));
await fs.writeFile(out+'/web/entry.web.tsx.template',await read(identities[1].entryTemplate));
const expoPackage=JSON.parse(await read('apps/mobile/node_modules/expo/package.json'));
await fs.writeFile(out+'/android/app.config',JSON.stringify({name:plan.android.label,slug:'connect-messaging33',version:plan.release,sdkVersion:expoPackage.version.split('.')[0]+'.0.0',platforms:['android'],android:{package:plan.android.package,versionCode:33,permissions:plan.android.permissions,allowBackup:false},extra:{deliveryCandidate:true,realBackend:true,syntheticDataOnly:true,normalImageAvailabilityRequired:true},updates:{enabled:false}})+'\n');
const init=await read('apps/mobile/candidates/messaging33/messaging33-android.init.gradle');
assert(init.includes('release.versionCode')&&init.includes('signingConfig = null'));
await fs.writeFile(out+'/android/messaging33-android.init.gradle',init);
let validated=null;try{validated=JSON.parse(await read('apps/mobile/candidates/messaging33/builder-validation.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(validated){assert.equal(validated.versionCode,33);assert.equal(validated.android.sourceFingerprint,validated.web.sourceFingerprint);spec.common.sourceFingerprint=validated.sourceFingerprint;spec.common.planSha256=validated.planSha256;spec.common.publicConfigSha256=validated.publicConfigSha256;spec.android.status='native-generated-config-reviewed-not-built';spec.android.nativeRegenerated=true;spec.android.builder='apps/mobile/scripts/build-messaging33-android.ps1';spec.android.inspector='apps/mobile/scripts/inspect-messaging33-apk.ps1';spec.web.status='entry-prepared-factory-preserved-not-exported';spec.web.factoryPreserved=true;}

if(validated?.gradleDryRun?.assembleReleaseSkipped){spec.android.status='gradle-dry-run-passed-no-apk';spec.android.dryRun=validated.gradleDryRun;}
if(validated?.webLocalExport){spec.web.status='exported-locally-static-checked-not-browser-not-published';spec.web.localExport={directory:validated.webLocalExport.directory,exportFingerprint:validated.webLocalExport.exportFingerprint,files:validated.webLocalExport.files};}

if(validated?.webBrowserSmoke){spec.web.status='exported-locally-browser-login-smoke-passed-not-published';spec.web.browserSmoke=validated.webBrowserSmoke;}
  spec.android.preparedInputs=out+'/android';spec.web.preparedEntry=out+'/web/entry.web.tsx.template';
spec.android.remainingBuildWork='New33 adapter/inspector use the common plan; availability/joint release gate required before unsigned build, signing and artifact regression. No historical23/32 builder used.';
spec.web.remainingBuildWork='Export and fresh-profile local login browser smoke passed in owned clone. Auth/chat/media UI regression remains at joint candidate gate; preserve previous Connect hosting for rollback.';

await fs.writeFile('delivery/manifest-0.0.33.PREPARED.json',JSON.stringify(spec,null,2)+'\n');
// Git inventory is metadata only. Files are not copied/staged; secret-looking
// literals only yield a file/category, never the matched value.
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:16777216});if(r.status!==0)throw Error('Git read failed');return r.stdout;};
const head=git(['rev-parse','HEAD']).trim(),branch=git(['branch','--show-current']).trim(),indexPath=git(['rev-parse','--git-path','index']).trim(),before=sha(await fs.readFile(indexPath));
const paths=[...new Set(git(['-c','core.quotePath=false','ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))].sort();
const include=[],excluded=[],review=[];
const canonical=new Set(['apps/mobile/scripts/keyboard-receipts32-android.init.gradle','AGENTS.md','README.md','.gitignore','package.json','package-lock.json','project-board.json','scripts/project.mjs','tools/delivery/prepare-messaging33.mjs','docs/project/AMBIENTE.md','docs/project/STATUS.md','docs/project/PROJECT-MANAGEMENT.md','docs/delivery/ENTREGAS.md','docs/testing/ESTRATEGIA.md','docs/testing/ROTEIRO-APK-WEB-0.0.33-PREPARED.md','delivery/manifest-0.0.33.PREPARED.json','supabase/candidates/image-message/prepare-normal-service-edge.mjs']);
const currentSource=p=>canonical.has(p)||/^apps\/mobile\/(?:src|native|assets|previews|tests|candidates\/messaging33|candidates\/connected-basic-text)\//.test(p)||/^apps\/mobile\/(?:[^/]+\.(?:json|js|mjs|cjs|ts|tsx))$/.test(p)||/^packages\/[^/]+\/(?:src|tests)\//.test(p)||/^packages\/[^/]+\/(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|README\.md)$/.test(p)||p.startsWith('supabase/runtime/')||p.startsWith('supabase/migrations/')||p.startsWith('docs/product/')||/^apps\/mobile\/scripts\/(?:build-connected-basic-text-android\.ps1|prepare-connected-basic-text\.mjs|connected-expo-config\.mjs|expo\.mjs)$/.test(p);
const prefixes=['apps/mobile/','packages/','scripts/','tools/','supabase/runtime/','supabase/candidates/','supabase/migrations/','docs/','delivery/'];
for(const p of paths){
 let reason=currentSource(p)?null:'historical-or-unselected-source';
 if(/(?:credential|custody|auth-state|session-private|refresh-token|secret).*(?:\.json|\.txt|\.bin)$/i.test(path.basename(p))&&!/\.example\./.test(p))reason='private-state-name';
 if(!prefixes.some(x=>p.startsWith(x))&&!['AGENTS.md','README.md','package.json','package-lock.json','.gitignore','project-board.json'].includes(p))reason='outside-proposed-source-scope';
 if(/(?:^|\/)(?:node_modules|output|\.git|\.expo|\.gradle|android|ios)(?:\/|$)/.test(p)||/\.env(?:\.|$)|\.dpapi$|\.pem$|\.key$|\.jks$|\.keystore$|\.p12$/i.test(p))reason='custody-cache-or-generated';
 if(/\.(?:apk|aab|zip|gz|tar|eszip|log|png|jpg|jpeg|mp4|m4a|webm|wav)$/i.test(p)&&!p.startsWith('apps/mobile/assets/'))reason='binary-artifact-or-user-media';
 if(/(?:^|\/)(?:screenshots|test-results|coverage|research)\//i.test(p))reason='evidence-or-history';
 if(/\.(?:REQUEST|COMPILED|READONLY|UNAPPLIED)\./i.test(p))reason='generated-operation-or-evidence';
 if(p.endsWith('.json')&&/(?:validation|receipt|READONLY|proof|result|audit|current|fingerprint|preflight|smoke|handoff|snapshot|evidence)/i.test(path.basename(p))&&!p.includes('/src/'))reason='evidence';
 if(p.startsWith('supabase/deployment/')&&!/\.example\./.test(p))reason='deployment-data';
 if(reason){excluded.push({path:p,reason});continue;}
 let bytes;try{const st=await fs.lstat(p);if(!st.isFile()||st.isSymbolicLink()){excluded.push({path:p,reason:'non-regular-or-link'});continue;}bytes=await fs.readFile(p);}catch{excluded.push({path:p,reason:'missing-working-file'});continue;}
 const text=bytes.toString('utf8'),flags=[];
 if(/sb_secret_[A-Za-z0-9_-]{25,}/.test(text))flags.push('secret-key-like-literal');
 if(/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{20,}/.test(text))flags.push('jwt-like-literal');
 if(/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text))flags.push('private-key');
 if(/(?:password|senha)["']?\s*[:=]\s*['"][^'"\r\n]{12,}['"]/i.test(text))flags.push('password-like-literal-review');
 if(/(?:refresh_token|access_token|client_secret|service_role_key|secretAccessKey)["']?\s*[:=]\s*['"][^'"\r\n]{8,}['"]/i.test(text))flags.push('credential-value-like-literal-review');
 if(/[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)+(?:com|br|org|net)\b/i.test(text)&&!p.endsWith('.example.json'))flags.push('external-email-literal-review');
 if(flags.length){review.push({path:p,categories:flags});continue;}
 include.push({path:p,bytes:bytes.length,sha256:sha(bytes)});
}
const selected=new Set(include.map(x=>x.path)),board=JSON.parse(await read('project-board.json')),blockedReferences=[];
for(const item of board.items)for(const p of item.evidence??[])if(!selected.has(p))blockedReferences.push({item:item.id,path:p});
const after=sha(await fs.readFile(indexPath));assert.equal(after,before);
const inventory={state:'source-checkpoint-mapped-not-staged-not-reproducibility-proof',branch,head,remote:'https://github.com/Spinon/Resicheck_Connect.git',remoteRefRechecked:false,indexUnchanged:true,proposedFiles:include,excluded,requiresLiteralReview:review,
 excludedBoardEvidenceReferences:blockedReferences,cleanCloneVerified:false,important:'Requested evidence exclusion conflicts with current project:check local-path requirements for historical board evidence. Resolve checkpoint packaging/check semantics before claiming clean-clone readiness; do not fabricate evidence or rewrite history.'};
await fs.writeFile(out+'/checkpoint-map.json',JSON.stringify(inventory,null,2)+'\n');
await fs.writeFile(out+'/source-inputs.json',JSON.stringify({version,identities,manifestSha256:sha(await fs.readFile('delivery/manifest-0.0.33.PREPARED.json')),liveEntryHashes:Object.fromEntries(await Promise.all(['apps/mobile/App.tsx','apps/mobile/App.web.tsx'].map(async p=>[p,sha(await fs.readFile(p))]))),build:false,publish:false},null,2)+'\n');
console.log(JSON.stringify({state:'prepared-common33-tracks-and-source-map',version:plan.release,versionCode:33,androidPrepared:true,webPrepared:true,builds:0,proposedFiles:include.length,excludedFiles:excluded.length,literalReviewFiles:review.length,excludedBoardEvidenceReferences:blockedReferences.length,indexUnchanged:true,cleanCloneVerified:false}));
