import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTelemetryCollector } from './src/services/telemetryCollector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/telemetry/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      collector: defaultTelemetryCollector.getStats(),
      rtdbUrlConfigured: Boolean(process.env.FIREBASE_RTDB_URL || process.env.VITE_FIREBASE_RTDB_URL),
    });
  });

  app.post('/api/telemetry/ingest', async (req: Request, res: Response) => {
    const decision = defaultTelemetryCollector.processIngest(req.body || {});
    if (!decision.accepted || !decision.sample || !decision.rtdbPath) {
      const code = decision.reason === 'invalid_device' || decision.reason === 'no_telemetry' ? 400 : 202;
      res.status(code).json({ ok: false, reason: decision.reason });
      return;
    }

    const rtdbBase = (
      process.env.FIREBASE_RTDB_URL ||
      process.env.VITE_FIREBASE_RTDB_URL ||
      ''
    ).replace(/\/+$/, '');
    const dbSecret = process.env.FIREBASE_DB_SECRET || '';
    let persistedToRtdb = false;

    if (rtdbBase && dbSecret) {
      const upstream = await fetch(
        `${rtdbBase}/${decision.rtdbPath}.json?auth=${encodeURIComponent(dbSecret)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(decision.sample),
        }
      ).catch(() => null);
      persistedToRtdb = Boolean(upstream?.ok);
    }

    res.status(201).json({
      ok: true,
      reason: decision.reason,
      rtdbPath: decision.rtdbPath,
      persistedToRtdb,
      sample: decision.sample,
    });
  });

  app.use((req, res, next) => {
    if (req.url && (req.url.endsWith('.apk') || req.url.includes('MineSafe_IoT_Mobile'))) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="MineSafe_IoT_Mobile_v2.4.apk"');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    next();
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MineSafe] Server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[MineSafe] Fatal server startup error:', err);
  process.exit(1);
});
