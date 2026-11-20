// Local public-input admission/generation. No CLI, Auth, network or credential lookup.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {connectedExpoPublicConfig} from './connected-expo-config.mjs';
import {connectedMembershipManagementConfig} from '../src/connected-membership-management.ts';

const root=new URL('../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8').replace(/^\uFEFF/,'');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const source='apps/mobile/candidates/connected-basic-text/';
const keys=value=>Object.keys(value).sort().join(',');
const unavailable=()=>Error('Connected basic text build preparation unavailable');

/** Pure checks, also used by local tests. No receipt can admit a different
 * project, legacy/privileged key or extra config/receipt credential fields. */
export function admitConnectedBasicTextBuild(rawConfig,receipt,profile,spec){
 try{
  const config=connectedMembershipManagementConfig(rawConfig);
  assert(receipt&&typeof receipt==='object'&&!Array.isArray(receipt));
  assert.equal(keys(receipt),'keySha256,projectRef,publicOnly,retrievedAt,source');
  assert.equal(receipt.projectRef,config.projectRef);
  assert.equal(receipt.source,'official-cli-projects-api-keys');
  assert.equal(receipt.publicOnly,true);
  assert.equal(typeof receipt.retrievedAt,'string');
  assert.equal(new Date(receipt.retrievedAt).toISOString(),receipt.retrievedAt);
  assert.equal(receipt.keySha256,sha256(config.publishableKey));
  assert(['qa','phone'].includes(profile));
  assert.equal(spec.schemaVersion,1);assert.equal(spec.projectRef,config.projectRef);
  const expected=profile==='phone'
   ?{package:'com.resicheck.connect.pendingonlinephone',label:'Connect Cadastro Online Teste',versionName:'0.0.23-connected-basic-text-phone',versionCode:23,architectures:'arm64-v8a,x86_64'}
   :{package:'com.resicheck.connect.pendingonlineqa',label:'Connect Cadastro Online QA',versionName:'0.0.23-connected-basic-text-qa',versionCode:23,architectures:'x86_64'};
  assert.deepEqual(spec[profile],expected);
  return Object.freeze({config,profile,build:Object.freeze({...expected}),keySha256:receipt.keySha256});
 }catch{throw unavailable();}
}

export function renderConnectedBasicTextBuild(admitted,entryTemplate,manifestTemplate){
 try{
  assert.equal(entryTemplate.split('__PUBLIC_CONFIG__').length,2);
  assert.equal(manifestTemplate.split('__APP_LABEL__').length,2);
  const entry=entryTemplate.replace('__PUBLIC_CONFIG__',JSON.stringify(admitted.config));
  const manifest=manifestTemplate.replace('__APP_LABEL__',admitted.build.label);
  assert(entry.includes('registerConnectedBasicText('));
  assert(!entry.includes('__PUBLIC_CONFIG__'));
  assert(manifest.includes('com.resicheck.connect.demo.PrivacyActivity'));
  assert(manifest.includes('com.resicheck.connect.demo.PrivacyApplication'));
  assert(manifest.includes('android:usesCleartextTraffic="false"'));
  assert(manifest.includes('android:allowBackup="false"'));
  assert(!/android:(?:usesCleartextTraffic|allowBackup|debuggable)="true"/.test(manifest));
  assert(!/sb_secret_|service_role|syntheticpass|@example\.invalid|\/auth\/v1\/admin\/|process\.env/.test(entry));
  const permissions=[...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"([^>]*)\/>/g)].filter(match=>!match[2].includes('tools:node="remove"')).map(match=>match[1]);
  assert.deepEqual(permissions,['android.permission.INTERNET']);
  return Object.freeze({entry,manifest});
 }catch{throw unavailable();}
}

export function prepareConnectedBasicTextBuild(profile,checkOnly=false){
 try{
  const configText=read('output/managed-registration-online/public-config.json');
  const receiptText=read('output/managed-registration-online/public-key-receipt.json');
  const specText=read(source+'build-spec.json');
  const admitted=admitConnectedBasicTextBuild(JSON.parse(configText),JSON.parse(receiptText),profile,JSON.parse(specText));
  const rendered=renderConnectedBasicTextBuild(admitted,read(source+'entry.template.txt'),read(source+'AndroidManifest.xml'));
  const inputs=['apps/mobile/src/inbox-unread-filter.ts','apps/mobile/src/conversation-audio-ui.ts','apps/mobile/src/conversation-audio-ui-core.ts','apps/mobile/src/expo-received-audio-player.ts','apps/mobile/src/received-audio-player.ts','packages/chat-client/src/audio-message-resolver.ts','apps/mobile/src/conversation-audio-playback.ts','packages/chat-client/src/audio-message-commit.ts','packages/chat-client/src/message-content.ts','packages/chat-client/src/audio-message-rpc.ts','apps/mobile/src/conversation-reviewed-audio.ts','apps/mobile/src/audio-transfer-http.ts','apps/mobile/src/own-message-status-binding.ts','apps/mobile/src/delivered-window-binding.ts','packages/chat-client/src/message-delivery.ts','packages/chat-client/src/message-receipts.ts','apps/mobile/src/reviewed-audio-upload.ts','packages/chat-client/src/audio-transfer.ts','apps/mobile/src/audio-permission.ts','apps/mobile/src/session-drafts.ts','apps/mobile/src/search-older-messages.ts','apps/mobile/src/loaded-message-search.ts','apps/mobile/src/uncertain-send-recovery.ts','apps/mobile/src/older-page-gesture.ts','packages/chat-client/src/own-send-receipt.ts','apps/mobile/src/message-seen-binding.ts','packages/chat-client/src/seen-messages.ts','apps/mobile/src/message-visibility-proof.ts','apps/mobile/src/quiet-latest-refresh.ts','apps/mobile/src/inbox-freshness.ts','apps/mobile/src/message-calendar.ts','apps/mobile/src/draft-exit-guard.ts','packages/chat-client/src/unread-counts.ts','packages/chat-client/src/inbox-search.ts','packages/chat-client/src/recent-inbox.ts',source+'build-spec.json',source+'entry.template.txt',source+'AndroidManifest.xml',source+'res/xml/connect_basic_text_network.xml',
   'apps/mobile/scripts/connected-basic-text-android.init.gradle','apps/mobile/scripts/build-connected-basic-text-android.ps1',
   'apps/mobile/scripts/inspect-connected-basic-text-apk.ps1','apps/mobile/scripts/prepare-connected-basic-text.mjs',
   'apps/mobile/previews/connected-membership-management.android.tsx','apps/mobile/src/connected-membership-management.ts',
   'apps/mobile/src/connected-navigation.ts','apps/mobile/src/ConnectedSettingsView.tsx','apps/mobile/src/onboarding-adapter.ts',
   'apps/mobile/src/membership-management-http.ts','apps/mobile/src/pending-registration-http.ts',
   'apps/mobile/src/MembershipHostView.tsx','apps/mobile/src/RecentConversationView.tsx',
   'apps/mobile/src/RegistrationScreens.tsx','apps/mobile/src/PendingRegistrationHostView.tsx',
   'apps/mobile/src/registration-auth-notice.ts','packages/session/src/public-auth-error.ts',
   'apps/mobile/src/pending-registration-presentation.ts','apps/mobile/src/company-registry-registration-presentation.ts','apps/mobile/src/registration-host.ts','apps/mobile/src/onboarding-review-adapter.ts',
   'apps/mobile/src/registration-membership-gate.ts','apps/mobile/src/membership-host.ts',
   'apps/mobile/src/membership-recent-bridge.ts','apps/mobile/src/conversation-access-watch.ts','apps/mobile/src/recent-conversation-host.ts',
   'apps/mobile/src/access-recent-controllers.ts','apps/mobile/src/patient-company-entry-host.ts',
   'apps/mobile/src/auth-diagnostic-config.ts','apps/mobile/src/auth-diagnostic-http.ts',
   'apps/mobile/src/privacy-access-recent-core.ts','apps/mobile/src/native-privacy-binding.ts',
   'packages/session/src/auth-controller.ts','packages/session/src/supabase-auth-provider.ts',
   'packages/chat-client/src/text-session-channel.ts','packages/chat-client/src/session-rpc.ts',
   'packages/chat-client/src/text-history.ts','packages/chat-client/src/recent-history-read.ts',
   'packages/chat-client/src/membership-directory.ts','packages/chat-client/src/staff-employer.ts',
   'packages/chat-client/src/onboarding-rpc.ts',
   ...['ConnectPrivacyCurtain.kt','ConnectPrivacyPackage.kt','PrivacyActivity.kt','PrivacyApplication.kt'].map(name=>'apps/mobile/native/privacy/'+name)];
  // CNPJ candidate screens remain OFF in the release entry; freeze their imports with the shared root.
  for(const path of ['apps/mobile/src/connected-company-registry.ts','apps/mobile/src/company-registry-http.ts','apps/mobile/src/company-registry-binding.ts','apps/mobile/src/company-registry-controller.ts','apps/mobile/src/company-registry-progress.ts','apps/mobile/src/company-registry-presentation.ts','apps/mobile/src/CompanyRegistryRegistrationView.tsx','apps/mobile/src/CompanyRegistryCheckView.tsx','packages/chat-client/src/company-registry-rpc.ts','apps/mobile/previews/connected-company-registry-root.tsx'])if(!inputs.includes(path))inputs.push(path);
  // Capture new optional audio sources even while the current entry keeps audio OFF.
  for(const path of ["apps/mobile/src/scoped-recording-host.ts","apps/mobile/src/ScopedAudioComposer.tsx","apps/mobile/src/scoped-reviewed-audio.ts","apps/mobile/src/ScopedAudioReview.tsx","apps/mobile/src/native-audio-digest.ts","apps/mobile/src/scoped-audio-http.ts","apps/mobile/src/recent-local-audio.ts","apps/mobile/src/recent-media-scope.ts","apps/mobile/src/external-image-selection.ts","apps/mobile/src/local-audio.ts","apps/mobile/src/audio-permission.ts","apps/mobile/src/demo-audio-session.ts","apps/mobile/src/private-demo-audio.ts","apps/mobile/src/conversation-media-scope.ts","apps/mobile/src/expo-local-audio.ts","apps/mobile/src/expo-reviewed-audio-source.ts","apps/mobile/src/expo-private-demo-audio.ts","apps/mobile/src/audio-owned-files.ts","apps/mobile/src/audio-file-ownership.ts","apps/mobile/src/audio-finalization.ts","apps/mobile/src/read-reviewed-audio.ts","apps/mobile/previews/connected-scoped-audio-root.tsx","packages/chat-client/src/scoped-audio-transfer.ts","packages/chat-client/src/audio-transfer.ts","packages/chat-client/src/audio-message-commit.ts","packages/chat-client/src/audio-message-rpc.ts","packages/chat-client/src/audio-message-resolver.ts","packages/chat-client/src/own-send-receipt.ts"])if(!inputs.includes(path))inputs.push(path);
  for(const path of ['apps/mobile/src/native-secure-session-store.ts','apps/mobile/src/registration-identifiers.ts','apps/mobile/src/registration-forms.ts','packages/session/src/persistent-auth-provider.ts','packages/session/src/auth-controller.ts','apps/mobile/native/privacy/ConnectSecureSessionStore.kt','apps/mobile/native/privacy/ConnectSecureSessionModule.kt'])if(!inputs.includes(path))inputs.push(path);
  inputs.push('apps/mobile/src/membership-read-http.ts','packages/session/src/foreground-recovery-scope.ts',
   'apps/mobile/src/basic-text-http.ts','packages/chat-client/src/supabase-send.ts','packages/chat-client/src/history-timestamp.ts',
   'packages/chat-client/src/recent-conversation.ts','packages/chat-client/src/text-send-queue.ts','packages/chat-client/src/history-window.ts','packages/text/src/message-text.ts',
   'apps/mobile/src/recent-latest-follow.ts','apps/mobile/src/recent-scroll-ownership.ts','apps/mobile/src/recent-follow-readiness.ts','apps/mobile/src/recent-scroll-observation.ts');
  inputs.push('apps/mobile/src/AudioControls.tsx','apps/mobile/src/ConnectIcon.tsx','apps/mobile/src/ConnectedBottomBar.tsx','apps/mobile/src/ConnectedCompanyView.tsx','apps/mobile/src/connected-tabs.ts','apps/mobile/assets/resicheck-icon-round.png','packages/chat-client/src/signup-review-rpc.ts');
  inputs.push('apps/mobile/scripts/connected-expo-config.mjs','apps/mobile/app.json','apps/mobile/package.json','apps/mobile/package-lock.json','apps/mobile/android/app/build.gradle');
  const expoSdkVersion=JSON.parse(read('apps/mobile/node_modules/expo/package.json')).version.split('.')[0]+'.0.0';
  const expoConstantsVersion=JSON.parse(read('apps/mobile/node_modules/expo-constants/package.json')).version;
  const expoConfigText=JSON.stringify(connectedExpoPublicConfig({profile,build:admitted.build,sdkVersion:expoSdkVersion,base:JSON.parse(read('apps/mobile/app.json'))}))+String.fromCharCode(10);
  inputs.push('packages/chat-client/src/conversation-head-read.ts','apps/mobile/src/conversation-head-notice.ts');
  for(const path of ['apps/mobile/src/cache-record-store.ts','apps/mobile/src/record-conversation-cache.ts','apps/mobile/src/legacy-web-conversation-cache.ts','apps/mobile/src/HistorySyncStatus.tsx','apps/mobile/src/conversation-cache.ts', 'apps/mobile/src/native-conversation-cache.ts', 'apps/mobile/src/audio-auto-download.ts', 'apps/mobile/src/ConversationCacheSettings.tsx', 'apps/mobile/src/HistoryPreparation.tsx', 'apps/mobile/native/privacy/ConnectConversationCacheModule.kt'])if(!inputs.includes(path))inputs.push(path);
  const sourceHashes=Object.fromEntries(inputs.map(path=>[path,sha256(readFileSync(new URL(path,root)))]));
  sourceHashes['apps/mobile/android/connected-basic-text-generated/'+profile+'/expo-public-config.json']=sha256(expoConfigText);
  const generated=new URL('apps/mobile/android/connected-basic-text-generated/'+profile+'/',root);
  const summary={status:checkOnly?'admitted-public-inputs-no-build':'prepared-not-built',projectRef:admitted.config.projectRef,profile,
   ...admitted.build,keySha256:admitted.keySha256,sourceConfigSha256:sha256(configText),sourceReceiptSha256:sha256(receiptText),sourceHashes,
   expoConfigSha256:sha256(expoConfigText),expoSdkVersion,expoConstantsVersion,entrySha256:sha256(rendered.entry),manifestSha256:sha256(rendered.manifest),generatedDirectory:fileURLToPath(generated),
   internetPermission:true,microphoneDeclared:false,storagePermissions:false,debuggable:false,usesExistingDebugSignature:true,
   androidBuilt:false,installed:false,onlineAuthExecuted:false,containsPrivilegedKey:false,containsTestCredentials:false,
   clientScope:'pending registration, directory/membership management, basic text sends and manual history reads',basicTextEnabled:true,controlledLocalExpiry:false,injectedNetworkFailure:false,serverReadOnly:false};
  if(!checkOnly){
   mkdirSync(generated,{recursive:true});
   writeFileSync(new URL('expo-public-config.json',generated),expoConfigText);
   writeFileSync(new URL('entry.tsx',generated),rendered.entry);
   writeFileSync(new URL('AndroidManifest.xml',generated),rendered.manifest);
   writeFileSync(new URL('preparation.json',generated),JSON.stringify(summary,null,2)+'\n');
  }
  return Object.freeze(summary);
 }catch{throw unavailable();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);assert(args.length===2||args.length===3);assert.equal(args[0],'--profile');assert(['qa','phone'].includes(args[1]));if(args.length===3)assert.equal(args[2],'--check');
  console.log(JSON.stringify(prepareConnectedBasicTextBuild(args[1],args.length===3),null,2));
 }catch{console.error('Connected basic text build preparation unavailable');process.exitCode=1;}
}
