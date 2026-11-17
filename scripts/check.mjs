import { readFile, access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
if (JSON.stringify(manifest.permissions) !== '["storage"]') throw new Error('Review newly added permissions');
const resources = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const script of manifest.content_scripts) {
  if (script.matches.some(pattern => !/^https:\/\/(www\.)?xueqiu\.com\/\*$/.test(pattern))) throw new Error('Unexpected host match');
  resources.push(...script.js, ...script.css);
}
for (const resource of resources) await access(path.join(root, resource));
for (const directory of ['src', 'demo', 'scripts', 'tests']) {
  for (const filename of await readdir(path.join(root, directory))) {
    if (!/\.(mjs|js)$/.test(filename)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, directory, filename)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}
console.log('Manifest, permissions, referenced assets and JavaScript syntax are valid.');
