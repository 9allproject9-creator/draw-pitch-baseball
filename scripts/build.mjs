// public/ + shared/ + three.js 를 dist/ 로 모아서 Cloudflare 정적 파일로 올림
import { rm, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true, filter: (src) => !src.includes(`${path.sep}_debug`) });
await cp(path.join(root, 'shared'), path.join(dist, 'shared'), { recursive: true });
const threeBuild = path.join(root, 'node_modules', 'three', 'build');
await mkdir(path.join(dist, 'vendor', 'three', 'build'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) {
  await cp(path.join(threeBuild, f), path.join(dist, 'vendor', 'three', 'build', f));
}
console.log('built → dist/');
