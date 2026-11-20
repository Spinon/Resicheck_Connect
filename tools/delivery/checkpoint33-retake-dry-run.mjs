// One source clone + offline npm planning + builder inspection. Never builds.
import fs from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
if(process.argv.length!==3||process.argv[2]!=='--dry-run')throw Error('Only --dry-run is supported');
const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFile(p),json=async p=>JSON.parse(await fs.readFile(p,'utf8')),has=p=>fs.access(p).then(()=>true,()=>false);
const pointer=await json('output/checkpoint33-review/export-current.json'),snapshot=await json(pointer.result);
const out=path.resolve('output/checkpoint33-retake-'+new Date().toISOString().replace(/[:.]/g,'-')),seed=path.join(out,'seed'),clone=path.join(out,'clone'),empty=path.join(out,'empty-hooks');
await fs.mkdir(seed,{recursive:true});await fs.mkdir(empty);await fs.writeFile(path.join(out,'empty.config'),'');await fs.writeFile(path.join(out,'npm-user.config'),'');await fs.writeFile(path.join(out,'npm-global.config'),'');
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','COMSPEC','LOCALAPPDATA','JAVA_HOME','ANDROID_HOME'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(out,'empty.config'),GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Connect Disposable Dry Run',GIT_AUTHOR_EMAIL:'noreply@connect.test',GIT_COMMITTER_NAME:'Connect Disposable Dry Run',GIT_COMMITTER_EMAIL:'noreply@connect.test',GIT_CONFIG_COUNT:'0'});
function exec(file,args,cwd,input,timeout=20000){const r=spawnSync(file,args,{cwd,env,encoding:'utf8',windowsHide:true,input,timeout,maxBuffer:4*1024*1024});if(r.error)throw Error('Local process unavailable: '+path.basename(file));return{code:r.status,stdout:r.stdout??'',stderr:r.stderr??''};}
const git=(args,cwd=root,input)=>{const r=exec('git',['-c','core.hooksPath='+empty,'-c','protocol.allow=never','-c','protocol.file.allow=always',...args],cwd,input);assert.equal(r.code,0,'Local Git operation failed');return r.stdout.trim();};
const mainIndexPath=git(['rev-parse','--git-path','index']),mainIndexBefore=sha(await read(mainIndexPath)),mainHead=git(['rev-parse','HEAD']);
for(const f of snapshot.sourceFiles){assert(!path.isAbsolute(f.path)&&!f.path.split(/[\\/]/).includes('..'));const source=path.resolve(pointer.export,f.path),target=path.resolve(seed,f.path);assert(target.startsWith(seed+path.sep));const st=await fs.lstat(source);assert(st.isFile()&&!st.isSymbolicLink());const b=await read(source);assert.equal(sha(b),f.sha256);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,b);}
git(['init','--initial-branch=checkpoint33-disposable'],seed);
await fs.writeFile(path.join(out,'paths.bin'),Buffer.from(snapshot.sourceFiles.map(x=>x.path).join('\0')+'\0'));
git(['add','--force','--pathspec-from-file='+path.join(out,'paths.bin'),'--pathspec-file-nul'],seed);
const tree=git(['write-tree'],seed),temporaryCommit=git(['commit-tree',tree],seed,'Disposable local source snapshot for dry-run only; not a release or remote checkpoint.\n');
git(['update-ref','refs/heads/checkpoint33-disposable',temporaryCommit],seed);
git(['clone','--quiet','--no-hardlinks',seed,clone],out);
assert.equal(git(['rev-parse','HEAD'],clone),temporaryCommit);
for(const f of snapshot.sourceFiles)assert.equal(sha(await read(path.join(clone,f.path))),f.sha256,'Clone source hash mismatch');
const npmCli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');assert(await has(npmCli),'Existing official npm CLI unavailable');
Object.assign(env,{npm_config_userconfig:path.join(out,'npm-user.config'),npm_config_globalconfig:path.join(out,'npm-global.config'),npm_config_cache:path.join(out,'npm-cache'),npm_config_offline:'true',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_registry:'https://registry.npmjs.org',EXPO_NO_DOTENV:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',CI:'1'});
// Do not print npm environment/config. Dependencies are public registry pins only.
const installs=[];
for(const prefix of['apps/mobile','packages/text']){
 const cwd=path.join(clone,prefix),pkg=await json(path.join(cwd,'package.json')),lockPath=path.join(cwd,'package-lock.json'),lock=await json(lockPath),before=sha(await read(lockPath));
 assert.equal(lock.lockfileVersion,3);assert(!await has(path.join(cwd,'node_modules')));
 const locked=lock.packages[''];assert.deepEqual(locked.dependencies??{},pkg.dependencies??{});assert.deepEqual(locked.devDependencies??{},pkg.devDependencies??{});
 const entries=Object.entries(lock.packages).filter(([k])=>k);
 assert(entries.every(([,v])=>v.resolved?.startsWith('https://registry.npmjs.org/')&&/^sha512-/.test(v.integrity??'')),'Non-public/unpinned registry dependency');
 const args=[npmCli,'ci','--dry-run','--offline','--ignore-scripts','--no-audit','--no-fund','--json'];
 const start=performance.now(),r=exec(process.execPath,args,cwd,undefined,45000);
 await fs.writeFile(path.join(out,prefix.replaceAll('/','-')+'-npm.log'),r.stdout+'\n'+r.stderr);
 let summary=null;try{const v=JSON.parse(r.stdout);summary={added:v.added??null,removed:v.removed??null,changed:v.changed??null,errorCode:v.error?.code??null};}catch{}
 installs.push({prefix,lockVersion:3,lockedPackages:entries.length,command:'npm ci --dry-run --offline --ignore-scripts --no-audit --no-fund --json',exitCode:r.code,elapsedMs:Math.round(performance.now()-start),summary,lockUnchanged:sha(await read(lockPath))===before,nodeModulesCreated:await has(path.join(cwd,'node_modules')),networkAllowed:false,lifecycleScripts:false,meaning:'Install plan only; no package download/install or dependency code executed.'});
 assert.equal(sha(await read(lockPath)),before);assert(!await has(path.join(cwd,'node_modules')));
}
const plan=await json(path.join(clone,'apps/mobile/candidates/messaging33/release-plan.PREPARED.json'));
assert.equal(plan.versionCode,33);assert.equal(plan.release,'0.0.33-mensagens');
const readText=async p=>(await read(path.join(clone,p))).toString('utf8');
const oldBuilder=await readText('apps/mobile/scripts/build-connected-basic-text-android.ps1'),oldPrepare=await readText('apps/mobile/scripts/prepare-connected-basic-text.mjs'),oldInspect=await readText('apps/mobile/scripts/inspect-connected-basic-text-apk.ps1');
const androidEntry=await readText('apps/mobile/candidates/messaging33/entry.android.tsx.template'),webEntry=await readText('apps/mobile/candidates/messaging33/entry.web.tsx.template');
assert(androidEntry.includes(plan.release)&&webEntry.includes(plan.release)&&androidEntry.includes('versionCode":33')&&webEntry.includes('versionCode":33'));
const psFile=path.join(clone,'apps/mobile/scripts/build-connected-basic-text-android.ps1');
const quoted=psFile.replaceAll("'","''");
const ast=exec('pwsh',['-NoProfile','-Command',"$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile('"+quoted+"',[ref]$t,[ref]$e)|Out-Null;if($e.Count){exit 1};'POWERSHELL_AST_OK_NO_SCRIPT_EXECUTION'"],clone);
assert.equal(ast.code,0);
const nativeTools={java:env.JAVA_HOME?await has(path.join(env.JAVA_HOME,'bin/java.exe')):false,sdk:env.ANDROID_HOME?await has(path.join(env.ANDROID_HOME,'platforms/android-36')):false,aapt:env.ANDROID_HOME?await has(path.join(env.ANDROID_HOME,'build-tools/36.0.0/aapt.exe')):false};
const native={builderParsed:true,builderExecuted:false,gradleInvoked:false,apkGenerated:false,nativeProjectPresentInClone:await has(path.join(clone,'apps/mobile/android/gradlew.bat')),externalToolsMetadata:nativeTools,entryVersionMatches:true,legacyVersion23Pins:/versionCode:23/.test(oldPrepare),legacyReceiptDependency:oldPrepare.includes('output/managed-registration-online/public-key-receipt.json'),legacyInspectionOnlyInternet:oldInspect.includes('microphoneDeclared=$false'),gate:'Canonical builder/inspection target23 and archived public receipt. Do not execute for33. Complete scoped builder/inspection33 adapter and regenerate native project from admitted official Expo template; signing remains outside Git.'};
assert(native.legacyVersion23Pins&&native.legacyReceiptDependency);
const web={entryVersionMatches:true,browser:false,expoInvoked:false,exportGenerated:false,configRequirement:'connect-public-config.json (public reviewed fields only; no Auth/session secret)',gate:'Wire default-export-only version/modes in copy preserving createConnectWebRoot factory; supplied web template cannot replace App.web wholesale without import cycle. Then execute exporter/browser only at release gate.'};
const rootPackage=await json(path.join(clone,'package.json'));
const dependencyFreePackages=['.', 'packages/access','packages/session','packages/chat','packages/chat-client'];
for(const p of dependencyFreePackages){const pkg=await json(path.join(clone,p,'package.json'));assert(!Object.keys(pkg.dependencies??{}).length&&!Object.keys(pkg.devDependencies??{}).length);}
assert.equal(sha(await read(mainIndexPath)),mainIndexBefore);assert.equal(git(['rev-parse','HEAD']),mainHead);
const result={state:'single-disposable-git-clone-install-plan-and-builder-inspection-complete-not-release-reproduction',sourceExport:pointer.export,sourceFingerprint:snapshot.sourceFingerprint,temporaryLocalCommit:temporaryCommit,temporaryCommitIsNotReleaseCheckpoint:true,clone:path.relative(root,clone).replaceAll('\\','/'),filesHashVerified:snapshot.sourceFiles.length,gitNetwork:false,mainIndexUnchanged:true,mainHeadUnchanged:true,installs,dependencyFreePackages,builders:{android:native,web},strictCanonicalCheckNotRerun:true,strictCheckerUnchanged:true,rootScripts:rootPackage.scripts,toolVersions:{node:process.version,npm:exec(process.execPath,[npmCli,'--version'],clone).stdout.trim()},noHostOrSupabaseChange:true,noOldImageOrEligibilityProof:true,noApk:true,noPublish:true,noPush:true,releaseReproducible:false};
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
await fs.mkdir('output/checkpoint33-retake',{recursive:true});await fs.writeFile('output/checkpoint33-retake/current.json',JSON.stringify({result:path.relative(root,path.join(out,'result.json')).replaceAll('\\','/'),clone:result.clone},null,2)+'\n');
console.log(JSON.stringify({state:result.state,clone:result.clone,files:result.filesHashVerified,installs:installs.map(x=>({prefix:x.prefix,exitCode:x.exitCode,planned:x.summary,nodeModulesCreated:x.nodeModulesCreated,elapsedMs:x.elapsedMs})),android:{builderParsed:true,legacyPins23:true,nativeProjectPresent:native.nativeProjectPresentInClone,apkGenerated:false},web:{exportGenerated:false},mainIndexUnchanged:true,releaseReproducible:false,result:path.relative(root,path.join(out,'result.json')).replaceAll('\\','/')}));
