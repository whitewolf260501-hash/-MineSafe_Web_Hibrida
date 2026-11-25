import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTelemetryCollector } from './src/services/telemetryCollector.ts';
import {
  MINESAFE_SECURITY_HEADERS,
  createSlidingWindowRateLimiter,
  validateTelemetryIngestPayload,
  verifyConstantTimeToken,
} from './src/utils/securityCompliance.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const ingestRateLimiter = createSlidingWindowRateLimiter({
  maxRequests: Number(process.env.INGEST_RATE_LIMIT_MAX || 60),
  windowMs: Number(process.env.INGEST_RATE_LIMIT_WINDOW_MS || 60_000),
});

function extractIngestToken(req: Request): string {
  const authHeader = req.headers.authorization || '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const deviceHeader = req.headers['x-device-token'];
  if (typeof deviceHeader === 'string') {
    return deviceHeader.trim();
  }
  return '';
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  // HTTP Security Headers (OWASP ASVS / ISO 27001) — compatible con iframe preview
  app.use((req: Request, res: Response, next: NextFunction) => {
    Object.entries(MINESAFE_SECURITY_HEADERS).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
    const isHttps =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https' ||
      isProduction;
    if (isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (isProduction) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://*.firebaseio.com https://apis.google.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebasestorage.app https://firebasestorage.googleapis.com",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; ')
      );
    }
    next();
  });

  app.get('/api/telemetry/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      collector: defaultTelemetryCollector.getStats(),
      rtdbUrlConfigured: Boolean(process.env.FIREBASE_RTDB_URL || process.env.VITE_FIREBASE_RTDB_URL),
      ingestAuthEnabled: Boolean((process.env.INGEST_API_TOKEN || '').trim()),
    });
  });

  app.post('/api/telemetry/ingest', async (req: Request, res: Response) => {
    const expectedToken = (process.env.INGEST_API_TOKEN || '').trim();
    if (expectedToken) {
      const providedToken = extractIngestToken(req);
      if (!verifyConstantTimeToken(providedToken, expectedToken)) {
        res.status(401).json({ ok: false, reason: 'unauthorized_device_token' });
        return;
      }
    } else if (isProduction) {
      res.status(503).json({ ok: false, reason: 'ingest_token_not_configured' });
      return;
    }

    const validation = validateTelemetryIngestPayload(req.body);
    if (!validation.valid) {
      res.status(400).json({ ok: false, reason: validation.reason });
      return;
    }

    const clientIp =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip) || 'unknown';
    const rateKey = `${clientIp}:${validation.deviceId}`;
    const rateCheck = ingestRateLimiter.check(rateKey);
    res.setHeader('X-RateLimit-Limit', String(rateCheck.limit));
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(rateCheck.retryAfterMs / 1000)));
      res.status(429).json({ ok: false, reason: 'rate_limit_exceeded' });
      return;
    }

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
