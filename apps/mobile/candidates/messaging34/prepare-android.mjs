import fs from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{assertMessaging34CandidateRoot,snapshotMessaging34Source,readMessaging34Plan,readMessaging34PublicConfig}from'./prepare-source.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function prepareMessaging34Android(input,applyNative=false){
 const root=await assertMessaging34CandidateRoot(input),snapshot=await snapshotMessaging34Source(root),plan=await readMessaging34Plan(root),config=await readMessaging34PublicConfig(root),base=path.join(root,'output/messaging34-candidate/android'),mobile=path.join(root,'apps/mobile');
 await fs.mkdir(base,{recursive:true});const read=p=>fs.readFile(path.join(root,p),'utf8');
 let manifest=await read('apps/mobile/candidates/connected-basic-text/AndroidManifest.xml');
 assert.equal(manifest.split('__APP_LABEL__').length,2);
 manifest=manifest.replace('__APP_LABEL__',plan.android.label).replace('android.permission.RECORD_AUDIO" tools:node="remove"','android.permission.RECORD_AUDIO"');
 const entry=(await read('apps/mobile/candidates/messaging34/entry.android.tsx.template')).replace(/createCompanyPreviewLotAndroidRoot\(\{[^\n]+?\},fetch,/, 'createCompanyPreviewLotAndroidRoot('+JSON.stringify(config)+',fetch,');
 assert(entry.includes(plan.release)&&entry.includes('versionCode":34'));assert(manifest.includes('PrivacyActivity')&&manifest.includes('allowBackup="false"')&&manifest.includes('usesCleartextTraffic="false"'));
 const embedded={name:plan.android.label,slug:'connect-messaging34',version:plan.release,sdkVersion:'57.0.0',platforms:['android'],android:{package:plan.android.package,versionCode:plan.versionCode,permissions:plan.android.permissions,allowBackup:false},extra:{deliveryCandidate:true,realBackend:true,companyRegistryEnabled:true,normalImageAvailabilityRequired:true,buildProfile:'phone',sourceFingerprint:snapshot.fingerprint},updates:{enabled:false}};
 for(const[name,value]of[['entry.tsx',entry],['AndroidManifest.xml',manifest],['app.config',JSON.stringify(embedded)+'\n']])await fs.writeFile(path.join(base,name),value);
 // Prebuild keeps the existing Kotlin namespace; the isolated Gradle adapter
 // assigns the Phone applicationId. Embedded Expo config above uses actual ID.
 const original=JSON.parse(await read('apps/mobile/app.json')).expo;
 const stage={...original,name:plan.android.label,version:plan.release,android:{...original.android,package:'com.resicheck.connect.demo',versionCode:plan.versionCode,permissions:plan.android.permissions,allowBackup:false,blockedPermissions:(original.android.blockedPermissions??[]).filter(p=>!plan.android.permissions.includes(p))},extra:embedded.extra,updates:{enabled:false}};
 await fs.mkdir(path.join(mobile,'output/messaging34-candidate'),{recursive:true});
 await fs.writeFile(path.join(mobile,'output/messaging34-candidate/prebuild.config.json'),JSON.stringify(stage,null,2)+'\n');
 const dynamic="module.exports = require('./output/messaging34-candidate/prebuild.config.json');\n",dynamicPath=path.join(mobile,'app.config.js');
 try{assert.equal(await fs.readFile(dynamicPath,'utf8'),dynamic,'Existing dynamic Expo config differs');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.writeFile(dynamicPath,dynamic);
 let nativeReviewed=false;
 if(applyNative){
  const android=path.join(mobile,'android');await fs.access(path.join(android,'gradlew.bat'));const build=await fs.readFile(path.join(android,'app/build.gradle'),'utf8');assert(build.includes('com.resicheck.connect.demo'));
  const generated=path.join(android,'messaging34-generated');await fs.mkdir(generated,{recursive:true});
  for(const name of['entry.tsx','AndroidManifest.xml','app.config'])await fs.copyFile(path.join(base,name),path.join(generated,name));
  await fs.copyFile(path.join(root,'apps/mobile/candidates/messaging34/messaging34-android.init.gradle'),path.join(android,'messaging34-android.init.gradle'));
  const local=path.join(android,'local.properties');if(process.env.ANDROID_HOME)await fs.writeFile(local,'sdk.dir='+process.env.ANDROID_HOME.replaceAll('\\','/')+'\n');
  const notices=path.join(android,'app/src/main/assets/third-party');await fs.mkdir(notices,{recursive:true});
  await fs.copyFile(path.join(root,'packages/text/UNICODE-SEGMENTER-LICENSE.txt'),path.join(notices,'unicode-segmenter-MIT.txt'));await fs.copyFile(path.join(root,'packages/text/tests/fixtures/UNICODE-LICENSE.txt'),path.join(notices,'unicode-data-V3.txt'));
  nativeReviewed=true;
 }
 const receipt={schemaVersion:1,state:applyNative?'native-generated-reviewed-not-built':'prepared-for-native-generation',release:plan.release,versionCode:plan.versionCode,sourceFingerprint:snapshot.fingerprint,planSha256:snapshot.planSha256,publicConfigSha256:snapshot.publicConfigSha256,namespace:'com.resicheck.connect.demo',applicationId:plan.android.package,nativeReviewed,entrySha256:hash(Buffer.from(entry)),manifestSha256:hash(Buffer.from(manifest)),expoConfigSha256:hash(Buffer.from(JSON.stringify(embedded)+'\n')),prebuildConfigSha256:hash(Buffer.from(JSON.stringify(stage,null,2)+'\n')),signed:false,apkBuilt:false,legacyBuildersChanged:false,preparationPath:'output/messaging34-candidate/android',nativeInit:'apps/mobile/android/messaging34-android.init.gradle'};
 await fs.writeFile(path.join(base,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){try{assert.equal(process.argv.length,5);assert.equal(process.argv[2],'--root');assert(['--prepare-only','--apply-native'].includes(process.argv[4]));console.log(JSON.stringify(await prepareMessaging34Android(process.argv[3],process.argv[4]==='--apply-native')));}catch(e){console.error('Messaging34 Android preparation unavailable: '+e.message);process.exitCode=1;}}
