#!/usr/bin/env node
// Local synthetic Android input diagnostic; no real Auth/chat/audio/backend.
// Requires owned Connect_Demo_API36, explicit --serial, installed demo and input-probe v2.
// Default first2bursts; BURST_PHASE=extended: nativeburst/nativepaced/RNburst/RNpaced.
// All text is2000 synthetic ASCII a; paced chunks50 with100ms gaps.
// UIAutomator latency is recorded, not presented as exact0/1/3second samples.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

let PACKAGE = 'com.resicheck.connect.demo';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--serial', '--adb'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('Usage: node android-input-diagnostic.mjs --serial emulator-N [--adb PATH]');
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
const evidence = join(root, 'output', 'input-burst', 'run-'+runId);
mkdirSync(evidence, { recursive: true });
const result = { scope: 'Native Android synthetic simulation UI', package: PACKAGE, serial, startedAt: new Date().toISOString(), checks: [], warnings: [], realAuthenticationTested: false, realChatTested: false, backendAuthorizationTested: false, realPushTested: false, realAudioTested: false };
const remoteXml = `/sdcard/connect-input-diagnostic-${process.pid}.xml`;
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
const DEMO='com.resicheck.connect.demo',PROBE='com.resicheck.connect.inputprobe';
const payload='a'.repeat(2000);
const trialPlan=process.env.BURST_PHASE==='extended'
  ? [{target:'native',mode:'burst',run:2},{target:'native',mode:'paced50',run:1},{target:'rn',mode:'burst',run:2},{target:'rn',mode:'paced50',run:1}]
  : [{target:'rn',mode:'burst',run:1},{target:'native',mode:'burst',run:1}];
let original;
function field(ns,label){return ns.find(n=>(n.class==='android.widget.EditText'||n.class?.endsWith('ProbeEditText'))&&matches(n,label));}
async function prepare(target){
  PACKAGE=target==='rn'?DEMO:PROBE;
  shell('am','force-stop',PACKAGE);shell('am','start','-W','-n',`${PACKAGE}/.MainActivity`);
  if(target==='rn'){await expect('Conhecer como paciente');await tap('Conhecer como paciente');await tap('Abrir Centro Vida',true);await tap('Abrir meu chat',true);}
  const label=target==='rn'?'Mensagem fictícia':'Synthetic native probe input';
  await expect(label);await tap(label);await waitFor(ns=>field(ns,label)?.focused==='true','focused actual native input');
  const ns=snapshot(),n=field(ns,label);assert(n&&(!n.text||n.text===n.hint||n.text===(target==='rn'?'Digite…':'Synthetic ASCII only')),'Trial must start with an empty field');
  return label;
}
function timedInput(text){
  inApp();const start=Date.now();
  try{const stdout=adbRun(['shell','input','text',text],false,120000);return {exitCode:0,durationMs:Date.now()-start,stdout};}
  catch(error){return {exitCode:error.status,durationMs:Date.now()-start,error:error.message,stderr:String(error.stderr??'').slice(0,1000)};}
}
async function observe(label,endTime,name,requestedDelayMs){
  const wait=Math.max(0,endTime+requestedDelayMs-Date.now());if(wait)await delay(wait);
  const startedAfterCommandMs=Date.now()-endTime;if(PACKAGE===PROBE)await tap('READ SYNTHETIC STATISTICS');const ns=snapshot(),completedAfterCommandMs=Date.now()-endTime;
  const n=field(ns,label);assert(n,'Actual EditText must remain exposed');const emptyHint=PACKAGE===DEMO?'Digite…':'Synthetic ASCII only';const text=n.text===n.hint||n.text===emptyHint?'':n.text;
  const count=ns.find(n=>(n['content-desc']??'').endsWith(' de 2000 caracteres'))?.['content-desc'];
  const nativeStats=ns.find(n=>(n['content-desc']??'').startsWith('Probe stats '))?.['content-desc'];
  writeFileSync(join(evidence,name+'.xml'),lastXml);
  return {requestedDelayMs,startedAfterCommandMs,completedAfterCommandMs,length:text.length,exact:text===payload,onlyExpectedAscii:/^a*$/.test(text),counter:count,nativeStats};
}
try{
  assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1');assert.equal(adbRun(['emu','avd','name']).replace(/\r/g,'').split('\n')[0],'Connect_Demo_API36');verifiedEmulator=true;
  original={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};result.originalSettings=original;
  assert.equal(Number(original.font),1);assert(!original.size.includes('Override'));assert(!original.density.includes('Override'));
  result.scope='Synthetic2000 ASCII injection comparison; no real chat/auth/audio/backend';result.trials=[];
  const installedPath=shell('pm','path',DEMO).trim().replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_/=.+~-]+\/base\.apk$/.test(installedPath));result.installedDemoSha256=shell('sha256sum',installedPath).split(/\s+/)[0];assert.equal(result.installedDemoSha256,'3eb80a054208dc970314611b63b4b6d4232b3b2b0e910e8a40bab1c9e093e948');
  const transported=adbRun(['shell','printf','%s',payload]);assert.equal(transported,payload);result.shellArgumentControl={requestedLength:payload.length,observedLength:transported.length,exact:true};
  result.environment={sdk:shell('getprop','ro.build.version.sdk').trim(),abi:shell('getprop','ro.product.cpu.abi').trim(),defaultIme:shell('settings','get','secure','default_input_method').trim()};
  for(const spec of trialPlan){
    const label=await prepare(spec.target),trial={...spec,payloadLength:payload.length,commands:[],observations:[]};
    if(spec.mode==='burst')trial.commands.push(timedInput(payload));
    else for(let offset=0;offset<payload.length;offset+=50){trial.commands.push(timedInput(payload.slice(offset,offset+50)));await delay(100);}
    const end=Date.now();assert(trial.commands.every(c=>c.exitCode===0),'Input command failure, not a text-loss finding');
    const prefix=spec.target+'-'+spec.mode+'-'+spec.run;
    for(const ms of [0,1000,3000])trial.observations.push(await observe(label,end,prefix+'-after'+ms,ms));
    trial.finalExact=trial.observations.at(-1).exact;trial.stableLength=trial.observations.every(x=>x.length===trial.observations[0].length);trial.inputCommandDurationMs=trial.commands.reduce((n,c)=>n+c.durationMs,0);
    screenshot(prefix);result.trials.push(trial);writeFileSync(join(evidence,'progress.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({target:spec.target,mode:spec.mode,run:spec.run,lengths:trial.observations.map(x=>x.length),commandMs:trial.inputCommandDurationMs,nativeStats:trial.observations.at(-1).nativeStats}));await hideKeyboard();
  }
  result.status='diagnostic-completed';result.discrepancies=result.trials.filter(t=>!t.finalExact).length;
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;try{snapshot();screenshot('failure');}catch{}}
finally{
  if(original)try{try{await hideKeyboard();}catch{}const size=original.size.match(/Override size: (\d+x\d+)/)?.[1];shell('wm','size',size??'reset');const density=original.density.match(/Override density: (\d+)/)?.[1];shell('wm','density',density??'reset');shell('settings','put','system','font_scale',original.font);result.restoredSettings={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};assert.deepEqual(result.restoredSettings,original);result.settingsRestored=true;}catch(error){result.status='failed';result.restoreError=error.stack;process.exitCode=1;}
  result.finishedAt=new Date().toISOString();result.observationLimit='UIAutomator observations have dump/idle latency; recorded requested and actual offsets must not be described as exact0/1/3second sampling.';writeFileSync(join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('Evidence: '+evidence);console.log(JSON.stringify({status:result.status,discrepancies:result.discrepancies,restored:result.settingsRestored,error:result.error}));
}
