import { handleCompile } from '../src/mcp/handlers.js';
import { readdirSync, readFileSync } from 'fs';

const dir = './examples';
const files = readdirSync(dir).filter(f => f.endsWith('.edict.json')).sort();
let pass = 0;
let fail = 0;

for (const f of files) {
  const ast = JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8'));
  const result = await handleCompile(ast);
  console.log(result.ok ? '✓' : '✗', f);
  if (!result.ok) {
    console.error('  Errors:', JSON.stringify(result.errors));
    fail++;
  } else {
    pass++;
  }
}

console.log(`\n${pass}/${files.length} examples compile`);
if (fail > 0) process.exit(1);
