#!/usr/bin/env node
// Synthetic Android audio-layout checks. No real microphone, recording, playback, chat or backend.
// Default: representative393/1,360/1.3,320/1.6,320/2 with keyboard closed/open.
// AUDIO_FINAL_DELTA=1: placeholder320/1.6 plus320/2 references/cases and original-size patient smoke.
// Height4096px is reference/setup ONLY; target cases remain2048px. Original wm/font restored in finally.
// Usage: node apps/mobile/scripts/android-audio-layout.mjs --serial emulator-5554 [--adb PATH]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const PACKAGE = 'com.resicheck.connect.demo';
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--serial', '--adb'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('Usage: node android-audio-layout.mjs --serial emulator-N [--adb PATH]');
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
const evidence = join(root, 'output', 'audio-layout', 'matrix-'+runId);
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
const byId = (nodes, id) => nodes.find(n => n['resource-id'] === id || n['resource-id']?.endsWith('/' + id));
function geometry(nodes, id) {
  const names = { bubble: `message-${id}`, header: `message-header-${id}`, audio: `audio-demo-${id}`, footer: `message-footer-${id}`, time: `message-time-${id}`, title: `audio-title-${id}`, detail: `audio-detail-${id}`, content: `audio-content-${id}` };
  const found = Object.fromEntries(Object.entries(names).map(([k,v]) => [k, byId(nodes,v)]));
  const viewport = byId(nodes, 'chat-message-list');
  const r = Object.fromEntries(Object.entries(found).map(([k,n]) => [k, n?.rect ?? null]));
  const required = ['bubble','header','audio','footer','time'];
  if (required.some(k=>!r[k])) return { complete: false, reason: 'Missing native nodes: '+required.filter(k=>!r[k]).join(','), rects:r, viewport:viewport?.rect };
  const inside = (a,b) => a[0]>=b[0] && a[1]>=b[1] && a[2]<=b[2] && a[3]<=b[3];
  const clipped = viewport?.rect && (r.bubble[1]<=viewport.rect[1]+1 || r.bubble[3]>=viewport.rect[3]-1);
  if(clipped) return {complete:false,reason:'Bubble touches clipped viewport edge',rects:r,viewport:viewport.rect};
  const errors=[];
  // UIAutomator rounds each physical rectangle independently; allow 2px at
  // touching layout boundaries, while checking actual title/detail separately.
  if(r.header[3]>r.audio[1]+2) errors.push('header overlaps audio');
  if(r.audio[3]>r.footer[1]+2) errors.push('audio overlaps footer');
  for(const k of required.slice(1)) if(!inside(r[k],r.bubble)) errors.push(k+' outside bubble');
  if(!inside(r.time,r.footer)) errors.push('time outside footer');
  if(r.title && r.detail && r.title[3]>r.detail[1]) errors.push('title overlaps detail');
  for(const k of ['title','detail','content']) if(r[k]&&!inside(r[k],r.audio)) errors.push(k+' outside audio');
  return {complete:true,passed:errors.length===0,errors,rects:r,viewport:viewport?.rect,childTextBoundsExposed:!!(r.title&&r.detail),nativeAudioLabel:found.audio['content-desc'],time:found.time.text};
}
function scrollMessageList(nodes,direction,distance=40) {
  const viewport=byId(nodes,'chat-message-list');assert(visible(viewport),'Observed chat viewport required');
  const [x1,y1,x2,y2]=viewport.rect,x=Math.floor((x1+x2)/2);
  assert(y2-y1>80,'Chat viewport too short for a safe bounded scroll');inApp();
  const middle=Math.floor((y1+y2)/2),step=Math.min(Math.floor(distance/2),Math.floor((y2-y1)*.35));
  const a=middle+step,b=middle-step;
  shell('input','swipe',String(x),String(direction==='older'?b:a),String(x),String(direction==='older'?a:b),'350');
}
const closedReferences = new Map();
async function inspectBubble(id,name,reference) {
  let nodes, g;const covered=new Set(),segments=[];
  for(let attempt=0;attempt<16;attempt++) {
    nodes=snapshot();g=geometry(nodes,id);if(g.complete)break;
    const r=g.rects, vp=g.viewport;
    if(reference && vp) {
      const added=[];
      for(const k of ['header','title','detail','time']) {
        const current=r[k],expected=reference.rects[k];
        if(current&&expected&&Math.abs((current[3]-current[1])-(expected[3]-expected[1]))<=2&&current[1]>vp[1]+1&&current[3]<vp[3]-1&&!covered.has(k)){covered.add(k);added.push(k);}
      }
      if(added.length){const segmentName=name+'-segment'+segments.length;screenshot(segmentName);segments.push({name:segmentName,visibleUnclipped:added,rects:r,viewport:vp});}
      if(covered.size===4)break;
    }
    let older = !r.bubble ? id==='local-20' : r.bubble[1]<=(vp?.[1]??0)+1 || !r.header;
    if(reference&&r.bubble) older=!covered.has('header')&&r.bubble[1]<=(vp?.[1]??0)+1;
    const clippedHeader=reference&&(!r.header||r.header[3]-r.header[1]<reference.rects.header[3]-reference.rects.header[1]-2);
    scrollMessageList(nodes,older?'older':'newer',!r.bubble||clippedHeader?200:80);await delay(300);
  }
  screenshot(name);
  return {id,name,...g,scrollAccessible:covered.size===4,unclippedComponentsAcrossSegments:[...covered],segments};
}
async function sendAudio() {
  await hideKeyboard();await tap('Experimentar áudio fictício');await tap('Simular gravação');await tap('Parar e revisar');await tap('Enviar áudio fictício');await expect('Prévia visual do áudio fictício');
}
async function seedStaffPair(font) {
  await restart();await tap('Experimentar cadastro');
  const longName='AlexandriaDemoAtendimentoAdministrativo';
  let nameNodes=await expect('Nome de demonstração');
  const nameInput=nameNodes.find(n=>n.class==='android.widget.EditText'&&matches(n,'Nome de demonstração'));
  assert(visible(nameInput),'Actual native name input required, not matching TextView label');
  inApp();shell('input','tap',String(Math.floor((nameInput.rect[0]+nameInput.rect[2])/2)),String(Math.floor((nameInput.rect[1]+nameInput.rect[3])/2)));
  await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&n.focused==='true'),'name input focus');
  shell('input','keyevent','KEYCODE_MOVE_END');shell('input','keyevent',...Array(6).fill('KEYCODE_DEL'));
  await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&matches(n,'Nome de demonstração')&&(n.text===''||n.text===n.hint)),'empty native name');
  shell('input','text',longName);
  await waitFor(ns=>ns.some(n=>n.class==='android.widget.EditText'&&matches(n,'Nome de demonstração')&&n.text===longName),'exact synthetic long name');
  snapshot();screenshot('00-font'+font+'-long-name-input');await hideKeyboard();await tap('Simular entrada com convite do gestor',true);await tap('Conversa com Marina',true);await sendAudio();
  await expect(longName+' · equipe demo');snapshot();screenshot('00-font'+font+'-long-staff-own-audio');
  await hardwareBack();await expect('Conversa com Marina');await tap('Perfil');await tap('Experimentar como Ana',true);await tap('Conversa com Marina',true);await sendAudio();
}
let original;
try {
  assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1');assert.equal(adbRun(['emu','avd','name']).replace(/\r/g,'').split('\n')[0],'Connect_Demo_API36');verifiedEmulator=true;
  original={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};result.originalSettings=original;writeFileSync(join(evidence,'original-settings.json'),JSON.stringify(original,null,2));
  if(process.env.AUDIO_FINAL_DELTA) {
    shell('settings','put','system','font_scale','1.6');shell('wm','size','880x2048');await delay(1000);await restart();
    await tap('Conhecer como paciente',true);await tap('Abrir Clínica Horizonte',true);await tap('Abrir meu chat',true);
    let fieldNodes=snapshot();let field=fieldNodes.find(n=>n.class==='android.widget.EditText'&&matches(n,'Mensagem fictícia'));
    assert(field&&field.hint==='Digite…','Final short placeholder required');screenshot('placeholder-320-font1.6-closed');
    await tap('Mensagem fictícia');await delay(500);fieldNodes=snapshot();field=fieldNodes.find(n=>n.class==='android.widget.EditText'&&matches(n,'Mensagem fictícia'));
    assert(field&&field.hint==='Digite…');assert(/mInputShown=true|isInputViewShown=true/.test(shell('dumpsys','input_method')));assert.equal(Number(shell('settings','get','system','font_scale').trim()),1.6);assert(shell('wm','size').includes('880x2048'));screenshot('placeholder-320-font1.6-open');
    result.placeholder16={widthDp:320,heightPx:2048,fontScale:1.6,keyboard:true,hint:field.hint,rect:field.rect,verified:true};await hideKeyboard();
  }
  result.cases=[];result.fixtureSetup={synthetic:true,widthDp:393,heightPx:4096,reason:'Font scale recreates Activity and clears in-memory demo; fixtures created through native UI then resized to target2048px. This is not proof of target-height audio modal usability.'};
  const density=Number(original.density.match(/(?:Override|Physical) density: (\d+)/g).at(-1).match(/\d+/)[0]);
  for(const font of (process.env.AUDIO_FINAL_DELTA ? [2] : process.env.AUDIO_PILOT ? [1] : [1,1.3,1.6,2])) {
    await hideKeyboard();shell('settings','put','system','font_scale',String(font));shell('wm','size',`${Math.round(393*density/160)}x4096`);await delay(1200);await seedStaffPair(font);
    for(const width of (font===1?[393]:font===1.3?[360]:[320])) {
    await hideKeyboard();
    const referenceGeometry={referenceOnly:true,widthDp:width,fontScale:font,heightPx:4096,bubbles:[]};
    shell('wm','size',`${Math.round(width*density/160)}x4096`);await delay(700);
    for(const id of ['local-20','local-21']) {const ref=await inspectBubble(id,`reference-w${width}-font${font}-${id}`);referenceGeometry.bubbles.push(ref);if(ref.complete&&ref.passed)closedReferences.set(width+'/'+font+'/'+id,ref);}
    result.references??=[];result.references.push(referenceGeometry);
    shell('wm','size',`${Math.round(width*density/160)}x2048`);await delay(1100);
    for(const keyboard of ['closed','open']) {
      if(keyboard==='open') {await tap('Mensagem fictícia');await delay(800);}
      else await hideKeyboard();
      const caseName=`w${width}-font${font}-${keyboard}`;
      const current={widthDpRequested:width,heightPx:2048,fontScale:font,keyboard,actualSize:shell('wm','size'),actualFont:shell('settings','get','system','font_scale').trim(),imeShown:/mInputShown=true|isInputViewShown=true/.test(shell('dumpsys','input_method')),bubbles:[]};
      const actualSize=current.actualSize.match(/(?:Override|Physical) size: (\d+x\d+)/g)?.at(-1)?.match(/\d+x\d+/)?.[0];
      assert.equal(actualSize,`${Math.round(width*density/160)}x2048`,'Actual wm size must match case');
      assert.equal(Number(current.actualFont),font,'Actual font scale must match case');
      assert.equal(current.imeShown,keyboard==='open','Actual keyboard visibility must match case');
      current.configurationVerified=true;
      for(const id of ['local-20','local-21']) {
        try{const key=width+'/'+font+'/'+id;const check=await inspectBubble(id,caseName+'-'+id,closedReferences.get(key));current.bubbles.push(check);if(keyboard==='closed'&&check.complete)closedReferences.set(key,check);}
        catch(error){current.bubbles.push({id,complete:false,reason:error.message});try{snapshot();screenshot(caseName+'-'+id+'-error');}catch{}}
      }
      result.cases.push(current);writeFileSync(join(evidence,'progress.json'),JSON.stringify(result,null,2));console.log(caseName+' '+current.bubbles.map(b=>b.complete?(b.passed?'PASS':'FAIL '+b.errors):'PARTIAL '+b.reason).join(' | '));
    }
    if(font===1.3){await hideKeyboard();try{await sendAudio();snapshot();screenshot('target360-font1.3-audio-created');result.targetAudioFlow={widthDp:360,fontScale:1.3,heightPx:2048,passed:true,realRecording:false};}catch(error){snapshot();screenshot('target360-font1.3-audio-flow-failure');result.targetAudioFlow={widthDp:360,fontScale:1.3,heightPx:2048,passed:false,reason:error.message};await hardwareBack();}}
  }
  }
  await hideKeyboard();shell('wm','size','reset');shell('settings','put','system','font_scale','1');await delay(800);await restart();await tap('Conhecer como paciente');await tap('Abrir Clínica Horizonte');await tap('Abrir meu chat',true);await sendAudio();snapshot();screenshot('patient-own-audio-closed');result.patientOwn=geometry(snapshot(),'local-20');await tap('Mensagem fictícia');snapshot();screenshot('patient-own-audio-open');
  const failures=result.cases.flatMap(c=>c.bubbles.filter(b=>b.complete&&!b.passed));const partial=result.cases.flatMap(c=>c.bubbles.filter(b=>!b.complete));result.nativeGeometryFailures=failures.length;result.partialBubbles=partial.length;result.scrollAccessibleBubbles=partial.filter(b=>b.scrollAccessible).length;result.unresolvedBubbles=partial.filter(b=>!b.scrollAccessible).length;result.status=failures.length||result.unresolvedBubbles||result.targetAudioFlow?.passed===false||!result.patientOwn?.passed?'failed':partial.length?'passed-with-limitations':'passed';if(result.status==='failed')process.exitCode=1;
} catch(error) { result.status='failed';result.error=error.stack;try{snapshot();screenshot('failure');}catch{}process.exitCode=1;
} finally {
  if(original) {
    try {
      // An unexpected focus change must not prevent restoring emulator settings.
      try { await hideKeyboard(); } catch(error) { result.warnings.push('Keyboard cleanup skipped: '+error.message); }
      const size=original.size.match(/Override size: (\d+x\d+)/)?.[1];shell('wm','size',size??'reset');const density=original.density.match(/Override density: (\d+)/)?.[1];shell('wm','density',density??'reset');if(original.font==='null')shell('settings','delete','system','font_scale');else shell('settings','put','system','font_scale',original.font);await delay(600);
      result.restoredSettings={size:shell('wm','size'),density:shell('wm','density'),font:shell('settings','get','system','font_scale').trim()};assert.deepEqual(result.restoredSettings,{...original});result.settingsRestored=true;
    }catch(error){result.settingsRestored=false;result.restoreError=error.stack;result.status='failed';process.exitCode=1;}
  }
  result.finishedAt=new Date().toISOString();result.limitations=['Synthetic audio card only: no microphone, recording, playback, delivery or backend tested.','Native accessibility may group title/detail inside Pressable; screenshots and complementary web geometry cover visual text when child bounds are absent.','Clipped bubbles are reported partial rather than passed; user may scroll messages with large fonts and keyboard.'];writeFileSync(join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('Evidence: '+evidence);console.log(JSON.stringify({status:result.status,cases:result.cases?.length,failures:result.nativeGeometryFailures,partial:result.partialBubbles,restored:result.settingsRestored,error:result.error}));
}
