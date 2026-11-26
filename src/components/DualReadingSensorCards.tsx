import React from 'react';
import { 
  Flame, 
  Wind, 
  Thermometer, 
  Droplets, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Activity,
  Gauge,
  Battery,
  Sun,
  CloudRain,
  TrendingUp,
  Minus,
  Volume2,
  HeartPulse
} from 'lucide-react';
import { SensorDevice, TelemetryVariable } from '../types';

interface DualReadingSensorCardsProps {
  device: SensorDevice;
  isSuperAdmin?: boolean;
  quickVariables?: TelemetryVariable[];
  showDiagnosticRow?: boolean;
  showQuickCore?: boolean;
  showBatteryAndAirflow?: boolean;
  showO2AndNoise?: boolean;
}

export const DualReadingSensorCards: React.FC<DualReadingSensorCardsProps> = ({
  device,
  isSuperAdmin = false,
  quickVariables = [],
  showDiagnosticRow = true,
  showQuickCore = true,
  showBatteryAndAirflow,
  showO2AndNoise,
}) => {
  const effectiveShowBatteryAirflow = showBatteryAndAirflow ?? isSuperAdmin;
  const effectiveShowO2Noise = showO2AndNoise ?? isSuperAdmin;
  const faultSet = new Set(device?.faultFields || []);
  const coFault = faultSet.has('CO');
  const pmFault = faultSet.has('PM2_5');
  const tempFault = faultSet.has('temperatura');
  const humFault = faultSet.has('humedad');

  const coVal = !coFault
    ? (typeof device?.rawCO === 'number' ? device.rawCO : device.metrics.co)
    : undefined;
  const pmVal = !pmFault
    ? (typeof device?.rawPM25 === 'number' ? device.rawPM25 : device.metrics.polvoPM)
    : undefined;
  const tempVal = !tempFault
    ? (typeof device?.rawTemp === 'number' ? device.rawTemp : device.metrics.temperatura)
    : undefined;
  const humVal = !humFault
    ? (typeof device?.rawHum === 'number' ? device.rawHum : device.metrics.humedad)
    : undefined;

  const isOnline = Boolean(device?.gatewayOnline);

  // 1. Monóxido de Carbono / Gases (MQ-2) Evaluation
  let coStatusColor: 'verde' | 'amarillo' | 'rojo' = 'verde';
  let coFriendlyLabel = 'Aire Limpio / Seguro';

  if (coFault || coVal === undefined || !Number.isFinite(coVal)) {
    coStatusColor = 'amarillo';
    coFriendlyLabel = 'Falla de Sensor / Sin Lectura Válida';
  } else if (!isOnline) {
    if (coVal === 4095) {
      coStatusColor = 'amarillo';
      coFriendlyLabel = 'Sensor No Conectado (Pin Flotante 4095 ADC)';
    } else {
      coStatusColor = 'amarillo';
      coFriendlyLabel = 'Gateway Desconectado (En Espera de Señal)';
    }
  } else if (coVal === 4095) {
    coStatusColor = 'amarillo';
    coFriendlyLabel = 'Pin al Aire / Sensor Desconectado (4095 ADC)';
  } else if (coVal >= 500) {
    coStatusColor = 'rojo';
    coFriendlyLabel = '¡PELIGRO: Nivel Crítico! (Baliza y Alarma activadas)';
  } else if (coVal >= 350) {
    coStatusColor = 'amarillo';
    coFriendlyLabel = 'Precaución: Presencia de gas';
  }

  // 2. Calidad de Aire / Polvo en suspensión (PM2.5) Evaluation
  let pmStatusColor: 'verde' | 'amarillo' | 'rojo' = 'verde';
  let pmFriendlyLabel = 'Baja densidad de partículas';

  if (pmFault || pmVal === undefined || !Number.isFinite(pmVal)) {
    pmStatusColor = 'amarillo';
    pmFriendlyLabel = 'Falla de Sensor / Sin Lectura Válida';
  } else if (!isOnline) {
    if (pmVal === 4095) {
      pmStatusColor = 'amarillo';
      pmFriendlyLabel = 'Sensor No Conectado (Pin Flotante 4095 ADC)';
    } else {
      pmStatusColor = 'amarillo';
      pmFriendlyLabel = 'Gateway Desconectado (Sin Transmisión)';
    }
  } else if (pmVal === 4095) {
    pmStatusColor = 'amarillo';
    pmFriendlyLabel = 'Pin al Aire / Sensor Desconectado (4095 ADC)';
  } else if (pmVal >= 150) {
    pmStatusColor = 'rojo';
    pmFriendlyLabel = '¡Atmósfera saturada / Peligro respiratorio!';
  } else if (pmVal >= 55) {
    pmStatusColor = 'amarillo';
    pmFriendlyLabel = 'Polvo moderado';
  }

  // 3. Confort Térmico (DHT11) Evaluation
  let thermalFriendlyLabel = 'Ambiente Agradable';
  let thermalStatusColor: 'verde' | 'amarillo' | 'rojo' = 'verde';

  if (tempFault || humFault || tempVal === undefined || humVal === undefined) {
    thermalFriendlyLabel = 'Falla Lectura DHT11 (null/NaN)';
    thermalStatusColor = 'amarillo';
  } else if (!isOnline) {
    thermalFriendlyLabel = 'Gateway Desconectado (Sin Transmisión)';
    thermalStatusColor = 'amarillo';
  } else if (tempVal === 0 && humVal === 0) {
    thermalFriendlyLabel = 'Sin Lectura DHT11 (En Espera)';
    thermalStatusColor = 'amarillo';
  } else if (tempVal > 30) {
    thermalFriendlyLabel = 'Calor Excesivo';
    thermalStatusColor = 'rojo';
  } else if (tempVal < 10 && tempVal > 0) {
    thermalFriendlyLabel = 'Ambiente Frío';
    thermalStatusColor = 'amarillo';
  } else if (humVal < 25 && humVal > 0) {
    thermalFriendlyLabel = 'Ambiente Muy Seco';
    thermalStatusColor = 'amarillo';
  } else if (humVal > 80) {
    thermalFriendlyLabel = 'Humedad Saturada';
    thermalStatusColor = 'amarillo';
  }

  const batteryDisplay = device.batteryReported
    ? `Batería: ${device.batteryPct}%`
    : 'Batería: Sin reporte';

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <span>Monitoreo Atmosférico: Lectura Rápida &amp; Datos Técnicos</span>
          </h3>
          <p className="text-xs text-slate-400">
            Interpretación directa y valores técnicos reales para operación en terreno y supervisión.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950 px-2.5 py-1 rounded-lg border border-cyan-800">
            {isSuperAdmin
              ? `Dispositivo: ${device.name} (${device.id})`
              : `${device.sectorName || 'Sector Principal'} · ${device.name}`}
          </span>
          {effectiveShowBatteryAirflow && (
            <span className="text-[11px] font-mono text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
              {batteryDisplay}
            </span>
          )}
        </div>
      </div>

      {showDiagnosticRow && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* ==============================================================
            CARD 1: MONÓXIDO DE CARBONO / GASES (MQ-2)
           ============================================================== */}
        <div className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
          coStatusColor === 'verde'
            ? 'bg-gradient-to-br from-emerald-950/40 to-slate-900 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
            : coStatusColor === 'amarillo'
            ? 'bg-gradient-to-br from-amber-950/40 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-950/20'
            : 'bg-gradient-to-br from-rose-950/70 to-slate-900 border-rose-500/80 shadow-xl shadow-rose-950/40 ring-1 ring-rose-50 animate-pulse'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                coStatusColor === 'verde' ? 'bg-emerald-900/60 text-emerald-300' :
                coStatusColor === 'amarillo' ? 'bg-amber-900/60 text-amber-300' :
                'bg-rose-900/80 text-rose-200'
              }`}>
                <Flame className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Monóxido / Gases (MQ-2)
              </span>
            </div>

            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
              coStatusColor === 'verde' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
              coStatusColor === 'amarillo' ? 'bg-amber-950 text-amber-300 border border-amber-700' :
              'bg-rose-950 text-rose-200 border border-rose-600 animate-bounce'
            }`}>
              {coStatusColor === 'verde' ? 'Verde' : coStatusColor === 'amarillo' ? 'Amarillo' : 'Rojo Crítico'}
            </span>
          </div>

          <div className="my-2">
            <div className={`text-lg sm:text-xl font-black tracking-tight leading-snug ${
              coStatusColor === 'verde' ? 'text-emerald-300' :
              coStatusColor === 'amarillo' ? 'text-amber-300' :
              'text-rose-200'
            }`}>
              {coFriendlyLabel}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="text-[11px]">Dato Técnico:</span>
            <div className="text-right">
              <span className="font-mono font-bold text-white text-sm">
                {coFault || coVal === undefined ? 'Sin lectura válida (null/NaN)' : `Valor ADC: ${coVal}`}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                {coFault || coVal === undefined
                  ? 'Revisar cableado/ADC de MQ-2'
                  : 'Señal bruta 12-bit (0–4095) sin curva ppm'}
              </span>
            </div>
          </div>
        </div>

        {/* ==============================================================
            CARD 2: CALIDAD DE AIRE / POLVO EN SUSPENSIÓN (PM2.5)
           ============================================================== */}
        <div className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
          pmStatusColor === 'verde'
            ? 'bg-gradient-to-br from-emerald-950/40 to-slate-900 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
            : pmStatusColor === 'amarillo'
            ? 'bg-gradient-to-br from-amber-950/40 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-950/20'
            : 'bg-gradient-to-br from-rose-950/70 to-slate-900 border-rose-500/80 shadow-xl shadow-rose-950/40 ring-1 ring-rose-500 animate-pulse'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                pmStatusColor === 'verde' ? 'bg-emerald-900/60 text-emerald-300' :
                pmStatusColor === 'amarillo' ? 'bg-amber-900/60 text-amber-300' :
                'bg-rose-900/80 text-rose-200'
              }`}>
                <Wind className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Polvo PM2.5 / Suspensión
              </span>
            </div>

            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
              pmStatusColor === 'verde' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
              pmStatusColor === 'amarillo' ? 'bg-amber-950 text-amber-300 border border-amber-700' :
              'bg-rose-950 text-rose-200 border border-rose-600 animate-bounce'
            }`}>
              {pmStatusColor === 'verde' ? 'Verde' : pmStatusColor === 'amarillo' ? 'Amarillo' : 'Rojo Crítico'}
            </span>
          </div>

          <div className="my-2">
            <div className={`text-lg sm:text-xl font-black tracking-tight leading-snug ${
              pmStatusColor === 'verde' ? 'text-emerald-300' :
              pmStatusColor === 'amarillo' ? 'text-amber-300' :
              'text-rose-200'
            }`}>
              {pmFriendlyLabel}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="text-[11px]">Dato Técnico:</span>
            <div className="text-right">
              <span className="font-mono font-bold text-white text-sm">
                {pmFault || pmVal === undefined ? 'Sin lectura válida (null/NaN)' : `Densidad PM2.5: ${pmVal} µg/m³`}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                {pmFault || pmVal === undefined
                  ? 'Revisar sensor óptico de polvo'
                  : 'Sharp GP2Y1010 · Precaución 55 · Crítico 150 µg/m³'}
              </span>
            </div>
          </div>
        </div>

        {/* ==============================================================
            CARD 3: CONFORT TÉRMICO (DHT11)
           ============================================================== */}
        <div className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
          thermalStatusColor === 'verde'
            ? 'bg-gradient-to-br from-emerald-950/40 to-slate-900 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
            : thermalStatusColor === 'amarillo'
            ? 'bg-gradient-to-br from-amber-950/40 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-950/20'
            : 'bg-gradient-to-br from-rose-950/70 to-slate-900 border-rose-500/80 shadow-xl shadow-rose-950/40 ring-1 ring-rose-500'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                thermalStatusColor === 'verde' ? 'bg-emerald-900/60 text-emerald-300' :
                thermalStatusColor === 'amarillo' ? 'bg-amber-900/60 text-amber-300' :
                'bg-rose-900/80 text-rose-200'
              }`}>
                <Thermometer className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Confort Térmico (DHT11)
              </span>
            </div>

            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
              thermalStatusColor === 'verde' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
              thermalStatusColor === 'amarillo' ? 'bg-amber-950 text-amber-300 border border-amber-700' :
              'bg-rose-950 text-rose-200 border border-rose-600'
            }`}>
              {thermalStatusColor === 'verde' ? 'Óptimo' : 'Revisión'}
            </span>
          </div>

          <div className="my-2">
            <div className={`text-lg sm:text-xl font-black tracking-tight leading-snug ${
              thermalStatusColor === 'verde' ? 'text-emerald-300' :
              thermalStatusColor === 'amarillo' ? 'text-amber-300' :
              'text-rose-200'
            }`}>
              {thermalFriendlyLabel}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="text-[11px]">Dato Técnico:</span>
            <div className="text-right">
              <span className="font-mono font-bold text-white text-sm">
                {!isOnline || tempFault ? '--' : tempVal} °C y {!isOnline || humFault ? '--' : humVal} % Humedad
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Sensor Digital DHT11
              </span>
            </div>
          </div>
        </div>

      </div>
      )}

      {/* ==============================================================
          FILA INFERIOR DE TARJETAS DE LECTURA RÁPIDA (Configurable por rol/usuario)
         ============================================================== */}
      {(showQuickCore || effectiveShowBatteryAirflow || effectiveShowO2Noise) && (() => {
        const findVar = (id: string) => quickVariables.find((v) => v.id === id);
        const tempVar = findVar('temp');
        const humVar = findVar('hum');
        const gasVar = findVar('co2');
        const pmVar = findVar('lux');
        const batVar = findVar('kwh');
        const airVar = findVar('air_flow');

        const hasAirFlowSensor =
          isOnline &&
          typeof device.metrics?.flujoAire === 'number' &&
          Number.isFinite(device.metrics.flujoAire) &&
          device.metrics.flujoAire > 0;

        const quickCards = [
          ...(showQuickCore
            ? [
                {
                  id: 'temp',
                  title: 'TEMPERATURA AMBIENTE',
                  value: !isOnline || tempFault ? '--' : (tempVar?.value ?? tempVal ?? '--'),
                  unit: '°C',
                  trendLabel: !isOnline ? 'Sin señal' : tempVar?.trend === 'alza critica' ? 'Alza Crítica' : 'Estable',
                  isAlertTrend: isOnline && tempVar?.trend === 'alza critica',
                  statusLabel: !isOnline ? 'Offline' : (tempVar?.statusLabel || 'Estable'),
                  statusTone: !isOnline ? 'desconectado' : (tempVar?.status || 'normal'),
                  icon: <Thermometer className="w-4 h-4 text-cyan-400" />,
                },
                {
                  id: 'hum',
                  title: 'HUMEDAD RELATIVA',
                  value: !isOnline || humFault ? '--' : (humVar?.value ?? humVal ?? '--'),
                  unit: '%',
                  trendLabel: !isOnline ? 'Sin señal' : 'Estable',
                  isAlertTrend: false,
                  statusLabel: !isOnline ? 'Offline' : (humVar?.statusLabel || 'Normal'),
                  statusTone: !isOnline ? 'desconectado' : (humVar?.status || 'normal'),
                  icon: <Droplets className="w-4 h-4 text-cyan-400" />,
                },
                {
                  id: 'co',
                  title: 'GASES / CO (MQ-2 ADC)',
                  value: !isOnline || coFault ? '--' : (coVal ?? gasVar?.value ?? '--'),
                  unit: 'ADC',
                  trendLabel: !isOnline ? 'Sin señal' : ((coVal ?? 0) >= 350 || gasVar?.trend === 'alza critica' ? 'Alza Crítica' : 'Estable'),
                  isAlertTrend: isOnline && ((coVal ?? 0) >= 350 || gasVar?.trend === 'alza critica'),
                  statusLabel: !isOnline ? 'Offline' : (gasVar?.statusLabel || (coStatusColor === 'verde' ? 'Seguro' : coStatusColor === 'amarillo' ? 'Preventivo' : 'Crítico')),
                  statusTone: !isOnline ? 'desconectado' : (gasVar?.status || (coStatusColor === 'rojo' ? 'critico' : coStatusColor === 'amarillo' ? 'advertencia' : 'normal')),
                  icon: <CloudRain className="w-4 h-4 text-cyan-400" />,
                },
                {
                  id: 'pm25',
                  title: 'MATERIAL PARTICULADO (PM2.5)',
                  value: !isOnline || pmFault ? '--' : (pmVal ?? pmVar?.value ?? '--'),
                  unit: 'µg/m³',
                  trendLabel: !isOnline ? 'Sin señal' : ((pmVal ?? 0) >= 55 || pmVar?.trend === 'alza critica' ? 'Alza Crítica' : 'Estable'),
                  isAlertTrend: isOnline && ((pmVal ?? 0) >= 55 || pmVar?.trend === 'alza critica'),
                  statusLabel: !isOnline ? 'Offline' : (pmVar?.statusLabel || (pmStatusColor === 'verde' ? 'Adecuado' : pmStatusColor === 'amarillo' ? 'Moderado' : 'Crítico')),
                  statusTone: !isOnline ? 'desconectado' : (pmVar?.status || (pmStatusColor === 'rojo' ? 'critico' : pmStatusColor === 'amarillo' ? 'advertencia' : 'normal')),
                  icon: <Sun className="w-4 h-4 text-cyan-400" />,
                },
              ]
            : []),
          ...(effectiveShowBatteryAirflow
            ? [
                {
                  id: 'bat',
                  title: 'BATERÍA DISPOSITIVO IoT',
                  value: isOnline && device.batteryReported ? (batVar?.value ?? device.batteryPct) : '--',
                  unit: isOnline && device.batteryReported ? '%' : '',
                  trendLabel: !isOnline ? 'Sin señal' : !device.batteryReported ? 'Sin sensor' : (device.batteryPct >= 30 ? 'Óptima' : 'Baja'),
                  isAlertTrend: isOnline && Boolean(device.batteryReported) && device.batteryPct < 30,
                  statusLabel: !isOnline ? 'Offline' : !device.batteryReported ? 'Sin reporte' : (batVar?.statusLabel || 'Eficiente'),
                  statusTone: !isOnline || !device.batteryReported ? 'desconectado' : (device.batteryPct < 25 ? 'advertencia' : 'normal'),
                  icon: <Battery className="w-4 h-4 text-cyan-400" />,
                },
                {
                  id: 'air',
                  title: 'FLUJO DE VENTILACIÓN',
                  value: hasAirFlowSensor ? (airVar?.value ?? device.metrics.flujoAire) : '--',
                  unit: hasAirFlowSensor ? 'm/s' : '',
                  trendLabel: !isOnline ? 'Sin señal' : hasAirFlowSensor ? 'Estable' : 'Sin sensor',
                  isAlertTrend: false,
                  statusLabel: !isOnline ? 'Offline' : hasAirFlowSensor ? (airVar?.statusLabel || 'Circulación OK') : 'Sin sensor flujo',
                  statusTone: hasAirFlowSensor ? (airVar?.status || 'normal') : 'desconectado',
                  icon: <Wind className="w-4 h-4 text-cyan-400" />,
                },
              ]
            : []),
        ];

        const o2Val = isOnline && typeof device.metrics?.o2 === 'number' && device.metrics.o2 > 0 ? device.metrics.o2 : null;
        const noiseVal = isOnline && typeof device.metrics?.ruido === 'number' && device.metrics.ruido > 0 ? device.metrics.ruido : null;

        return (
          <div className="space-y-3 pt-1">
            {quickCards.length > 0 && (
            <div
              className={`grid grid-cols-2 gap-3 ${
                quickCards.length >= 6
                  ? 'sm:grid-cols-3 xl:grid-cols-6'
                  : quickCards.length >= 4
                  ? 'lg:grid-cols-4'
                  : 'sm:grid-cols-2'
              }`}
            >
              {quickCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 transition-all p-4 flex flex-col justify-between shadow-md"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 leading-tight line-clamp-2">
                      {card.title}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-cyan-950/70 border border-cyan-800/60 flex items-center justify-center shrink-0">
                      {card.icon}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-white font-mono tabular-nums">
                        {card.value}
                      </span>
                      <span className="text-xs font-semibold text-cyan-300">{card.unit}</span>
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${
                        card.isAlertTrend ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {card.isAlertTrend ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      <span>{card.trendLabel}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Última act.: {device.lastPing || 'en vivo'}</span>
                    <span
                      className={`font-bold ${
                        card.statusTone === 'critico'
                          ? 'text-rose-400'
                          : card.statusTone === 'advertencia' || card.statusTone === 'preventivo'
                          ? 'text-amber-400'
                          : card.statusTone === 'desconectado'
                          ? 'text-slate-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {card.statusLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* Extra Environmental Strip: Oxígeno (O2) & Ruido Acústico (dB) */}
            {effectiveShowO2Noise && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-purple-950/20 border border-purple-800/40 px-4 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-slate-200">Oxígeno en Galería (O₂)</span>
                    <span className="text-[10px] font-mono text-purple-300 bg-purple-950/70 px-1.5 py-0.5 rounded border border-purple-800/50">
                      SuperAdmin
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span
                      className={`font-black text-sm ${
                        o2Val === null
                          ? 'text-slate-400'
                          : o2Val < 19.5
                          ? 'text-rose-400'
                          : 'text-emerald-300'
                      }`}
                    >
                      {o2Val === null ? 'N/D' : `${o2Val}%`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {o2Val === null ? '(Sin sensor instalado)' : '(DS 132 ≥ 19.5%)'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-purple-950/20 border border-purple-800/40 px-4 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-200">Nivel de Ruido Acústico</span>
                    <span className="text-[10px] font-mono text-purple-300 bg-purple-950/70 px-1.5 py-0.5 rounded border border-purple-800/50">
                      SuperAdmin
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span
                      className={`font-black text-sm ${
                        noiseVal === null
                          ? 'text-slate-400'
                          : noiseVal >= 85
                          ? 'text-rose-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {noiseVal === null ? 'N/D' : `${noiseVal} dB`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {noiseVal === null ? '(Sin sensor instalado)' : '(Límite 8h < 85 dB)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
