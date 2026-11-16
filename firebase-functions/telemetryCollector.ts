/**
 * Plantilla lista para desplegar en Firebase Cloud Functions (Gen 2 / Blaze)
 * Colector desatendido 24/7 para `/dispositivos/{deviceId}` -> `/historial_telemetria/{deviceId}/{timestamp}`
 *
 * Requisitos externos para activación en Firebase (`minefase-fc5f5`):
 *   1. Proyecto en plan Blaze (`firebase functions:list`).
 *   2. Instalar `firebase-functions` y `firebase-admin` en el paquete `functions/`.
 *   3. Desplegar con `firebase deploy --only functions`.
 */
import {
  defaultTelemetryCollector,
  buildTelemetryRetentionPruningMap,
} from '../src/services/telemetryCollector';

export interface CloudFunctionDeviceSnapshot {
  deviceId: string;
  afterData: Record<string, any> | null;
}

/**
 * Handler puro invocable desde `onValueWritten("/dispositivos/{deviceId}", ...)`
 * o pruebas unitarias locales sin requerir emulador JVM.
 */
export async function handleDeviceWriteTrigger(
  event: CloudFunctionDeviceSnapshot,
  persistSample: (rtdbPath: string, sample: Record<string, any>) => Promise<void>
): Promise<{ written: boolean; reason: string; rtdbPath?: string }> {
  if (!event.afterData || typeof event.afterData !== 'object') {
    return { written: false, reason: 'deleted_or_empty' };
  }

  const decision = defaultTelemetryCollector.processIngest(
    {
      deviceId: event.deviceId,
      organizationId: event.afterData.organizationId,
      CO: event.afterData.CO ?? event.afterData.co,
      PM2_5: event.afterData.PM2_5 ?? event.afterData.pm25,
      temperatura: event.afterData.temperatura ?? event.afterData.temp,
      humedad: event.afterData.humedad ?? event.afterData.hum,
      originTimestamp: event.afterData.last_update_server ?? event.afterData.timestamp_server,
    },
    Date.now(),
    'cloud_function'
  );

  if (!decision.accepted || !decision.sample || !decision.rtdbPath) {
    return { written: false, reason: decision.reason };
  }

  await persistSample(decision.rtdbPath, decision.sample);
  return { written: true, reason: 'accepted', rtdbPath: decision.rtdbPath };
}

/**
 * Ejecutor de retención programada (ej. Cloud Scheduler cada 24h, retención por defecto 90 días).
 */
export function planScheduledTelemetryPruning(
  allDeviceHistories: Record<string, Record<string, any>>,
  retentionDays: number = 90,
  nowMs: number = Date.now()
): Record<string, null> {
  const removals: Record<string, null> = {};
  for (const [deviceId, entries] of Object.entries(allDeviceHistories || {})) {
    Object.assign(
      removals,
      buildTelemetryRetentionPruningMap(entries, deviceId, retentionDays, nowMs)
    );
  }
  return removals;
}
