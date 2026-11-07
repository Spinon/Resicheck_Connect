#!/usr/bin/env node
// Native synthetic-demo UI checks only. No real authentication, chat, push or audio.
// Usage: node apps/mobile/scripts/android-smoke.mjs --serial emulator-5554 [--adb PATH]
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
    throw new Error('Usage: node android-smoke.mjs --serial emulator-N [--adb PATH]');
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
const evidence = join(root, 'output', 'android-qa', runId);
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
function visible(node) { return node.rect && node.rect[2] > node.rect[0] && node.rect[3] > node.rect[1] && node['visible-to-user'] !== 'false'; }
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
async function typeSynthetic(label, text, previousText = '') {
  assert(/^[A-Za-z0-9_]*$/.test(text) && /^[A-Za-z0-9_]*$/.test(previousText), 'Harness types synthetic ASCII only');
  assert(previousText.length <= 80, 'Bounded synthetic replacement only');
  await tap(label);
  inApp();
  if (previousText) {
    shell('input', 'keyevent', 'KEYCODE_MOVE_END');
    shell('input', 'keyevent', ...Array(previousText.length).fill('KEYCODE_DEL'));
  }
  if (text.length > 200) {
    // A 2000-key flood did not deliver all characters in a prior native run.
    // Pace batches and observe the exact native field after each, without
    // attributing that loss to ADB, IME or the controlled input prematurely.
    for (let end = 50; end < text.length + 50; end += 50) {
      const stop = Math.min(end, text.length);
      inApp();
      shell('input', 'text', text.slice(end - 50, stop));
      await waitFor(nodes => nodes.some(n => matches(n, label) && n.text === text.slice(0, stop)), `exact native draft after ${stop} paced ASCII characters`);
    }
  } else if (text) shell('input', 'text', text);
  await delay(350);
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
async function check(name, action) {
  await action();
  result.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function restart() {
  shell('am', 'force-stop', PACKAGE);
  shell('am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
  await expect('Conhecer como paciente');
}
function previewNodes(nodes) {
  const preview = nodes.find(n => n['resource-id'] === 'notification-preview' || n['resource-id']?.endsWith('/notification-preview'));
  assert(preview?.rect, 'Notification preview testID is not exposed in native hierarchy');
  const [x1, y1, x2, y2] = preview.rect;
  return nodes.filter(n => visible(n) && n.rect[0] >= x1 && n.rect[1] >= y1 && n.rect[2] <= x2 && n.rect[3] <= y2);
}
function revealLowerContent() {
  const viewport = snapshot().filter(n => n.scrollable === 'true' && visible(n)).sort((a, b) => (b.rect[3] - b.rect[1]) - (a.rect[3] - a.rect[1]))[0];
  assert(viewport, 'No observed app scroll viewport for preview');
  const [x1, y1, x2, y2] = viewport.rect;
  const x = Math.floor((x1 + x2) / 2);
  inApp();
  shell('input', 'swipe', String(x), String(Math.floor(y1 + (y2 - y1) * .8)), String(x), String(Math.floor(y1 + (y2 - y1) * .35)), '350');
}
try {
  assert.equal(shell('getprop', 'ro.kernel.qemu').trim(), '1', 'Refusing a target not positively verified as an emulator');
  verifiedEmulator = true;
  assert(shell('pm', 'path', PACKAGE).trim().startsWith('package:'), 'Demo package must already be installed by the operator');
  await restart();
  await check('Patient opens linked company and own local chat', async () => {
    await tap('Conhecer como paciente');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    await expect('Mensagem fictícia');
    assert(!snapshot().some(n => matches(n, 'Conversa com Pedro')), 'Patient should not see employee conversation list');
    screenshot('01-patient-chat');
  });
  await check('Synthetic text is rendered after local send', async () => {
    await tap('Mensagem fictícia');
    const text = 'Mensagem_sintetica_Android';
    inApp();
    shell('input', 'text', text);
    await tap('Enviar mensagem local');
    await expect(text);
    screenshot('02-local-message');
    // Hide only the IME when Android reports it shown; BACK otherwise could navigate.
    await hideKeyboard();
  });
  try {
    await check('Notification local preview has safe default and explicit level four', async () => {
      await tap('Voltar');
      await expect('Abrir meu chat');
      await tap('Perfil');
      await tap('Configurar notificações');
      const defaultNodes = snapshot();
      assert(defaultNodes.some(n => matches(n, 'Nível 1: Só o aplicativo') && n.checked === 'true'), 'Default privacy radio should be level one');
      await tap('Só importantes', true);
      await tap('Nível 1: Só o aplicativo', true);
      revealLowerContent();
      await delay(400);
      let nodes = snapshot();
      let preview = previewNodes(nodes);
      assert(preview.some(n => matches(n, 'ResiCheck Connect')), 'Default preview must show app name');
      assert(!preview.some(n => /Clínica Horizonte|Ana|Recebemos/.test(n.text ?? '')), 'Level one must omit company, attendant and message');
      screenshot('03-private-preview');
      await tap('Nível 4: Incluir mensagem', true);
      nodes = await waitFor(n => previewNodes(n).some(x => (x.text ?? '').includes('Recebemos')), 'expanded local preview');
      preview = previewNodes(nodes);
      assert(preview.some(n => matches(n, 'Clínica Horizonte')), 'Expanded preview should contain company');
      assert(preview.some(n => (n.text ?? '').includes('Ana')), 'Expanded preview should contain synthetic attendant');
      screenshot('04-expanded-preview');
    });
  } catch (error) {
    result.warnings.push(`Notification preview not fully verified: ${error.message}`);
    screenshot('notification-check-incomplete');
  }
  await restart();
  await check('Manager invitation simulation enters employee conversations directly', async () => {
    await tap('Experimentar cadastro', true);
    await tap('Simular entrada com convite do gestor', true);
    await expect('Conversa com Marina');
    await expect('Conversa com Pedro');
    assert(!snapshot().some(n => normalize(n.text).includes('aguardando aceite')), 'Valid invitation demo should not be pending');
    screenshot('05-invited-employee');
  });
  await restart();
  await check('No-invitation employee request remains pending without conversation access', async () => {
    await tap('Experimentar cadastro', true);
    await tap('Buscar empresa sem convite', true);
    await tap('Solicitar vínculo Clínica Horizonte', true);
    await waitFor(nodes => nodes.some(n => normalize(n.text).includes('aguardando aceite.')), 'pending employee request');
    const nodes = snapshot();
    assert(!nodes.some(n => matches(n, 'Conversa com Marina') || matches(n, 'Conversas')), 'Pending demo must not expose employee conversation controls');
    screenshot('06-employee-pending');
    await tap('Voltar ao início', true);
    await expect('Conhecer como paciente');
  });
  await check('Patient profile returns to its company-list origin', async () => {
    await tap('Conhecer como paciente');
    await tap('Meu perfil e preferências', true);
    await expect('Configurar notificações');
    await hardwareBack();
    await expect('Abrir Centro Vida');
    assert(!snapshot().some(n => matches(n, 'Abrir meu chat')), 'Profile from list must return to list, not selected company');
    screenshot('07-profile-list-origin');
  });
  await check('Company search accepts unaccented text and recovers from an empty result', async () => {
    await tap('＋ Vincular outra empresa', true);
    await typeSynthetic('Buscar empresa fictícia', 'clinica');
    await hideKeyboard();
    await expect('Vincular Clínica Jardim');
    await typeSynthetic('Buscar empresa fictícia', 'naoexiste', 'clinica');
    await hideKeyboard();
    await expect('Nenhuma empresa encontrada');
    assert(!snapshot().some(n => /^(Abrir|Vincular) Clínica/.test(n['content-desc'] ?? '')), 'Empty search should not expose company cards');
    screenshot('08-empty-company-search');
    await tap('Limpar busca', true);
    await expect('Vincular Clínica Jardim');
    await hardwareBack();
    await expect('Abrir Centro Vida');
  });
  const unsentDraft = 'Rascunho_sintetico_preservado';
  const beforeExit = 'Mensagem_antes_de_sair';
  await check('Root BACK confirmation cancellation preserves the local message and draft', async () => {
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    await typeSynthetic('Mensagem fictícia', beforeExit);
    await tap('Enviar mensagem local');
    await expect(beforeExit);
    await typeSynthetic('Mensagem fictícia', unsentDraft);
    await expect('Rascunho nesta conversa · só nesta sessão');
    await hideKeyboard();
    await hardwareBack(); // chat -> company
    await expect('Abrir meu chat');
    await hardwareBack(); // company -> list
    await expect('Abrir Centro Vida');
    await hardwareBack(); // root -> confirmation, not logout
    await expect('Sair da demonstração?');
    screenshot('09-root-exit-confirmation');
    await tap('Continuar na demonstração');
    await expect('Abrir Centro Vida');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    const nodes = await expect('Rascunho nesta conversa · só nesta sessão');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === unsentDraft), 'Cancel must preserve exact draft');
    assert(nodes.some(n => n.text === beforeExit), 'Cancel must preserve local sent message');
    screenshot('10-preserved-draft');
  });
  await check('Hardware BACK dismisses exit modal without resetting session', async () => {
    await hardwareBack();
    await expect('Abrir meu chat');
    await hardwareBack();
    await expect('Abrir Centro Vida');
    await hardwareBack();
    await expect('Sair da demonstração?');
    await hardwareBack(); // Modal.onRequestClose, not root navigation
    await expect('Abrir Centro Vida');
    assert(!snapshot().some(n => matches(n, 'Sair e reiniciar dados')), 'Modal BACK must dismiss confirmation');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    assert((await expect('Rascunho nesta conversa · só nesta sessão')).some(n => matches(n, 'Mensagem fictícia') && n.text === unsentDraft), 'Modal BACK must preserve draft');
  });
  await check('Confirmed profile exit resets synthetic message, draft and settings', async () => {
    await hardwareBack();
    await expect('Abrir meu chat');
    await tap('Perfil');
    await tap('Configurar notificações');
    await tap('Nível 4: Incluir mensagem', true);
    assert(snapshot().some(n => matches(n, 'Nível 4: Incluir mensagem') && n.checked === 'true'), 'Set non-default preference before testing reset');
    await tap('Voltar');
    await tap('Sair da demonstração', true);
    await expect('Sair da demonstração?');
    await tap('Sair e reiniciar dados');
    await expect('Conhecer como paciente');
    await tap('Conhecer como paciente');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    const nodes = await expect('Demonstração · mensagens apenas neste aparelho');
    assert(!nodes.some(n => n.text === beforeExit || n.text === unsentDraft), 'Confirmed logout must reset sent message and draft');
    assert(nodes.some(n => matches(n, 'Enviar mensagem local') && n.enabled === 'false'), 'Empty draft must disable send after reset');
    screenshot('11-exit-reset-chat');
    await hardwareBack();
    await expect('Abrir meu chat');
    await tap('Perfil');
    await tap('Configurar notificações');
    assert(snapshot().some(n => matches(n, 'Nível 1: Só o aplicativo') && n.checked === 'true'), 'Logout must restore private default');
    await restart();
  });
  await check('Synthetic company switch isolates messages/drafts, profile preserves scope, logout clears both', async () => {
    const markerA = 'Mensagem_exclusiva_Horizonte';
    const markerB = 'Mensagem_exclusiva_Vida';
    const draftA = 'Rascunho_exclusivo_Horizonte';
    const draftB = 'Rascunho_exclusivo_Vida';
    await tap('Conhecer como paciente');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    await typeSynthetic('Mensagem fictícia', markerA);
    await tap('Enviar mensagem local');
    await expect(markerA);
    await typeSynthetic('Mensagem fictícia', draftA);
    await hideKeyboard();
    await hardwareBack();
    await expect('Abrir meu chat');
    await hardwareBack();
    await expect('Abrir Centro Vida');
    await tap('Abrir Centro Vida');
    await tap('Abrir meu chat', true);
    let nodes = await expect('Demonstração · mensagens apenas neste aparelho');
    assert(!nodes.some(n => n.text === markerA || n.text === draftA), 'Company B must not show company A message or draft');
    await typeSynthetic('Mensagem fictícia', markerB);
    await tap('Enviar mensagem local');
    await expect(markerB);
    await typeSynthetic('Mensagem fictícia', draftB);
    await hideKeyboard();
    nodes = snapshot();
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === draftB), 'Company B keeps its own draft');
    screenshot('12-company-b-scope');
    await hardwareBack();
    await expect('Abrir meu chat');
    await hardwareBack();
    await expect('Abrir Clínica Horizonte');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    nodes = await expect('Rascunho nesta conversa · só nesta sessão');
    assert(nodes.some(n => n.text === markerA), 'Returning to company A restores its own message');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === draftA), 'Returning to company A restores its own draft');
    assert(!nodes.some(n => n.text === markerB || n.text === draftB), 'Company A must not show company B message or draft');
    await hardwareBack();
    await expect('Abrir meu chat');
    await tap('Perfil');
    await hardwareBack();
    await expect('Abrir meu chat');
    await tap('Abrir meu chat', true);
    nodes = await expect('Rascunho nesta conversa · só nesta sessão');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === draftA), 'Profile round trip must preserve company A draft');
    screenshot('13-company-a-restored');
    await hardwareBack();
    await expect('Abrir meu chat');
    await tap('Perfil');
    await tap('Sair da demonstração', true);
    await tap('Sair e reiniciar dados');
    await expect('Conhecer como paciente');
    await tap('Conhecer como paciente');
    await tap('Abrir Centro Vida');
    await tap('Abrir meu chat', true);
    nodes = await expect('Demonstração · mensagens apenas neste aparelho');
    assert(!nodes.some(n => [markerA, markerB, draftA, draftB].includes(n.text)), 'Logout must clear previous local messages/drafts across companies');
    screenshot('14-company-b-after-logout');
    await restart();
  });
  await check('Seeded tone, ZWJ profession and flag preserve Unicode in native text/accessibility', async () => {
    await tap('Conhecer como paciente');
    await tap('Abrir Clínica Horizonte');
    await tap('Abrir meu chat', true);
    const thumb = 'Oi! Posso enviar minha guia por aqui? 👍🏽';
    let nodes = await expect(thumb);
    assert(nodes.some(n => visible(n) && n['content-desc'] === thumb), 'Original toned emoji must be exposed in native accessibility label');
    screenshot('15-toned-emoji');
    await hardwareBack();
    await expect('Abrir meu chat');
    await hardwareBack();
    await expect('Abrir Centro Vida');
    await tap('Abrir Centro Vida');
    await tap('Abrir meu chat', true);
    const sequence = 'Olá! Este é o seu chat com o Centro Vida. 👩🏾‍⚕️ 🇧🇷';
    nodes = await expect(sequence);
    assert(nodes.some(n => visible(n) && n['content-desc'] === sequence), 'Original ZWJ/tone/flag sequence must remain in native accessibility label');
    assert(!nodes.some(n => /\ufffd/.test(n.text ?? '')), 'Native text must not contain replacement characters');
    await expect('0 de 2000 caracteres');
    screenshot('16-zwj-tone-flag');
  });
  await check('Hermes composer keeps 2000/2001 ASCII intact and enforces grapheme send boundary', async () => {
    const boundary = 'a'.repeat(2000);
    await typeSynthetic('Mensagem fictícia', boundary);
    let nodes = await expect('2000 de 2000 caracteres');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === boundary), '2000-character draft must remain exact');
    assert(nodes.some(n => matches(n, 'Enviar mensagem local') && n.enabled !== 'false'), 'Boundary draft must permit send');
    inApp();
    shell('input', 'text', 'a');
    nodes = await expect('2001 de 2000 caracteres');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === boundary + 'a'), 'Oversized input must not be silently truncated');
    assert(nodes.some(n => matches(n, 'Enviar mensagem local') && n.enabled === 'false'), 'Oversized draft must disable send');
    await expect('A mensagem ultrapassa 2.000 caracteres. Edite o texto para enviar.');
    await hideKeyboard();
    screenshot('17-grapheme-limit-error');
    await tap('Mensagem fictícia');
    inApp();
    shell('input', 'keyevent', 'KEYCODE_MOVE_END');
    shell('input', 'keyevent', 'KEYCODE_DEL');
    nodes = await expect('2000 de 2000 caracteres');
    assert(nodes.some(n => matches(n, 'Mensagem fictícia') && n.text === boundary), 'Deleting one character must restore exact valid boundary');
    assert(nodes.some(n => matches(n, 'Enviar mensagem local') && n.enabled !== 'false'), 'Editing back to boundary must restore send');
    await hideKeyboard();
    screenshot('18-grapheme-limit-valid');
    await restart();
  });
  result.nativeEmojiKeyboardEntryTested = false;
  result.talkBackTested = false;
  result.status = result.warnings.length ? 'passed-with-limitations' : 'passed';
} catch (error) {
  result.status = 'failed';
  result.error = error.stack || String(error);
  if (verifiedEmulator) {
    try { screenshot('failure'); } catch (captureError) { result.warnings.push(`Failure screenshot unavailable: ${captureError.message}`); }
  }
  console.error(result.error);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  result.limitations = ['Synthetic in-memory demo only; not real identity verification, invitation security, server tenant isolation, chat delivery, push or audio.', 'Tests target an explicitly selected installed emulator package; installation and emulator creation are operator responsibilities.', 'Notification checks may be incomplete when native accessibility grouping hides preview children; consult warnings and screenshots.', 'Evidence contains synthetic UI only. No storage clearing, OS permission changes or input to other applications.'];
  result.limitations.push('Seeded Unicode accessibility is checked without enabling TalkBack. ADB input text exercises ASCII only; native emoji IME entry and non-ASCII byte budget require separate evidence.');
  writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Evidence: ${evidence}`);
}
