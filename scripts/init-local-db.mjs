import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'worker');

console.log('--- Initializing Local D1 Databases with UTF-8 ---');

const runD1 = (dbName, file) => {
  console.log(`Executing ${file} on ${dbName}...`);
  execFileSync('npx', ['wrangler', 'd1', 'execute', dbName, '--local', `--file=${file}`, '--config', 'wrangler.local.toml'], {
    cwd: workerDir,
    shell: true,
    stdio: 'inherit',
  });
};

runD1('flareblog-db-local', 'schema.sql');
runD1('flareblog-db-local', 'mock_data.sql');

console.log('--- Done Initializing Databases ---');
