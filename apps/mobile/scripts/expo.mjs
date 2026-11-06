import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No Expo account or telemetry. Prebuild may fetch the official native template.
const cli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const cwd = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd,
  env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: process.env.EXPO_OFFLINE ?? (process.argv[2] === 'prebuild' ? '0' : '1'), CI: '1' },
  stdio: 'inherit',
});
if (result.error) { console.error('Não foi possível iniciar a ferramenta Expo local.'); process.exit(1); }
process.exit(result.status ?? 1);
