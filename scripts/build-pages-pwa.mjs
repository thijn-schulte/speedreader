import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const root = new URL('../out/', import.meta.url).pathname;
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
if (base && !/^\/[A-Za-z0-9._-]+$/.test(base)) throw new Error('Invalid Pages base path');
async function assetsIn(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await assetsIn(path));
    else if (/\.(js|css)$/.test(item.name)) result.push(`${base}/${relative(root, path).split(sep).join('/')}`);
  }
  return result;
}
const assets = (await assetsIn(join(root, '_next', 'static'))).sort();
const hash = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 12);
const manifestPath = join(root, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.start_url = `${base}/`;
manifest.scope = `${base}/`;
manifest.icons = manifest.icons.map(icon => ({ ...icon, src: `${base}${icon.src}` }));
await writeFile(manifestPath, JSON.stringify(manifest));
const swPath = join(root, 'sw.js');
const sw = await readFile(swPath, 'utf8');
await writeFile(swPath, sw.replace('__BASE_PATH__', JSON.stringify(base)).replace('__BUILD_HASH__', hash).replace('const EXTRA=[];', `const EXTRA=${JSON.stringify(assets)};`));
console.log(`Pages offline cache prepared for ${assets.length} assets at ${base || '/'}.`);
