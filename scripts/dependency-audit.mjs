import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const forbidden = /@deepseek|cordis|dsh-|workspace:/i;
for (const [name, entry] of Object.entries(lock.packages)) {
  if (forbidden.test(name) || forbidden.test(JSON.stringify(entry.dependencies ?? {}))) throw new Error(`Forbidden dependency ${name}`);
}
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (forbidden.test(readFileSync(file, 'utf8'))) throw new Error(`Forbidden source import ${file}`);
  }
}
walk('src');
console.log(`PASS: ${Object.keys(lock.packages).length} lockfile entries and src contain no Harness/Cordis/workspace references`);
