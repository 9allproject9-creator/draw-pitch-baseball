import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { attachRooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export async function createServer({ port = 3000, disconnectGraceMs = 60000, resultScale = 1 } = {}) {
  const app = express();
  app.get('/healthz', (_req, res) => res.type('text').send('ok'));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three'), { maxAge: '7d' }));
  app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: 0 }));
  app.use(express.static(path.join(root, 'public'), { maxAge: 0 }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: false }, pingInterval: 10000, pingTimeout: 8000 });
  const rooms = attachRooms(io, { disconnectGraceMs, resultScale });

  await new Promise((resolve) => httpServer.listen(port, resolve));
  return {
    httpServer, io, rooms,
    port: httpServer.address().port,
    close: () => new Promise((resolve) => { rooms.dispose(); io.close(); httpServer.close(() => resolve()); }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT) || 3000;
  createServer({ port }).then((s) => console.log(`그려던져! 서버 실행 중: http://localhost:${s.port}`));
}
