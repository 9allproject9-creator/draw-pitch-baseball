// 로컬 개발: 빌드 후 wrangler dev 실행.
// 프로젝트 경로가 길면 Windows에서 로컬 DB를 못 여므로 상태는 짧은 임시 폴더에 저장.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

await import('./build.mjs');
const persist = path.join(os.tmpdir(), 'gd-wrangler-state');
const port = process.env.PORT || '8787';
const child = spawn(`npx wrangler dev --port ${port} --ip localhost --persist-to "${persist}"`, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
