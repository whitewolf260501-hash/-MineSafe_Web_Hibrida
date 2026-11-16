import type { TelemetryHistoryPoint } from '../types';

export interface TelemetryIngestPayload {
  deviceId: string;
  organizationId?: string;
  CO?: number | string | null;
  co?: number | string | null;
  PM2_5?: number | string | null;
  pm25?: number | string | null;
  temperatura?: number | string | null;
  temp?: number | string | null;
  humedad?: number | string | null;
  hum?: number | string | null;
  originTimestamp?: number;
  last_update_server?: number;
}

export interface PersistedTelemetrySample extends TelemetryHistoryPoint {
  organizationId: string;
  originTimestamp: number;
  serverTimestamp: number;
  faultFields?: ('CO' | 'PM2_5' | 'temperatura' | 'humedad')[];
  isValid: boolean;
  source: 'collector_api' | 'cloud_function' | 'web_client';
}

export interface TelemetryCollectorConfig {
  minIntervalMs?: number;
  heartbeatIntervalMs?: number;
  retentionDays?: number;
}

export interface IngestDecision {
  accepted: boolean;
  reason: 'accepted' | 'deduplicated_rapid' | 'deduplicated_heartbeat' | 'invalid_device' | 'no_telemetry';
  sample?: PersistedTelemetrySample;
  rtdbPath?: string;
}

function parseBoundedMetric(
  primary: unknown,
  secondary: unknown,
  minVal: number,
  maxVal: number
): number | null {
  const raw = primary !== undefined ? primary : secondary;
  if (raw === null || raw === undefined || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < minVal || num > maxVal) return null;
  return num;
}

function normalizeOriginTimestamp(rawTs: unknown, fallbackNowMs: number): number {
  const n = typeof rawTs === 'number' ? rawTs : Number(rawTs);
  if (!Number.isFinite(n) || n <= 0) return fallbackNowMs;
  if (n >= 1000000000 && n < 100000000000) return n * 1000;
  if (n < 1000000000) return fallbackNowMs; // uptime millis() fallback
  return Math.floor(n);
}

/**
 * Colector desatendido 24/7 en memoria/servidor (reutilizable por Express y Cloud Functions).
 * Aplica validación de rango estricto, sellado dual (originTimestamp + serverTimestamp),
 * detección de canales en falla (`faultFields`) y deduplicación ante reconexiones.
 */
export class TelemetryCollector {
  private lastSampleByDevice = new Map<string, { ts: number; sig: string }>();
  private recentBuffer = new Map<string, PersistedTelemetrySample[]>();
  private readonly minIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly retentionDays: number;

  constructor(config: TelemetryCollectorConfig = {}) {
    this.minIntervalMs = Math.max(1000, config.minIntervalMs ?? 5000);
    this.heartbeatIntervalMs = Math.max(this.minIntervalMs, config.heartbeatIntervalMs ?? 30000);
    this.retentionDays = Math.max(1, config.retentionDays ?? 90);
  }

  public processIngest(
    payload: TelemetryIngestPayload,
    nowMs: number = Date.now(),
    source: PersistedTelemetrySample['source'] = 'collector_api'
  ): IngestDecision {
    const cleanDeviceId = (payload?.deviceId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!cleanDeviceId) {
      return { accepted: false, reason: 'invalid_device' };
    }

    const co = parseBoundedMetric(payload.CO, payload.co, 0, 4095);
    const pm25 = parseBoundedMetric(payload.PM2_5, payload.pm25, 0, 4095);
    const temperatura = parseBoundedMetric(payload.temperatura, payload.temp, -40, 100);
    const humedad = parseBoundedMetric(payload.humedad, payload.hum, 0, 100);

    if (co === null && pm25 === null && temperatura === null && humedad === null) {
      return { accepted: false, reason: 'no_telemetry' };
    }

    const faultFields: ('CO' | 'PM2_5' | 'temperatura' | 'humedad')[] = [];
    if (co === null) faultFields.push('CO');
    if (pm25 === null) faultFields.push('PM2_5');
    if (temperatura === null) faultFields.push('temperatura');
    if (humedad === null) faultFields.push('humedad');

    const sig = `${co ?? 'x'}|${pm25 ?? 'x'}|${temperatura ?? 'x'}|${humedad ?? 'x'}`;
    const prev = this.lastSampleByDevice.get(cleanDeviceId);
    if (prev) {
      const elapsed = nowMs - prev.ts;
      if (elapsed >= 0 && elapsed < this.minIntervalMs && prev.sig === sig) {
        return { accepted: false, reason: 'deduplicated_rapid' };
      }
      if (elapsed >= 0 && prev.sig === sig && elapsed < this.heartbeatIntervalMs) {
        return { accepted: false, reason: 'deduplicated_heartbeat' };
      }
    }

    const serverTimestamp = prev && nowMs <= prev.ts ? prev.ts + 1 : nowMs;
    const originTimestamp = normalizeOriginTimestamp(
      payload.originTimestamp ?? payload.last_update_server,
      serverTimestamp
    );

    const sample: PersistedTelemetrySample = {
      timestamp: serverTimestamp,
      originTimestamp,
      serverTimestamp,
      organizationId: (payload.organizationId || 'org-minesafe-principal').trim(),
      co,
      pm25,
      temperatura,
      humedad,
      ...(faultFields.length > 0 ? { faultFields } : {}),
      isValid: faultFields.length === 0,
      source,
    };

    this.lastSampleByDevice.set(cleanDeviceId, { ts: serverTimestamp, sig });
    const list = this.recentBuffer.get(cleanDeviceId) || [];
    list.push(sample);
    if (list.length > 500) {
      list.splice(0, list.length - 500);
    }
    this.recentBuffer.set(cleanDeviceId, list);

    return {
      accepted: true,
      reason: 'accepted',
      sample,
      rtdbPath: `historial_telemetria/${cleanDeviceId}/${serverTimestamp}`,
    };
  }

  public getStats() {
    let bufferedSamples = 0;
    for (const list of this.recentBuffer.values()) {
      bufferedSamples += list.length;
    }
    return {
      trackedDevices: this.lastSampleByDevice.size,
      bufferedSamples,
      retentionDays: this.retentionDays,
      minIntervalMs: this.minIntervalMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    };
  }

  public getDeviceBufferedSamples(deviceId: string): PersistedTelemetrySample[] {
    return [...(this.recentBuffer.get(deviceId) || [])];
  }
}

/**
 * Calcula qué muestras de `/historial_telemetria/{deviceId}` exceden la política de retención
 * para limpieza automática desde Cloud Functions o script de mantenimiento.
 */
export function buildTelemetryRetentionPruningMap(
  deviceHistoryMap: Record<string, any> | null | undefined,
  deviceId: string,
  retentionDays: number = 90,
  nowMs: number = Date.now()
): Record<string, null> {
  const cutoffMs = nowMs - Math.max(1, retentionDays) * 24 * 3600 * 1000;
  const removals: Record<string, null> = {};
  if (!deviceHistoryMap || typeof deviceHistoryMap !== 'object' || !deviceId) {
    return removals;
  }
  for (const [sampleKey, sampleVal] of Object.entries<any>(deviceHistoryMap)) {
    const ts =
      typeof sampleVal?.timestamp === 'number' && Number.isFinite(sampleVal.timestamp)
        ? sampleVal.timestamp
        : Number(sampleKey);
    if (Number.isFinite(ts) && ts > 0 && ts < cutoffMs) {
      removals[`historial_telemetria/${deviceId}/${sampleKey}`] = null;
    }
  }
  return removals;
}

export const defaultTelemetryCollector = new TelemetryCollector();
