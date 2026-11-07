#!/usr/bin/env node
// Window/IME geometry observation only. No App/model edits or real server operations.
// Requires explicit owned emulator serial and exact baseline APK hash.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resourceId} from './android-queue-smoke.mjs';

const PACKAGE = 'com.resicheck.connect.demo';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--serial', '--adb'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('Usage: node android-resize-diagnostic.mjs --serial emulator-N [--adb PATH]');
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
const evidence = join(root, 'output', 'resize-baseline', 'run-'+runId);
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
  assert(/^\/sdcard\/connect-demo-qa-\d+\.xml$/.test(remoteXml));
  let lastError;
  for (let attempt=0;attempt<3;attempt++) {
    try {
      lastXml='';
      // Delete only this process's previous dump, never app data. A failed dump
      // must not silently reuse a stale XML file (uiautomator can exit zero).
      shell('rm','-f',remoteXml);
      const output=shell('uiautomator','dump',remoteXml);
      assert(!/ERROR|could not get idle state/i.test(output),'UIAutomator dump reported failure');
      lastXml=adbRun(['exec-out','cat',remoteXml]);
      assert(lastXml.includes('<hierarchy'),'UIAutomator did not produce fresh XML');
      return parse(lastXml).filter(n=>n.package===PACKAGE);
    } catch(error) {lastError=error;}
  }
  throw lastError;
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
const BASELINE='f62918470bd7f51b295736f4f52d3bd12c5110f7b5934a9b95c9c0ea4cafbb7c';
const byId=(ns,id)=>ns.find(n=>resourceId(n)===id);
function imeState(){const raw=shell('dumpsys','input_method');return {shown:/mInputShown=true|isInputViewShown=true/.test(raw),observed:/mInputShown=|isInputViewShown=/.test(raw),lines:raw.split(/\r?\n/).filter(l=>/mInputShown=|isInputViewShown=|mCurId=|mCurFocusedWindow=|mCurAttribute=/.test(l)).map(l=>l.trim())};}
async function awaitIme(shown){const until=Date.now()+8000;do{const s=imeState();if(s.observed&&s.shown===shown)return s;await delay(150);}while(Date.now()<until);throw Error('IME state did not become '+shown);}
async function openKeyboard(){const ns=snapshot(),field=ns.find(n=>n.class==='android.widget.EditText'&&n['content-desc']==='Mensagem fictícia'&&visible(n));if(!field)return false;inApp();shell('input','tap',String(Math.floor((field.rect[0]+field.rect[2])/2)),String(Math.floor((field.rect[1]+field.rect[3])/2)));await awaitIme(true);return true;}
async function closeKeyboard(){if(imeState().shown){inApp();shell('input','keyevent','KEYCODE_BACK');}await awaitIme(false);}
async function patient(){await restart();await tap('Conhecer como paciente',true);await tap('Abrir Centro Vida',true);await tap('Abrir meu chat',true);await expect('Mensagem fictícia');}
function ancestors(xml,target){
  const stack=[],items=[];for(const token of xml.matchAll(/<\/?node\b[^>]*>/g)){if(token[0].startsWith('</')){stack.pop();continue;}const a=Object.fromEntries([...token[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(x=>[x[1],decode(x[2])]));const node={...a,index:items.length,parent:stack.at(-1)};items.push(node);if(!token[0].endsWith('/>'))stack.push(node.index);}
  const n=items.find(target),path=[];let parent=n?.parent;while(parent!==undefined){const p=items[parent];path.push({class:p.class,id:p['resource-id'],bounds:p.bounds});parent=p.parent;}return path;
}
function activityViewLines(raw){const at=raw.indexOf('ACTIVITY '+PACKAGE);const own=at>=0?raw.slice(at,raw.indexOf('\nACTIVITY ',at+1)>=0?raw.indexOf('\nACTIVITY ',at+1):undefined):'';return {found:at>=0,own,viewLines:own.split(/\r?\n/).filter(l=>/ReactRootView|ReactSurfaceView|ReactViewGroup|ReactEditText|ReactScrollView|View Hierarchy|ViewRoot/.test(l))};}
async function captureFrame(name){
  const ns=snapshot(),xml=lastXml,field=ns.find(n=>n.class==='android.widget.EditText'&&n['content-desc']==='Mensagem fictícia'),list=byId(ns,'chat-message-list');
  const ime=imeState(),window=shell('dumpsys','window'),activity=activityViewLines(shell('dumpsys','activity','top'));
  writeFileSync(join(evidence,name+'-activity-top.txt'),activity.own||'Own Activity block not found\n');
  const windowLines=window.split(/\r?\n/).filter(l=>/mCurrentFocus=|mFocusedApp=|mDisplayInfo=|DisplayFrames|mBaseDisplayWidth|mBaseDisplayHeight|mOverrideDisplayWidth|mOverrideDisplayHeight/.test(l));
  const frame={name,observedAt:new Date().toISOString(),size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim(),ime,rootRect:ns[0]?.rect,listRect:list?.rect,composer:field?{rect:field.rect,visible:visible(field),focused:field.focused,textIsPlaceholder:field.text===field.hint}:null,send:ns.find(n=>matches(n,'Enviar mensagem local'))?.rect,listAncestors:ancestors(xml,n=>n['resource-id']==='chat-message-list'),composerAncestors:ancestors(xml,n=>n.class==='android.widget.EditText'&&n['content-desc']==='Mensagem fictícia'),windowLines,activityViewLines:activity.viewLines,activityBlockFound:activity.found};
  lastXml=xml;screenshot(name);result.frames.push(frame);writeFileSync(join(evidence,'progress.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({frame:name,composer:!!field,list:frame.listRect,ime:ime.shown,size:frame.size.trim().replace(/\r?\n/g,' | ')}));return frame;
}
async function resize(height){shell('wm','size','880x'+height);await delay(650);}
async function reenter(){await closeKeyboard();inApp();shell('input','keyevent','KEYCODE_BACK');await expect('Abrir meu chat');await tap('Abrir meu chat',true);}
async function recover(prefix){
  if(imeState().shown){await closeKeyboard();await captureFrame(prefix+'-after-hide');}
  const opened=await openKeyboard();await captureFrame(prefix+(opened?'-show-or-reshow':'-cannot-show-composer-absent'));
  if(opened){await closeKeyboard();await captureFrame(prefix+'-hide-again');}
  await reenter();await captureFrame(prefix+'-reentered-closed');const after=await openKeyboard();await captureFrame(prefix+(after?'-reentered-open':'-reentered-still-absent'));await closeKeyboard();
}
async function begin(height){await closeKeyboard();await resize(height);await patient();}
async function check(name,fn){try{await fn();result.checks.push({name,status:'observed'});console.log('DONE '+name);}catch(error){result.checks.push({name,status:'incomplete',error:error.stack});try{await captureFrame(name+'-failure');}catch{}console.error(name+': '+error.message);}writeFileSync(join(evidence,'progress.json'),JSON.stringify(result,null,2)+'\n');}
let original;
try{
  assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1');assert.equal(adbRun(['emu','avd','name']).replace(/\r/g,'').split('\n')[0],'Connect_Demo_API36');verifiedEmulator=true;
  const path=shell('pm','path',PACKAGE).trim().replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_/=.+~-]+\/base\.apk$/.test(path));assert.equal(shell('sha256sum',path).split(/\s+/)[0],BASELINE);result.artifactSha256=BASELINE;
  original={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};result.originalSettings=original;result.frames=[];result.scope='Native baseline window/IME observation; no causal claim';shell('settings','put','system','font_scale','2');
  await check('cold-target',async()=>{await begin(2048);await captureFrame('cold-closed');assert(await openKeyboard());await captureFrame('cold-open');await closeKeyboard();await captureFrame('cold-hidden');});
  await check('warm-never-ime',async()=>{await begin(4096);await captureFrame('never-large-closed');await resize(2048);await captureFrame('never-small-closed');await delay(1800);await captureFrame('never-small-settled');await recover('never-recovery');});
  await check('warm-ime-then-hidden',async()=>{await begin(4096);assert(await openKeyboard());await captureFrame('used-large-open');await closeKeyboard();await captureFrame('used-large-hidden');await resize(2048);await captureFrame('used-small-hidden');await delay(1800);await captureFrame('used-small-settled');await recover('used-recovery');});
  await check('warm-ime-kept-open',async()=>{await begin(4096);assert(await openKeyboard());await captureFrame('open-large');await resize(2048);await captureFrame('open-small');await delay(1800);await captureFrame('open-small-settled');await recover('open-recovery');});
  await check('original-send-failure-pattern',async()=>{await begin(4096);await tap('Simular falha no próximo envio',true);await tap('Mensagem fictícia');shell('input','text','QA_Resize');await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&n.text==='QA_Resize'),'synthetic draft');await closeKeyboard();await tap('Enviar mensagem local');await waitFor(ns=>ns.some(n=>n.text==='Não confirmado · simulação'),'fake failure');await captureFrame('failure-large-hidden');await resize(2048);await captureFrame('failure-small-hidden');await delay(1800);await captureFrame('failure-small-settled');await recover('failure-recovery');});
  result.status=result.checks.every(c=>c.status==='observed')?'diagnostic-completed':'diagnostic-incomplete';if(result.status==='diagnostic-incomplete')process.exitCode=1;
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{
  if(original)try{try{await closeKeyboard();}catch{}shell('wm','size',original.size.match(/Override size: (\d+x\d+)/)?.[1]??'reset');shell('wm','density',original.density.match(/Override density: (\d+)/)?.[1]??'reset');shell('settings','put','system','font_scale',original.font);result.restoredSettings={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};assert.deepEqual(result.restoredSettings,original);result.settingsRestored=true;}catch(error){result.restoreError=error.stack;result.status='failed';process.exitCode=1;}result.finishedAt=new Date().toISOString();writeFileSync(join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('Evidence: '+evidence);console.log(JSON.stringify({status:result.status,frames:result.frames?.length,checks:result.checks,restored:result.settingsRestored,error:result.error}));
}
