import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
// Existing regular files only. No writes, recursive access, or renderer-selected roots.
// Approved roots must not be writable by untrusted processes. See threat model for races.
export async function readApprovedFile(root: string, relative: string): Promise<Buffer> {
  if (/[\x00-\x1f:]/.test(relative) || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid relative path');
  const base = await realpath(root);
  let candidate = base;
  for (const segment of relative.split('/')) {
    candidate = path.join(candidate, segment);
    if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Symlink forbidden');
  }
  const canonical = await realpath(candidate);
  if (!canonical.startsWith(base + path.sep)) throw new Error('Outside root');
  const file = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Not a small regular file');
    return await file.readFile();
  } finally { await file.close(); }
}
