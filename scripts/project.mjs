import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--write'].includes(args[0])) {
  throw new Error('Use --check ou --write.');
}
const board = JSON.parse(await readFile(path.join(root, 'project-board.json'), 'utf8'));
const statuses = new Set(['backlog', 'next', 'in_progress', 'blocked', 'done']);
if (board.schemaVersion !== 1 || !board.project || !/^\d{4}-\d{2}-\d{2}$/.test(board.updatedAt) || !Array.isArray(board.items) || !board.items.length) {
  throw new Error('Cabeçalho do board inválido.');
}
const ids = new Set();
for (const item of board.items) {
  if (!/^APP-\d{3}$/.test(item.id) || ids.has(item.id) || !item.title || !statuses.has(item.status) || !item.nextAction || !Array.isArray(item.acceptance) || !item.acceptance.length || item.acceptance.some(x => typeof x !== 'string' || !x) || !Array.isArray(item.evidence)) {
    throw new Error(`Item inválido ou duplicado: ${item.id}`);
  }
  ids.add(item.id);
  if (item.status === 'done' && !item.evidence.length) throw new Error(`${item.id}: falta evidência.`);
  for (const evidence of item.evidence) {
    if (typeof evidence !== 'string' || path.isAbsolute(evidence) || evidence.split(/[\\/]/).includes('..')) throw new Error(`${item.id}: caminho de evidência inválido.`);
    await access(path.join(root, evidence));
  }
}
if (!ids.has(board.currentFocus)) throw new Error('Foco não encontrado no board.');
const focus = board.items.find(item => item.id === board.currentFocus);
if (focus.status === 'done') throw new Error('Foco já concluído.');
const content = [
  '# Status do projeto', '',
  '> Gerado de project-board.json. Não editar manualmente.', '',
  `Atualizado em: ${board.updatedAt}`, '',
  board.implementationSummary ?? 'Estrutura inicial; sem aplicativo executável, backend implantado ou APK.', '',
  `Foco: **${focus.id} — ${focus.title}**`, '',
  `Próxima ação: ${focus.nextAction}`, '',
  ...board.items.flatMap(item => [
    `## ${item.id} — ${item.title}`, '',
    `Estado: ${item.status}`, '',
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
