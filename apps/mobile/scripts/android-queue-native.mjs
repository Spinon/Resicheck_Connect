#!/usr/bin/env node
// Synthetic local queue native QA for the explicitly hashed candidate.
// Default UI journeys plus warm4096->2048 stress reproduction; warm resize remains unverified.
// For directed cold320/font2 proof, see retained output/queue-qa/directed-font2 evidence.
// No real network, authentication, push or delivery. Requires owned AVD and explicit serial.
// Usage: node apps/mobile/scripts/android-queue-native.mjs --serial emulator-5554 [--adb PATH]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {proposedStatusLabels as labels,resourceId,deliveryStates,coversRange} from './android-queue-smoke.mjs';

const PACKAGE = 'com.resicheck.connect.demo';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--serial', '--adb'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('Usage: node android-queue-native.mjs --serial emulator-N [--adb PATH]');
  }
  assert(!options[args[i]], `Duplicate option: ${args[i]}`);
  options[args[i]] = args[i + 1];
}
assert(/^emulator-\d+$/.test(options['--serial'] ?? ''), 'An explicit emulator-N serial is required; physical devices are refused.');
const serial = options['--serial'];
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
const candidate = sdk && join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const adb = options['--adb'] || (candidate && existsSync(candidate) ? candidate : 'adb');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidence = join(root, 'output', 'queue-qa', 'run-'+runId);
mkdirSync(evidence, { recursive: true });
const result = { scope: 'Native Android synthetic simulation UI', package: PACKAGE, serial, startedAt: new Date().toISOString(), checks: [], warnings: [], realAuthenticationTested: false, realChatTested: false, backendAuthorizationTested: false, realPushTested: false, realAudioTested: false };
const remoteXml = `/sdcard/connect-demo-qa-${process.pid}.xml`;
let verifiedEmulator = false;
let lastXml = '';
const delay = ms => new Promise(r => setTimeout(r, ms));
function adbRun(parts, binary = false, timeout = 15000) {
  return execFileSync(adb, ['-s', serial, ...parts], { encoding: binary ? null : 'utf8', timeout, maxBuffer: 24 * 1024 * 1024, windowsHide: true });
}
function shell(...parts) { return adbRun(['shell', ...parts]); }
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
  });
}
const normalize = text => (text ?? '').replace(/\s+/g, ' ').trim();
function parse(xml) {
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(match => {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]));
    const bounds = attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    return { ...attrs, rect: bounds ? bounds.slice(1).map(Number) : null };
  });
}
function visible(node) { return node?.rect && node.rect[2] > node.rect[0] && node.rect[3] > node.rect[1] && node['visible-to-user'] !== 'false'; }
function matches(node, label) { return normalize(node['content-desc']) === normalize(label) || normalize(node.text) === normalize(label); }
function inApp() {
  // API 36's "windows" subcommand can omit global focus fields. The full dump
  // contains the authoritative focused window; still refuse input if absent.
  const focus = shell('dumpsys', 'window').split(/\r?\n/).filter(line => /mCurrentFocus=|mFocusedApp=/.test(line));
  assert(focus.some(line => line.includes(`${PACKAGE}/`) || line.includes(`${PACKAGE} `)), `Target app is not focused: ${focus.join(' | ')}`);
  assert(!focus.some(line => /mCurrentFocus=/.test(line) && !line.includes(`${PACKAGE}/`)), 'A different window is focused; refusing input.');
}
function snapshot() {
  inApp();
  shell('uiautomator', 'dump', remoteXml);
  lastXml = adbRun(['exec-out', 'cat', remoteXml]);
  assert(lastXml.includes('<hierarchy'), 'UIAutomator did not produce XML');
  return parse(lastXml).filter(n => n.package === PACKAGE);
}
function screenshot(name) {
  inApp();
  const png = adbRun(['exec-out', 'screencap', '-p'], true);
  assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid screenshot PNG bytes');
  writeFileSync(join(evidence, `${name}.png`), png);
  if (lastXml) writeFileSync(join(evidence, `${name}.xml`), lastXml, 'utf8');
}
async function waitFor(predicate, description, timeout = 22000) {
  const deadline = Date.now() + timeout;
  let nodes;
  let focusError;
  do {
    try {
      nodes = snapshot();
      focusError = undefined;
    } catch (error) {
      // Launch/transition can briefly have no app focus. Retry observation only;
      // input remains forbidden until the strict focus guard succeeds.
      if (!/Target app is not focused|A different window is focused/.test(error.message)) throw error;
      focusError = error;
      await delay(350);
      continue;
    }
    if (predicate(nodes)) return nodes;
    await delay(350);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}${focusError ? ` (${focusError.message})` : ''}`);
}
async function expect(label) { return waitFor(nodes => nodes.some(n => matches(n, label)), `visible label ${label}`); }
async function hardwareBack() {
  inApp();
  shell('input', 'keyevent', 'KEYCODE_BACK');
  await delay(450);
}
async function hideKeyboard() {
  if (/mInputShown=true|isInputViewShown=true/.test(shell('dumpsys', 'input_method'))) await hardwareBack();
}
async function tap(label, scroll = false) {
  let nodes;
  for (let attempt = 0; attempt < (scroll ? 6 : 1); attempt++) {
    nodes = await waitFor(n => scroll ? n.length > 0 : n.some(node => matches(node, label) && visible(node) && node.enabled !== 'false'), `enabled app control ${label}`);
    const node = nodes.find(n => matches(n, label) && visible(n) && n.enabled !== 'false');
    if (node) {
      inApp();
      const [x1, y1, x2, y2] = node.rect;
      shell('input', 'tap', String(Math.floor((x1 + x2) / 2)), String(Math.floor((y1 + y2) / 2)));
      await delay(400);
      return;
    }
    if (!scroll) break;
    const viewport = nodes.filter(n => n.scrollable === 'true' && visible(n)).sort((a, b) => (b.rect[3] - b.rect[1]) - (a.rect[3] - a.rect[1]))[0];
    assert(viewport, `Cannot find ${label}; no observed scrollable app bounds`);
    const [x1, y1, x2, y2] = viewport.rect;
    const x = Math.floor((x1 + x2) / 2);
    inApp();
    shell('input', 'swipe', String(x), String(Math.floor(y1 + (y2 - y1) * .8)), String(x), String(Math.floor(y1 + (y2 - y1) * .25)), '350');
    await delay(350);
  }
  throw new Error(`No enabled visible UI node for ${label}`);
}
async function restart() {
  shell('am', 'force-stop', PACKAGE);
  shell('am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
  await expect('Conhecer como paciente');
}
const expectedApk='output/queue-interface/candidate/connect-queue-0.1.2-build3.apk';
const expectedSha='f62918470bd7f51b295736f4f52d3bd12c5110f7b5934a9b95c9c0ea4cafbb7c';
const byId=(ns,id)=>ns.find(n=>resourceId(n)===id);
const contains=(a,b)=>a&&b&&a.rect[0]>=b.rect[0]&&a.rect[1]>=b.rect[1]&&a.rect[2]<=b.rect[2]&&a.rect[3]<=b.rect[3];
function viewPort(ns){return byId(ns,'chat-message-list');}
function scroll(ns,direction,distance=180){
  const vp=viewPort(ns)??ns.filter(n=>n.scrollable==='true'&&visible(n)).sort((a,b)=>(b.rect[3]-b.rect[1])-(a.rect[3]-a.rect[1]))[0];assert(visible(vp),'Observed scroll viewport required');
  const [x1,y1,x2,y2]=vp.rect,x=Math.floor((x1+x2)/2),mid=Math.floor((y1+y2)/2),d=Math.min(distance/2,(y2-y1)*.35);assert(d>=15);
  inApp();shell('input','swipe',String(x),String(Math.floor(mid+(direction==='newer'?d:-d))),String(x),String(Math.floor(mid+(direction==='newer'?-d:d))),'300');
}
async function reveal(id,direction='older'){
  for(let i=0;i<14;i++){const ns=snapshot(),n=byId(ns,id);if(visible(n))return {ns,n};scroll(ns,direction);await delay(200);}throw Error('Could not expose '+id);
}
async function tapId(id,direction='older'){
  const {n}=await reveal(id,direction);inApp();shell('input','tap',String(Math.floor((n.rect[0]+n.rect[2])/2)),String(Math.floor((n.rect[1]+n.rect[3])/2)));await delay(350);
}
async function ascii(text){
  assert(/^QA_[A-Za-z0-9_]{1,65}$/.test(text));await tap('Mensagem fictícia');
  await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&matches(n,'Mensagem fictícia')&&n.focused==='true'),'focused actual composer');
  for(let i=0;i<text.length;i+=5){inApp();shell('input','text',text.slice(i,i+5));await delay(90);}
  await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&n['content-desc']==='Mensagem fictícia'&&n.text===text),'exact synthetic draft');
}
async function patient(company='Centro Vida'){
  await restart();await tap('Conhecer como paciente',true);await tap('Abrir '+company,true);await tap('Abrir meu chat',true);await expect('Mensagem fictícia');
}
async function state(status,key){
  for(let i=0;i<12;i++){const ns=snapshot();if(deliveryStates(ns,labels[status]).some(n=>!key||n.key===key))return ns;scroll(ns,'older',180);await delay(220);}
  throw Error('Delivery state not exposed after bounded observed scroll: '+status);
}
function deviceState(){const ime=shell('dumpsys','input_method');return {size:shell('wm','size'),density:shell('wm','density'),font:Number(shell('settings','get','system','font_scale').trim()),keyboardStatusObserved:/mInputShown=|isInputViewShown=/.test(ime),keyboardShown:/mInputShown=true|isInputViewShown=true/.test(ime),imeLines:ime.split(/\r?\n/).filter(s=>/mInputShown=|isInputViewShown=|mCurId=/.test(s)).map(s=>s.trim())};}
function soleState(ns,status){const found=deliveryStates(ns,labels[status]);assert.equal(found.length,1,'Single new scenario delivery expected');return found[0];}
function rawTap(n){assert(visible(n)&&n.enabled!=='false');inApp();const start=Date.now();shell('input','tap',String(Math.floor((n.rect[0]+n.rect[2])/2)),String(Math.floor((n.rect[1]+n.rect[3])/2)));return {start,end:Date.now()};}
function pngOnly(name,origin){inApp();const started=Date.now();const png=adbRun(['exec-out','screencap','-p'],true);assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));writeFileSync(join(evidence,name+'.png'),png);return {name,startedAfterSendMs:started-origin,finishedAfterSendMs:Date.now()-origin,freshXml:false};}
async function sendImmediate(name){const ns=await expect('Enviar mensagem local'),n=ns.find(n=>matches(n,'Enviar mensagem local')&&n.enabled!=='false');const timing=rawTap(n);return {timing,png:pngOnly(name,timing.start)};}
async function failToggle(){await hideKeyboard();await tapId('delivery-failure-toggle','newer');await waitFor(ns=>byId(ns,'delivery-failure-toggle')?.checked==='true','failure checkbox checked');}
function layout(ns,key){
  const bubble=byId(ns,'message-'+key),delivery=byId(ns,'delivery-'+key),status=byId(ns,'delivery-state-'+key),retry=byId(ns,'delivery-retry-'+key);
  const error=ns.find(n=>n.text==='Falha no envio simulado. Tente novamente.'&&delivery&&contains(n,delivery));
  const vp=viewPort(ns),required={status,error,retry};const complete=Object.values(required).every(n=>visible(n)&&vp&&n.rect[1]>vp.rect[1]+1&&n.rect[3]<vp.rect[3]-1);
  const errors=[];if(complete){if(status.rect[3]>error.rect[1]+2)errors.push('state overlaps error');if(error.rect[3]>retry.rect[1]+2)errors.push('error overlaps retry');for(const [k,n]of Object.entries(required))if(!contains(n,delivery)||!contains(n,bubble))errors.push(k+' outside delivery/bubble');}
  return {complete,passed:complete&&!errors.length,errors,rects:Object.fromEntries(Object.entries({bubble,delivery,status,error,retry,viewport:vp}).map(([k,n])=>[k,n?.rect??null]))};
}
async function failedAccess(key,name,reference){
  const covered=new Set(),segments=[],errorIntervals=[];let info;
  for(let i=0;i<18;i++){
    const ns=snapshot();info=layout(ns,key);if(info.complete){screenshot(name);return {...info,covered:['status','error','retry'],segments};}
    const vp=viewPort(ns);assert(visible(vp));const status=byId(ns,'delivery-state-'+key),retry=byId(ns,'delivery-retry-'+key),error=ns.find(n=>n.text==='Falha no envio simulado. Tente novamente.');
    const added=[];for(const [k,n]of Object.entries({status,error,retry}))if(visible(n)&&n.rect[1]>vp.rect[1]+1&&n.rect[3]<vp.rect[3]-1&&(!reference||Math.abs(n.rect[3]-n.rect[1]-(reference.rects[k][3]-reference.rects[k][1]))<=2)&&!covered.has(k)){covered.add(k);added.push(k);}
    let errorInterval;
    if(reference?.rects?.error){const r=reference.rects,h=r.error[3]-r.error[1];let errorTop;
      const full=(n,ref)=>visible(n)&&n.rect[1]>vp.rect[1]+1&&n.rect[3]<vp.rect[3]-1&&Math.abs(n.rect[3]-n.rect[1]-(ref[3]-ref[1]))<=2;
      // A status bottom edge or retry top edge strictly inside the viewport is
      // uncut even if its opposite edge is clipped. Use that observed edge and
      // the closed same-width/font layout to locate the scrolling paragraph.
      if(visible(status)&&status.rect[3]>vp.rect[1]+1&&status.rect[3]<vp.rect[3]-1)errorTop=status.rect[3]+r.error[1]-r.status[3];
      else if(visible(retry)&&retry.rect[1]>vp.rect[1]+1&&retry.rect[1]<vp.rect[3]-1)errorTop=retry.rect[1]-(r.retry[1]-r.error[1]);
      else if(full(error,r.error))errorTop=error.rect[1];
      if(errorTop!==undefined){const a=Math.max(0,vp.rect[1]+2-errorTop),b=Math.min(h,vp.rect[3]-2-errorTop);if(b>a){errorInterval=[a,b];errorIntervals.push(errorInterval);}}
    }
    if(added.length||errorInterval){const frame=name+'-segment'+segments.length;screenshot(frame);segments.push({frame,added,errorInterval,rects:info.rects});}
    const errorHeight=reference?.rects?.error?reference.rects.error[3]-reference.rects.error[1]:0;
    if(covered.size===3||covered.has('status')&&covered.has('retry')&&coversRange(errorIntervals,errorHeight))break;
    const row=byId(ns,'message-'+key);let older=false,distance=100;
    if(!covered.has('status')) {
      if(visible(status)){older=status.rect[1]<=vp.rect[1]+1;distance=40;}
      else if(visible(error)||visible(retry))older=true;
      else if(!row){older=true;distance=220;}
      // Header/body only means status is below this window: move newer.
    }
    scroll(ns,older?'older':'newer',distance);await delay(220);
  }
  const errorHeight=reference?.rects?.error?reference.rects.error[3]-reference.rects.error[1]:0;
  const paragraphScrollVerified=errorHeight>0&&coversRange(errorIntervals,errorHeight);
  screenshot(name);return {...info,covered:[...covered],segments,errorIntervals,errorHeight,paragraphScrollVerified,accessible:covered.size===3||covered.has('status')&&covered.has('retry')&&paragraphScrollVerified};
}
async function check(name,fn){
  try{const detail=await fn();result.checks.push({name,status:'passed',...detail});console.log('PASS '+name);}
  catch(error){result.checks.push({name,status:'failed-or-unverified',error:error.stack});result.warnings.push(name+': '+error.message);try{snapshot();screenshot(name+'-failure');}catch{}console.error(name+': '+error.message);}
  writeFileSync(join(evidence,'progress.json'),JSON.stringify(result,null,2)+'\n');
}
async function failureScenario(prefix,stress=false){
  await patient();await failToggle();const marker='QA_'+prefix;await ascii(marker);await hideKeyboard();const transition=await sendImmediate(prefix+'-transient');
  let ns=await state('failed');const item=soleState(ns,'failed'),key=item.key;assert(byId(ns,item.bubbleId));
  const beforeId=item.bubbleId;let reference;
  if(stress){reference=layout(ns,key);assert(reference.complete&&reference.passed,'Tall same-width reference needs full valid error/retry geometry');screenshot(prefix+'-reference4096');shell('wm','size','880x2048');await delay(700);}
  const closedDevice=deviceState();assert(closedDevice.keyboardStatusObserved&&!closedDevice.keyboardShown,'Closed keyboard must be observed');
  const closed=await failedAccess(key,prefix+'-failed-closed',reference);result.partialClosed={closedDevice,closed};writeFileSync(join(evidence,'partial.json'),JSON.stringify(result.partialClosed,null,2));assert(closed.complete?closed.passed:closed.accessible,'Closed error/retry must be accessible');
  await tap('Mensagem fictícia');await delay(500);assert(/mInputShown=true|isInputViewShown=true/.test(shell('dumpsys','input_method')));
  const openDevice=deviceState();assert(openDevice.keyboardStatusObserved&&openDevice.keyboardShown,'Open keyboard must be observed');
  const open=await failedAccess(key,prefix+'-failed-open',reference??closed);result.partialOpen={openDevice,open};writeFileSync(join(evidence,'partial-open.json'),JSON.stringify(result.partialOpen,null,2));assert(open.complete?open.passed:open.accessible,'Keyboard-open error/retry must be accessible');
  if(stress){assert(shell('wm','size').includes('Override size: 880x2048'));assert.equal(Number(shell('settings','get','system','font_scale').trim()),2);}
  await tapId(item.retryId,'newer');const retryPng=pngOnly(prefix+'-retry-transient',Date.now());ns=await state('accepted',key);assert(byId(ns,beforeId),'Retry must retain same message bubble');assert.equal(deliveryStates(ns,labels.accepted).filter(n=>n.key===key).length,1);screenshot(prefix+'-accepted-open');await hideKeyboard();ns=await state('accepted',key);screenshot(prefix+'-accepted-closed');
  return {key,marker,bubbleBefore:beforeId,bubbleAfter:beforeId,transition,retryPng,closedDevice,openDevice,closed,open,reference,visibleDedupOnly:true,stressConfiguration:stress?{widthDp:320,heightPx:2048,fontScale:2,keyboardObserved:true}:undefined};
}
let original;
try{
  assert.equal(createHash('sha256').update(readFileSync(resolve(root,expectedApk))).digest('hex'),expectedSha);
  assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1');assert.equal(adbRun(['emu','avd','name']).replace(/\r/g,'').split('\n')[0],'Connect_Demo_API36');verifiedEmulator=true;
  original={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};result.originalSettings=original;
  const installed=shell('pm','path',PACKAGE).trim().replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_/=.+~-]+\/base\.apk$/.test(installed));assert.equal(shell('sha256sum',installed).split(/\s+/)[0],expectedSha);assert(/versionCode=3\b/.test(shell('dumpsys','package',PACKAGE)));result.artifact={path:expectedApk,sha256:expectedSha,versionCode:3};
  await check('default-success',async()=>{await patient();await ascii('QA_QueueAccepted');await hideKeyboard();const transition=await sendImmediate('success-transient');const ns=await state('accepted'),item=soleState(ns,'accepted');assert(byId(ns,item.bubbleId));screenshot('success-accepted');return {key:item.key,transition};});
  await check('default-failure-retry',()=>failureScenario('QueueRetry'));
  await check('fast-back-after-send',async()=>{await patient();await ascii('QA_QueueBack');await hideKeyboard();const ns=await expect('Enviar mensagem local'),send=ns.find(n=>matches(n,'Enviar mensagem local')&&n.enabled!=='false');const timing=rawTap(send);inApp();shell('input','keyevent','KEYCODE_BACK');const backEnd=Date.now();const png=pngOnly('fast-back-frame',timing.start);await expect('Abrir meu chat');const screen=snapshot();assert(!screen.some(n=>matches(n,'Mensagem fictícia')),'Late result must not reopen chat');screenshot('fast-back-company-stable');return {sendTiming:timing,backFinishedAfterSendStartMs:backEnd-timing.start,commandsWithin640ms:backEnd-timing.start<640,png,lateRaceNotFullyInstrumented:true};});
  await check('company-and-logout-after-failure',async()=>{await patient('Clínica Horizonte');await failToggle();await ascii('QA_QueueTenant');await hideKeyboard();await tap('Enviar mensagem local');const ns=await state('failed'),item=soleState(ns,'failed');await hardwareBack();await expect('Abrir meu chat');await hardwareBack();await tap('Abrir Centro Vida',true);await tap('Abrir meu chat',true);const other=snapshot();assert(!other.some(n=>n.text==='QA_QueueTenant'||resourceId(n).endsWith(item.key)));screenshot('company-b-no-a-content');await hardwareBack();await tap('Perfil');await tap('Sair da demonstração',true);await tap('Sair e reiniciar dados');await expect('Conhecer como paciente');await tap('Conhecer como paciente');await tap('Abrir Clínica Horizonte',true);await tap('Abrir meu chat',true);assert(!snapshot().some(n=>n.text==='QA_QueueTenant'));screenshot('logout-new-session-empty');return {oldKey:item.key,beforeCompletionRaceTested:false};});
  await check('coworker-failed-content-private',async()=>{await restart();let ns=await waitFor(n=>n.some(x=>(x.text??'').startsWith('Explorar visão da equipe')),'staff entry');await tap(ns.find(n=>(n.text??'').startsWith('Explorar visão da equipe')).text,true);await tap('Conversa com Marina',true);await failToggle();await ascii('QA_QueueStaff');await hideKeyboard();await tap('Enviar mensagem local');ns=await state('failed');const key=soleState(ns,'failed').key;await hardwareBack();await tap('Perfil');await tap('Experimentar como Bruno',true);await tap('Conversa com Marina',true);ns=snapshot();assert(!ns.some(n=>n.text==='QA_QueueStaff'||resourceId(n).endsWith(key)));screenshot('coworker-no-failed-message');return {oldKey:key,pendingRaceTested:false};});
  await check('stress320-font2-failure-retry',async()=>{await hideKeyboard();shell('settings','put','system','font_scale','2');shell('wm','size','880x4096');await delay(800);return failureScenario('QueueStress',true);});
  result.status=result.checks.every(c=>c.status==='passed')?'passed-with-limitations':'failed-or-unverified';if(result.status!=='passed-with-limitations')process.exitCode=1;
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;try{snapshot();screenshot('failure');}catch{}}
finally{
  if(original)try{try{await hideKeyboard();}catch{}const size=original.size.match(/Override size: (\d+x\d+)/)?.[1];shell('wm','size',size??'reset');const density=original.density.match(/Override density: (\d+)/)?.[1];shell('wm','density',density??'reset');shell('settings','put','system','font_scale',original.font);await delay(500);result.restoredSettings={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};assert.deepEqual(result.restoredSettings,original);result.settingsRestored=true;}catch(error){result.status='failed';result.restoreError=error.stack;process.exitCode=1;}
  result.finishedAt=new Date().toISOString();result.limitations=['Synthetic local queue only, no network/push/Auth or real delivery.','pending/sending640ms are not claimed unless PNG is visually inspected; XML covers final states.','Lost ack and deterministic before-completion context/logout races are unit coverage, not claimed by native post-failure checks.','Bubble count/identity assertions cover exposed UI, not global dedup across virtualized rows.','Unicode queue entry requires a separate observed native paste fixture; not injected through ADB ASCII.'];writeFileSync(join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('Evidence: '+evidence);console.log(JSON.stringify({status:result.status,checks:result.checks.map(c=>({name:c.name,status:c.status})),restored:result.settingsRestored,error:result.error}));
}
