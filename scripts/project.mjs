import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evidenceResolver } from './project-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--write'].includes(args[0])) {
  throw new Error('Use --check ou --write.');
}
const board = JSON.parse(await readFile(path.join(root, 'project-board.json'), 'utf8'));
const resolveEvidence = await evidenceResolver(root, board);
const statuses = new Set(['backlog', 'next', 'ready', 'in_progress', 'blocked', 'monitoring', 'done']);
if (board.schemaVersion !== 1 || !board.project || !/^\d{4}-\d{2}-\d{2}$/.test(board.updatedAt) || !Array.isArray(board.items) || !board.items.length) {
  throw new Error('Cabeçalho do board inválido.');
}
const ids = new Set();
for (const item of board.items) {
  if (!/^APP-\d{3}$/.test(item.id) || ids.has(item.id) || !item.title || !statuses.has(item.status) || !item.nextAction || !Array.isArray(item.acceptance) || !item.acceptance.length || item.acceptance.some(x => typeof x !== 'string' || !x) || !Array.isArray(item.evidence)) {
    throw new Error(`Item inválido ou duplicado: ${item.id}`);
  }
  if (item.priority !== undefined && !/^P[0-3]$/.test(item.priority)) throw new Error(`${item.id}: prioridade invalida.`);
  if (item.owner !== undefined && (typeof item.owner !== 'string' || !item.owner.trim())) throw new Error(`${item.id}: responsavel invalido.`);
  for (const key of ['lastReviewedAt', 'nextReviewAt']) {
    if (item[key] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(item[key])) throw new Error(`${item.id}: data de revisao invalida.`);
  }
  if (item.deliveryTracks !== undefined) {
    if (!item.deliveryTracks || Object.keys(item.deliveryTracks).sort().join(',') !== 'android,common,git,web') throw new Error(`${item.id}: trilhas de entrega invalidas.`);
    for (const [name, track] of Object.entries(item.deliveryTracks)) {
      if (!statuses.has(track.status) || !track.nextAction || !Array.isArray(track.evidence)) throw new Error(`${item.id}/${name}: trilha invalida.`);
      for (const evidence of track.evidence) {
        if (typeof evidence !== 'string' || path.isAbsolute(evidence) || evidence.split(/[\\/]/).includes('..')) throw new Error(`${item.id}/${name}: evidencia invalida.`);
        await resolveEvidence(evidence);
      }
    }
  }
  ids.add(item.id);
  if (item.status === 'done' && !item.evidence.length) throw new Error(`${item.id}: falta evidência.`);
  for (const evidence of item.evidence) {
    if (typeof evidence !== 'string' || path.isAbsolute(evidence) || evidence.split(/[\\/]/).includes('..')) throw new Error(`${item.id}: caminho de evidência inválido.`);
    await resolveEvidence(evidence);
  }
}
for (const item of board.items) {
  if (item.dependencies !== undefined && (!Array.isArray(item.dependencies) || item.dependencies.some(id => !ids.has(id) || id === item.id))) throw new Error(`${item.id}: dependencia invalida.`);
}
const management = item => [
  ...(item.priority ? [`Prioridade: ${item.priority}`, ''] : []),
  ...(item.owner ? [`Responsavel: ${item.owner}`, ''] : []),
  ...(item.dependencies?.length ? [`Depende de: ${item.dependencies.join(', ')}`, ''] : []),
  ...(item.lastReviewedAt ? [`Revisado em: ${item.lastReviewedAt}`, ''] : []),
  ...(item.nextReviewAt ? [`Proxima revisao: ${item.nextReviewAt}`, ''] : []),
  ...Object.entries(item.deliveryTracks ?? {}).flatMap(([name, track]) => [`Trilha ${name}: ${track.status} - ${track.nextAction}`, '', `Evidencias da trilha: ${track.evidence.join(', ') || 'pendentes'}`, ''])
];
if (!ids.has(board.currentFocus)) throw new Error('Foco não encontrado no board.');
const focus = board.items.find(item => item.id === board.currentFocus);
if (focus.status === 'done') throw new Error('Foco já concluído.');
const content = [
  '# Status do projeto', '',
  '> Gerado de project-board.json. Não editar manualmente.', '',
  `Atualizado em: ${board.updatedAt}`, '',
  board.implementationSummary ?? 'Estrutura inicial; sem aplicativo executável, backend implantado ou APK.', '',
  `Foco: **${focus.id} — ${focus.title}**`, '',
  ...management(focus),
  `Próxima ação: ${focus.nextAction}`, '',
  ...board.items.flatMap(item => [
    `## ${item.id} — ${item.title}`, '',
    `Estado: ${item.status}`, '',
    ...management(item),
    ...item.acceptance.map(text => `- ${text}`), '',
    `Próxima ação: ${item.nextAction}`, '',
    `Evidências: ${item.evidence.length ? item.evidence.join(', ') : 'pendentes'}`, ''
  ])
].join('\n');
const target = path.join(root, 'docs/project/STATUS.md');
if (args[0] === '--write') {
  await writeFile(target, content, 'utf8');
  console.log('STATUS.md gerado; board e caminhos de evidência válidos.');
} else {
  if (await readFile(target, 'utf8') !== content) throw new Error('Status desatualizado. Execute npm run project:status.');
  console.log('Board e status consistentes. Esta verificação não testa o aplicativo.');
}
