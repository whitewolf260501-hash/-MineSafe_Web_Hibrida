import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  Eye,
  Hand,
  Layers,
  LayoutGrid,
  MoveVertical,
  PackageOpen,
  RotateCcw,
  Router,
  Tag,
} from 'lucide-react';
import { SensorDevice } from '../types';

type GatewayPartId = 'enclosure' | 'esp32c3' | 'shield' | 'battery' | 'tft18';
type DragKey = 'enclosureBase' | 'lid' | 'battery' | 'shield' | 'esp32c3' | 'tft18';

interface GatewayComponentSpec {
  id: GatewayPartId;
  listTitle: string;
  listShort: string;
  badge: string;
  color: string;
  dotClass: string;
  dims: string;
  title: string;
  desc: string;
  specs: string[];
  camView: { theta: number; phi: number; radius: number; target: [number, number, number] };
  assembledCam: { theta: number; phi: number; radius: number; target: [number, number, number] };
}

const COMPONENT_SPECS: Record<GatewayPartId, GatewayComponentSpec> = {
  enclosure: {
    id: 'enclosure',
    listTitle: '1. Carcasa Impresa en 3D',
    listShort: 'Caja naranja industrial con tapa articulada y marco visor para LCD 1.8".',
    badge: 'CHASIS IMPRESO EN 3D',
    color: '#f97316',
    dotClass: 'bg-orange-500',
    dims: '66mm × 82mm × 28mm',
    title: 'Carcasa Impresa en 3D (PETG / PLA Naranja)',
    desc: 'Gabinete protector diseñado a medida para el nodo Gateway de MineSafe. Dispone de base con cuna para la celda LiPo 105568, pilares para tornillos M3 y tapa articulada con marco visor para la pantalla TFT de 1.8".',
    specs: [
      '• Material: Filamento Naranja de Alta Visibilidad Minera',
      '• Tapa: Abatible con bisel protector para pantalla 1.8"',
      '• Puertos: Calado frontal para conector USB-C del C3',
      '• Fijación: 4 postes internos con tornillería Allen M3',
    ],
    camView: { theta: 0.55, phi: 0.95, radius: 15.0, target: [-8.2, -0.5, -2.5] },
    assembledCam: { theta: 0.65, phi: 0.95, radius: 14.5, target: [0, 0, 0] },
  },
  esp32c3: {
    id: 'esp32c3',
    listTitle: '2. ESP32-C3 SuperMini',
    listShort: 'Microcontrolador RISC-V ultra compacto con USB-C, recepción ESP-NOW y salida Wi-Fi.',
    badge: 'NÚCLEO DE COMUNICACIONES',
    color: '#10b981',
    dotClass: 'bg-emerald-500',
    dims: '22.5mm × 18.0mm',
    title: 'ESP32-C3 SuperMini (Wi-Fi + BLE + ESP-NOW)',
    desc: 'Microcontrolador de arquitectura RISC-V single-core a 160 MHz. Recibe los paquetes de telemetría enviados por los nodos sensores vía protocolo ESP-NOW y los sincroniza con Firebase RTDB mediante Wi-Fi.',
    specs: [
      '• Procesador: RISC-V 32-bit @ 160 MHz (4MB Flash)',
      '• Radio: Wi-Fi 802.11b/g/n + ESP-NOW bidireccional',
      '• Interfaz: Puerto USB-C integrado + Antena cerámica SMD',
      '• Rol MineSafe: Puente Nodo Sensor ↔ Cloud y órdenes Web',
    ],
    camView: { theta: 0.15, phi: 0.85, radius: 10.5, target: [4.2, -0.5, 1.5] },
    assembledCam: { theta: 0.35, phi: 0.82, radius: 10.5, target: [0, 1.0, 0] },
  },
  shield: {
    id: 'shield',
    listTitle: '3. Placa de Expansión de Pines',
    listShort: 'Base de 37.4×22.5 mm con conector JST blanco de batería y regletas de colores.',
    badge: 'DISTRIBUCIÓN Y ENERGÍA',
    color: '#3b82f6',
    dotClass: 'bg-blue-500',
    dims: '37.4mm × 22.5mm',
    title: 'Placa de Expansión de Pines (Shield C3)',
    desc: 'Tarjeta base donde se inserta el ESP32-C3 SuperMini sobre dos regletas hembra verdes. Incorpora conector blanco JST para la batería LiPo, circuito de gestión de energía y filas de pines macho codificados por colores.',
    specs: [
      '• Dimensiones exactas: 37.4 mm × 22.5 mm',
      '• Conector Batería: Puerto JST blanco 2 pines (BAT+ / BAT-)',
      '• Regletas laterales: Amarillo (GPIO), Rojo (VCC), Negro (GND), Azul',
      '• Ventaja: Conexión limpia hacia la pantalla TFT sin soldaduras sueltas',
    ],
    camView: { theta: 0.0, phi: 0.85, radius: 11.0, target: [0.2, -0.5, 1.5] },
    assembledCam: { theta: -0.55, phi: 0.88, radius: 11.0, target: [0, 0.2, 0] },
  },
  battery: {
    id: 'battery',
    listTitle: '4. Batería LiPo 5000mAh (105568)',
    listShort: 'Polímero de litio recargable (3.7V / 4.2V, 10×55×68 mm) de alta autonomía.',
    badge: 'RESPALDO ENERGÉTICO',
    color: '#06b6d4',
    dotClass: 'bg-cyan-400',
    dims: '10mm × 55mm × 68mm',
    title: 'Batería de Polímero de Litio 5000mAh (Modelo 105568)',
    desc: 'Celda LiPo recargable de alta densidad energética que dota al Gateway de autonomía frente a cortes eléctricos en galerías subterráneas, manteniendo activo el enlace ESP-NOW y Wi-Fi.',
    specs: [
      '• Modelo: 105568 (Polímero de Litio Recargable)',
      '• Capacidad nominal: 5000 mAh | Tensión nominal: 3.7 V',
      '• Voltaje de carga: 4.2 V | Temp. operación: -20°C a 50°C',
      '• Dimensiones físicas: 10 mm × 55 mm × 68 mm',
    ],
    camView: { theta: -0.2, phi: 0.88, radius: 12.5, target: [-4.2, -0.5, 1.5] },
    assembledCam: { theta: 0.85, phi: 1.05, radius: 12.0, target: [0, -1.4, 0] },
  },
  tft18: {
    id: 'tft18',
    listTitle: '5. Pantalla TFT LCD 1.8"',
    listShort: 'Módulo SPI a color (128×160 px) para estado del enlace, paquetes y batería.',
    badge: 'VISUALIZACIÓN LOCAL',
    color: '#a855f7',
    dotClass: 'bg-purple-500',
    dims: '1.8 Pulgadas (128×160 px)',
    title: 'Pantalla LCD TFT a Todo Color de 1.8"',
    desc: 'Módulo gráfico SPI (controlador ST7735) con resolución de 128×160 píxeles. Muestra en terreno el estado del enlace ESP-NOW, los valores recibidos del nodo minero, la subida a Firebase y el nivel de la batería LiPo.',
    specs: [
      '• Tamaño y Resolución: 1.8" Diagonal • 128 × 160 píxeles RGB',
      '• Interfaz: Bus SPI (pines VCC, GND, SCL, SDA, RES, DC, CS)',
      '• Alimentación: 3.3V directos desde la placa de expansión',
      '• Función: Diagnóstico inmediato en terreno sin usar PC',
    ],
    camView: { theta: 0.25, phi: 0.85, radius: 11.5, target: [8.2, -0.5, 1.5] },
    assembledCam: { theta: 0.15, phi: 0.65, radius: 11.2, target: [0, 2.1, 0] },
  },
};

const COMPONENT_ORDER: GatewayPartId[] = [
  'enclosure',
  'esp32c3',
  'shield',
  'battery',
  'tft18',
];

const DEFAULT_SYSTEM_SPEC = {
  badge: 'RESUMEN DEL SISTEMA',
  dims: 'Escala Real 1:1',
  title: 'Pasarela MineSafe Gateway',
  desc: 'El Gateway concentra los paquetes enviados por los nodos sensores vía ESP-NOW en galerías subterráneas y los sube por Wi-Fi a Firebase RTDB, además de sincronizar las órdenes de control del SuperAdmin.',
  specs: [
    '• MCU: ESP32-C3 SuperMini (RISC-V 160MHz)',
    '• Energía: LiPo 105568 3.7V 5000mAh nominales',
    '• Expansión: Shield 37.4mm × 22.5mm con JST',
    '• Display: ST7735 TFT 1.8" (128×160 px SPI)',
  ],
};

interface Gateway3DInspectorViewProps {
  activeDevice?: SensorDevice;
  isFirebaseConnected?: boolean;
}

export type Gateway3DTelemetryMode = 'vivo' | 'falla_canal' | 'sin_telemetria';

export interface Gateway3DResolvedTelemetry {
  mode: Gateway3DTelemetryMode;
  badgeLabel: string;
  deviceId: string;
  co: number | null;
  pm25: number | null;
  temp: number | null;
  hum: number | null;
  batteryPct: number | null;
  gatewayOnline: boolean;
  firebaseOnline: boolean;
  faultChannels: string[];
}

export function resolveGatewayLiveTelemetry(
  device: SensorDevice | undefined,
  isFirebaseConnected: boolean
): Gateway3DResolvedTelemetry {
  const deviceId = (device?.code || device?.id || 'SIN_NODO').replace(/^device_/, '');
  const faultList = Array.isArray(device?.faultFields) ? device.faultFields : [];
  const faults = new Set(faultList);
  const hasLiveBaseline = Boolean(
    device &&
      (device.gatewayOnline ||
        device.status !== 'desconectado' ||
        (typeof device.lastUpdateServer === 'number' && device.lastUpdateServer > 0))
  );

  if (!device || !hasLiveBaseline) {
    return {
      mode: 'sin_telemetria',
      badgeLabel: 'SIN TELEMETRÍA EN VIVO',
      deviceId,
      co: null,
      pm25: null,
      temp: null,
      hum: null,
      batteryPct:
        device && typeof device.batteryPct === 'number' && Number.isFinite(device.batteryPct)
          ? Math.round(device.batteryPct)
          : null,
      gatewayOnline: Boolean(device?.gatewayOnline),
      firebaseOnline: Boolean(isFirebaseConnected),
      faultChannels: faultList,
    };
  }

  const readInt = (val: unknown): number | null =>
    typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : null;
  const readOneDec = (val: unknown): number | null =>
    typeof val === 'number' && Number.isFinite(val) ? Number(val.toFixed(1)) : null;

  const co = faults.has('CO') ? null : readInt(device.rawCO ?? device.metrics?.co);
  const pm25 = faults.has('PM2_5') ? null : readInt(device.rawPM25 ?? device.metrics?.polvoPM);
  const temp = faults.has('temperatura')
    ? null
    : readOneDec(device.rawTemp ?? device.metrics?.temperatura);
  const hum = faults.has('humedad')
    ? null
    : readInt(device.rawHum ?? device.metrics?.humedad);
  const batteryPct = readInt(device.batteryPct);

  const hasFault =
    faults.size > 0 || co === null || pm25 === null || temp === null || hum === null;

  return {
    mode: hasFault ? 'falla_canal' : 'vivo',
    badgeLabel: hasFault ? 'FALLA DE CANAL' : 'DATOS EN VIVO',
    deviceId,
    co,
    pm25,
    temp,
    hum,
    batteryPct,
    gatewayOnline: Boolean(device.gatewayOnline),
    firebaseOnline: Boolean(isFirebaseConnected),
    faultChannels: faultList,
  };
}

interface HoverTooltipState {
  visible: boolean;
  compId: GatewayPartId | null;
  x: number;
  y: number;
}

interface DragHudState {
  visible: boolean;
  name: string;
  coords: string;
  x: number;
  y: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export const Gateway3DInspectorView: React.FC<Gateway3DInspectorViewProps> = ({
  activeDevice,
  isFirebaseConnected = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelElsRef = useRef<Partial<Record<GatewayPartId, HTMLButtonElement | null>>>({});

  const [isShowcaseExtracted, setIsShowcaseExtracted] = useState(false);
  const [dragModeVertical, setDragModeVertical] = useState(false);
  const [isBoxOpen, setIsBoxOpen] = useState(false);
  const [isExploded, setIsExploded] = useState(false);
  const [isTransparent, setIsTransparent] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [activeComponentId, setActiveComponentId] = useState<GatewayPartId | null>(null);
  const [hoveredComponentId, setHoveredComponentId] = useState<GatewayPartId | null>(null);
  const [tooltip, setTooltip] = useState<HoverTooltipState>({
    visible: false,
    compId: null,
    x: 0,
    y: 0,
  });
  const [dragHud, setDragHud] = useState<DragHudState>({
    visible: false,
    name: '',
    coords: 'Δ(0.0, 0.0, 0.0)',
    x: 0,
    y: 0,
  });

  const sceneStateRef = useRef({
    isShowcaseExtracted: false,
    dragModeVertical: false,
    isBoxOpen: false,
    isExploded: false,
    isTransparent: false,
    showLabels: true,
    activeComponentId: null as GatewayPartId | null,
    hoveredComponentId: null as GatewayPartId | null,
  });

  sceneStateRef.current.isShowcaseExtracted = isShowcaseExtracted;
  sceneStateRef.current.dragModeVertical = dragModeVertical;
  sceneStateRef.current.isBoxOpen = isBoxOpen;
  sceneStateRef.current.isExploded = isExploded;
  sceneStateRef.current.isTransparent = isTransparent;
  sceneStateRef.current.showLabels = showLabels;
  sceneStateRef.current.activeComponentId = activeComponentId;

  const liveTelemetry = resolveGatewayLiveTelemetry(activeDevice, isFirebaseConnected);
  const liveNodeRef = useRef<Gateway3DResolvedTelemetry>(liveTelemetry);
  liveNodeRef.current = liveTelemetry;

  const sceneActionsRef = useRef<{
    selectComponent: (id: GatewayPartId, autoMoveCamera?: boolean) => void;
    toggleShowcase: () => void;
    toggleExplode: () => void;
    resetAll: () => void;
    refreshTftScreen: () => void;
  } | null>(null);

  useEffect(() => {
    sceneActionsRef.current?.refreshTftScreen();
  }, [
    activeDevice?.id,
    activeDevice?.rawCO,
    activeDevice?.rawPM25,
    activeDevice?.rawTemp,
    activeDevice?.rawHum,
    activeDevice?.batteryPct,
    activeDevice?.gatewayOnline,
    isFirebaseConnected,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const disposables: Array<{ dispose: () => void }> = [];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f19);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    disposables.push(envTarget);
    pmremGenerator.dispose();

    // Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.65);
    hemiLight.position.set(0, 25, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.35);
    dirLight.position.set(14, 24, 18);
    dirLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    scene.add(dirLight);

    const rimLight1 = new THREE.PointLight(0xf97316, 1.4, 30);
    rimLight1.position.set(-12, 8, -10);
    scene.add(rimLight1);

    const rimLight2 = new THREE.PointLight(0x38bdf8, 1.2, 30);
    rimLight2.position.set(12, 6, 12);
    scene.add(rimLight2);

    // Piso técnico con grilla visible
    const gridHelper = new THREE.GridHelper(36, 36, 0xf97316, 0x1e293b);
    gridHelper.position.y = -3.2;
    scene.add(gridHelper);
    disposables.push(gridHelper.geometry);
    if (Array.isArray(gridHelper.material)) {
      gridHelper.material.forEach((m) => disposables.push(m));
    } else {
      disposables.push(gridHelper.material);
    }

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

    // Canvas textures (100% procedural)
    const tftCanvas = document.createElement('canvas');
    tftCanvas.width = 256;
    tftCanvas.height = 320;
    const tftCtx = tftCanvas.getContext('2d');
    const tftScreenTex = new THREE.CanvasTexture(tftCanvas);
    tftScreenTex.colorSpace = THREE.SRGBColorSpace;
    tftScreenTex.anisotropy = maxAnisotropy;
    disposables.push(tftScreenTex);

    const drawTFTDashboard = () => {
      if (!tftCtx) return;
      const snap = liveNodeRef.current;

      tftCtx.fillStyle = '#040914';
      tftCtx.fillRect(0, 0, 256, 320);

      tftCtx.fillStyle = '#ea580c';
      tftCtx.fillRect(0, 0, 256, 40);
      tftCtx.fillStyle = '#ffffff';
      tftCtx.font = 'bold 18px monospace';
      tftCtx.fillText('MINESAFE GATEWAY', 16, 26);

      tftCtx.fillStyle = '#0f172a';
      tftCtx.strokeStyle = snap.gatewayOnline ? '#10b981' : '#f59e0b';
      tftCtx.lineWidth = 2;
      tftCtx.fillRect(14, 52, 228, 58);
      tftCtx.strokeRect(14, 52, 228, 58);

      tftCtx.fillStyle = snap.gatewayOnline ? '#10b981' : '#fbbf24';
      tftCtx.font = 'bold 15px monospace';
      tftCtx.fillText(snap.gatewayOnline ? '● ESP-NOW: ACTIVO' : '○ ESP-NOW: ESPERA', 26, 76);
      tftCtx.fillStyle = '#cbd5e1';
      tftCtx.font = '13px monospace';
      tftCtx.fillText(`Nodo: ${snap.deviceId.slice(0, 14)}`, 26, 98);

      tftCtx.fillStyle = '#0f172a';
      tftCtx.strokeStyle = '#0284c7';
      tftCtx.fillRect(14, 122, 228, 92);
      tftCtx.strokeRect(14, 122, 228, 92);

      tftCtx.fillStyle = snap.mode === 'vivo' ? '#38bdf8' : '#fbbf24';
      tftCtx.font = 'bold 13px monospace';
      tftCtx.fillText(snap.badgeLabel.slice(0, 22), 24, 144);
      tftCtx.fillStyle = '#f8fafc';
      tftCtx.font = '14px monospace';
      const coText = snap.co !== null ? String(snap.co) : '--';
      const pmText = snap.pm25 !== null ? String(snap.pm25) : '--';
      const tempText = snap.temp !== null ? `${snap.temp.toFixed(1)}C` : '--';
      const humText = snap.hum !== null ? `${snap.hum}%` : '--';
      tftCtx.fillText(`CO: ${coText} | PM: ${pmText}`, 24, 168);
      tftCtx.fillText(`T: ${tempText} | H: ${humText}`, 24, 190);
      tftCtx.fillStyle = snap.firebaseOnline ? '#4ade80' : '#fbbf24';
      tftCtx.fillText(snap.firebaseOnline ? 'Firebase RTDB: OK' : 'Firebase RTDB: SYNC', 24, 208);

      tftCtx.fillStyle = '#0f172a';
      tftCtx.strokeStyle = '#f59e0b';
      tftCtx.fillRect(14, 226, 228, 76);
      tftCtx.strokeRect(14, 226, 228, 76);

      tftCtx.fillStyle = '#fbbf24';
      tftCtx.font = 'bold 14px monospace';
      tftCtx.fillText('BATERIA LIPO 105568', 24, 248);
      tftCtx.fillStyle = '#ffffff';
      tftCtx.font = '14px monospace';
      tftCtx.fillText(
        `Cap: 5000mAh (${snap.batteryPct !== null ? `${snap.batteryPct}%` : '--'})`,
        24,
        270
      );
      tftCtx.fillStyle = '#34d399';
      tftCtx.fillText('Nominal: 3.7V / 4.2V', 24, 292);

      tftScreenTex.needsUpdate = true;
    };
    drawTFTDashboard();

    const createBatteryLabelTexture = () => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 512, 256);

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 8;
        ctx.strokeRect(12, 12, 488, 232);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('Li-Polymer Battery', 36, 65);

        ctx.fillStyle = '#ea580c';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('MODELO: 105568', 36, 110);

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 26px monospace';
        ctx.fillText('Capacidad: 5000mAh', 36, 152);
        ctx.fillText('Nominal: 3.7V | Carga: 4.2V', 36, 190);
        ctx.fillStyle = '#334155';
        ctx.font = '22px monospace';
        ctx.fillText('Dim: 10mm × 55mm × 68mm | -20°~50°C', 36, 226);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      disposables.push(tex);
      return tex;
    };

    const createShieldSilkscreenTexture = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 384;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, 256, 384);

        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, 244, 372);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('ESP32-C3 SHIELD', 48, 340);
        ctx.font = '15px monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('37.4mm x 22.5mm', 58, 362);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('BAT+  BAT-', 88, 105);
        ctx.fillText('GND VCC1 VCC2 3V3 5V', 44, 310);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      disposables.push(tex);
      return tex;
    };

    const gatewayRoot = new THREE.Group();
    scene.add(gatewayRoot);

    const caseOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.38,
      metalness: 0.1,
    });
    const caseDarkTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc2410c,
      roughness: 0.45,
      metalness: 0.15,
    });
    const caseTransparentMat = new THREE.MeshPhysicalMaterial({
      color: 0xf97316,
      roughness: 0.2,
      metalness: 0.05,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
    });
    const darkPcbMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.2 });
    const redPcbMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4, metalness: 0.2 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.88 });
    const goldPinMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.85 });
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 });

    disposables.push(
      caseOrangeMat,
      caseDarkTrimMat,
      caseTransparentMat,
      darkPcbMat,
      redPcbMat,
      metalMat,
      goldPinMat,
      screwMat
    );

    const trackMesh = (mesh: THREE.Mesh) => {
      disposables.push(mesh.geometry);
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => disposables.push(m));
      } else {
        disposables.push(mesh.material);
      }
    };

    // 1. Carcasa impresa en 3D
    const enclosureBaseGroup = new THREE.Group();
    enclosureBaseGroup.userData = { componentId: 'enclosure' as GatewayPartId };
    gatewayRoot.add(enclosureBaseGroup);

    const caseMeshes: THREE.Mesh[] = [];
    const addCasePart = (
      geo: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      parentGroup: THREE.Group,
      mat: THREE.Material = caseOrangeMat
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = !isSoftwareGl;
      m.receiveShadow = !isSoftwareGl;
      m.userData = { componentId: 'enclosure' as GatewayPartId };
      parentGroup.add(m);
      caseMeshes.push(m);
      disposables.push(geo);
      return m;
    };

    addCasePart(new THREE.BoxGeometry(6.6, 0.25, 8.2), 0, -1.25, 0, enclosureBaseGroup);
    addCasePart(new THREE.BoxGeometry(0.28, 2.2, 8.2), -3.16, -0.25, 0, enclosureBaseGroup);
    addCasePart(new THREE.BoxGeometry(0.28, 2.2, 8.2), 3.16, -0.25, 0, enclosureBaseGroup);
    addCasePart(new THREE.BoxGeometry(6.04, 2.2, 0.28), 0, -0.25, -3.96, enclosureBaseGroup);
    addCasePart(new THREE.BoxGeometry(6.04, 2.2, 0.28), 0, -0.25, 3.96, enclosureBaseGroup);

    [
      [-2.85, -0.25, -3.65],
      [2.85, -0.25, -3.65],
      [-2.85, -0.25, 3.65],
      [2.85, -0.25, 3.65],
    ].forEach(([cx, cy, cz]) => {
      addCasePart(
        new THREE.CylinderGeometry(0.28, 0.28, 2.15, 16),
        cx,
        cy,
        cz,
        enclosureBaseGroup,
        caseDarkTrimMat
      );
    });

    const lidPivotGroup = new THREE.Group();
    lidPivotGroup.position.set(-3.3, 0.85, 0);
    lidPivotGroup.userData = { componentId: 'enclosure' as GatewayPartId };
    gatewayRoot.add(lidPivotGroup);

    addCasePart(new THREE.BoxGeometry(1.4, 0.26, 8.2), 0.7, 0, 0, lidPivotGroup);
    addCasePart(new THREE.BoxGeometry(1.4, 0.26, 8.2), 5.9, 0, 0, lidPivotGroup);
    addCasePart(new THREE.BoxGeometry(3.8, 0.26, 1.8), 3.3, 0, -3.2, lidPivotGroup);
    addCasePart(new THREE.BoxGeometry(3.8, 0.26, 1.8), 3.3, 0, 3.2, lidPivotGroup);

    addCasePart(new THREE.BoxGeometry(4.0, 0.12, 0.2), 3.3, 0.16, -2.2, lidPivotGroup, caseDarkTrimMat);
    addCasePart(new THREE.BoxGeometry(4.0, 0.12, 0.2), 3.3, 0.16, 2.2, lidPivotGroup, caseDarkTrimMat);
    addCasePart(new THREE.BoxGeometry(0.2, 0.12, 4.6), 1.4, 0.16, 0.0, lidPivotGroup, caseDarkTrimMat);
    addCasePart(new THREE.BoxGeometry(0.2, 0.12, 4.6), 5.2, 0.16, 0.0, lidPivotGroup, caseDarkTrimMat);

    const screwGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 16);
    disposables.push(screwGeo);
    [
      [0.45, 0.18, -3.65],
      [6.15, 0.18, -3.65],
      [0.45, 0.18, 3.65],
      [6.15, 0.18, 3.65],
    ].forEach(([sx, sy, sz]) => {
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(sx, sy, sz);
      screw.userData = { componentId: 'enclosure' as GatewayPartId };
      lidPivotGroup.add(screw);
    });

    // 4. Batería LiPo 5000mAh (105568)
    const batteryGroup = new THREE.Group();
    batteryGroup.position.set(0, -0.62, 0);
    batteryGroup.userData = { componentId: 'battery' as GatewayPartId };
    gatewayRoot.add(batteryGroup);

    const batLabelTex = createBatteryLabelTexture();
    const batSideMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 });
    const batBottomMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 });
    const batTopMat = new THREE.MeshStandardMaterial({ map: batLabelTex, roughness: 0.35, metalness: 0.2 });
    const batMaterials = [batSideMat, batSideMat, batTopMat, batBottomMat, batSideMat, batSideMat];
    disposables.push(batSideMat, batBottomMat, batTopMat);

    const batBody = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.95, 6.6), batMaterials);
    batBody.castShadow = !isSoftwareGl;
    batBody.receiveShadow = !isSoftwareGl;
    batBody.userData = { componentId: 'battery' as GatewayPartId };
    batteryGroup.add(batBody);
    disposables.push(batBody.geometry);

    const kaptonMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
    });
    const kaptonMesh = new THREE.Mesh(new THREE.BoxGeometry(5.34, 0.98, 0.8), kaptonMat);
    kaptonMesh.position.set(0, 0, -2.9);
    kaptonMesh.userData = { componentId: 'battery' as GatewayPartId };
    batteryGroup.add(kaptonMesh);
    trackMesh(kaptonMesh);

    const wireRedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0.3, -3.2),
      new THREE.Vector3(-0.4, 0.7, -3.4),
      new THREE.Vector3(-0.2, 0.95, -2.0),
    ]);
    const wireRed = new THREE.Mesh(
      new THREE.TubeGeometry(wireRedCurve, 20, 0.06, 8, false),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 })
    );
    wireRed.userData = { componentId: 'battery' as GatewayPartId };
    batteryGroup.add(wireRed);
    trackMesh(wireRed);

    const wireBlkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, 0.3, -3.2),
      new THREE.Vector3(0.4, 0.7, -3.4),
      new THREE.Vector3(0.2, 0.95, -2.0),
    ]);
    const wireBlk = new THREE.Mesh(
      new THREE.TubeGeometry(wireBlkCurve, 20, 0.06, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
    );
    wireBlk.userData = { componentId: 'battery' as GatewayPartId };
    batteryGroup.add(wireBlk);
    trackMesh(wireBlk);

    // 3. Placa de expansión de pines (Shield C3)
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(0, 0.12, -0.3);
    shieldGroup.userData = { componentId: 'shield' as GatewayPartId };
    gatewayRoot.add(shieldGroup);

    const shieldTex = createShieldSilkscreenTexture();
    const shieldPcb = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.16, 3.8),
      new THREE.MeshStandardMaterial({ map: shieldTex, roughness: 0.45 })
    );
    shieldPcb.castShadow = !isSoftwareGl;
    shieldPcb.userData = { componentId: 'shield' as GatewayPartId };
    shieldGroup.add(shieldPcb);
    trackMesh(shieldPcb);

    const jstMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const jstBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.38, 0.65), jstMat);
    jstBody.position.set(0, 0.25, -1.35);
    jstBody.userData = { componentId: 'shield' as GatewayPartId };
    shieldGroup.add(jstBody);
    trackMesh(jstBody);

    const greenHeaderMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.35 });
    const greenHeaderGeo = new THREE.BoxGeometry(0.24, 0.42, 2.3);
    disposables.push(greenHeaderMat, greenHeaderGeo);
    [-0.62, 0.62].forEach((hx) => {
      const greenBlock = new THREE.Mesh(greenHeaderGeo, greenHeaderMat);
      greenBlock.position.set(hx, 0.28, -0.1);
      greenBlock.userData = { componentId: 'shield' as GatewayPartId };
      shieldGroup.add(greenBlock);
    });

    const colorRowMats = {
      yellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 }),
      red: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }),
      black: new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.4 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3 }),
    };
    const stripGeoLong = new THREE.BoxGeometry(0.16, 0.14, 2.2);
    const stripGeoMed = new THREE.BoxGeometry(0.16, 0.14, 1.5);
    const stripGeoShort = new THREE.BoxGeometry(0.16, 0.14, 0.65);
    const pinGeo = new THREE.BoxGeometry(0.04, 0.32, 0.04);
    disposables.push(
      colorRowMats.yellow,
      colorRowMats.red,
      colorRowMats.black,
      colorRowMats.blue,
      stripGeoLong,
      stripGeoMed,
      stripGeoShort,
      pinGeo
    );

    [
      { x: -1.16, mat: colorRowMats.yellow },
      { x: -0.98, mat: colorRowMats.red },
      { x: -0.8, mat: colorRowMats.black },
    ].forEach((col) => {
      const baseStrip = new THREE.Mesh(stripGeoLong, col.mat);
      baseStrip.position.set(col.x, 0.15, -0.1);
      baseStrip.userData = { componentId: 'shield' as GatewayPartId };
      shieldGroup.add(baseStrip);

      for (let i = 0; i < 8; i++) {
        const pin = new THREE.Mesh(pinGeo, goldPinMat);
        pin.position.set(col.x, 0.32, -1.05 + i * 0.27);
        pin.userData = { componentId: 'shield' as GatewayPartId };
        shieldGroup.add(pin);
      }
    });

    [
      { x: 0.8, mat: colorRowMats.black },
      { x: 0.98, mat: colorRowMats.red },
      { x: 1.16, mat: colorRowMats.yellow },
    ].forEach((col) => {
      const baseStrip = new THREE.Mesh(stripGeoMed, col.mat);
      baseStrip.position.set(col.x, 0.15, 0.25);
      baseStrip.userData = { componentId: 'shield' as GatewayPartId };
      shieldGroup.add(baseStrip);

      const blueStrip = new THREE.Mesh(stripGeoShort, colorRowMats.blue);
      blueStrip.position.set(col.x, 0.15, -0.85);
      blueStrip.userData = { componentId: 'shield' as GatewayPartId };
      shieldGroup.add(blueStrip);

      for (let i = 0; i < 8; i++) {
        const pin = new THREE.Mesh(pinGeo, goldPinMat);
        pin.position.set(col.x, 0.32, -1.05 + i * 0.27);
        pin.userData = { componentId: 'shield' as GatewayPartId };
        shieldGroup.add(pin);
      }
    });

    // 2. ESP32-C3 SuperMini
    const espGroup = new THREE.Group();
    espGroup.position.set(0, 0.58, -0.4);
    espGroup.userData = { componentId: 'esp32c3' as GatewayPartId };
    gatewayRoot.add(espGroup);

    const espPcb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 2.35), darkPcbMat);
    espPcb.castShadow = !isSoftwareGl;
    espPcb.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(espPcb);
    disposables.push(espPcb.geometry);

    const socMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.1, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.25 })
    );
    socMesh.position.set(0, 0.11, 0.05);
    socMesh.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(socMesh);
    trackMesh(socMesh);

    const usbcMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.26, 0.6), metalMat);
    usbcMesh.position.set(0, 0.16, 0.98);
    usbcMesh.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(usbcMesh);
    disposables.push(usbcMesh.geometry);

    const btnGeo = new THREE.BoxGeometry(0.22, 0.1, 0.16);
    disposables.push(btnGeo);
    const btnBoot = new THREE.Mesh(btnGeo, metalMat);
    btnBoot.position.set(-0.5, 0.11, 0.55);
    btnBoot.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(btnBoot);

    const btnRst = new THREE.Mesh(btnGeo, metalMat);
    btnRst.position.set(0.5, 0.11, 0.55);
    btnRst.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(btnRst);

    const antMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.12, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    antMesh.position.set(0, 0.12, -0.92);
    antMesh.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(antMesh);
    trackMesh(antMesh);

    const ledMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    ledMesh.position.set(0.35, 0.12, -0.45);
    ledMesh.userData = { componentId: 'esp32c3' as GatewayPartId };
    espGroup.add(ledMesh);
    trackMesh(ledMesh);

    // 5. Pantalla LCD TFT 1.8"
    const tftGroup = new THREE.Group();
    tftGroup.position.set(0, 0.92, 0.1);
    tftGroup.userData = { componentId: 'tft18' as GatewayPartId };
    gatewayRoot.add(tftGroup);

    const tftPcb = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 4.6), redPcbMat);
    tftPcb.castShadow = !isSoftwareGl;
    tftPcb.userData = { componentId: 'tft18' as GatewayPartId };
    tftGroup.add(tftPcb);
    disposables.push(tftPcb.geometry);

    const tftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.1, 4.0),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.2 })
    );
    tftFrame.position.set(0, 0.1, 0);
    tftFrame.userData = { componentId: 'tft18' as GatewayPartId };
    tftGroup.add(tftFrame);
    trackMesh(tftFrame);

    const tftScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 3.65),
      new THREE.MeshBasicMaterial({ map: tftScreenTex })
    );
    tftScreen.rotation.x = -Math.PI / 2;
    tftScreen.position.set(0, 0.16, 0);
    tftScreen.userData = { componentId: 'tft18' as GatewayPartId };
    tftGroup.add(tftScreen);
    trackMesh(tftScreen);

    const spiPinGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
    disposables.push(spiPinGeo);
    for (let i = 0; i < 8; i++) {
      const spiPin = new THREE.Mesh(spiPinGeo, goldPinMat);
      spiPin.position.set(-1.05 + i * 0.3, -0.12, 2.1);
      spiPin.userData = { componentId: 'tft18' as GatewayPartId };
      tftGroup.add(spiPin);
    }

    // Pedestales luminosos de exhibición
    const showcasePadsGroup = new THREE.Group();
    scene.add(showcasePadsGroup);

    const showcaseLayout = [
      { x: -8.5, z: -2.0, w: 7.4, d: 9.0, color: 0xf97316 },
      { x: -3.2, z: 1.2, w: 6.0, d: 7.4, color: 0x06b6d4 },
      { x: 1.8, z: 1.2, w: 3.6, d: 4.8, color: 0x3b82f6 },
      { x: 5.4, z: 1.2, w: 2.6, d: 3.6, color: 0x10b981 },
      { x: 9.2, z: 1.2, w: 4.4, d: 5.6, color: 0xa855f7 },
    ];

    const padMeshes: Array<{ padMat: THREE.MeshBasicMaterial; borderMat: THREE.LineBasicMaterial }> = [];
    showcaseLayout.forEach((item) => {
      const padGeo = new THREE.PlaneGeometry(item.w, item.d);
      const padMat = new THREE.MeshBasicMaterial({
        color: item.color,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(item.x, -3.15, item.z);
      showcasePadsGroup.add(pad);

      const borderEdges = new THREE.EdgesGeometry(padGeo);
      const borderMat = new THREE.LineBasicMaterial({
        color: item.color,
        transparent: true,
        opacity: 0.0,
      });
      const borderLine = new THREE.LineSegments(borderEdges, borderMat);
      pad.add(borderLine);

      disposables.push(padGeo, padMat, borderEdges, borderMat);
      padMeshes.push({ padMat, borderMat });
    });

    // Etiquetas flotantes 3D proyectadas al DOM
    const callouts: Array<{
      id: GatewayPartId;
      targetGroup: THREE.Group;
      localOffset: THREE.Vector3;
    }> = [
      { id: 'enclosure', targetGroup: lidPivotGroup, localOffset: new THREE.Vector3(3.3, 0.45, -2.6) },
      { id: 'tft18', targetGroup: tftGroup, localOffset: new THREE.Vector3(1.4, 0.3, 0.5) },
      { id: 'esp32c3', targetGroup: espGroup, localOffset: new THREE.Vector3(0, 0.35, 0.2) },
      { id: 'shield', targetGroup: shieldGroup, localOffset: new THREE.Vector3(-1.3, 0.25, 0.4) },
      { id: 'battery', targetGroup: batteryGroup, localOffset: new THREE.Vector3(1.8, 0.1, 1.5) },
    ];

    const camState = {
      theta: 0.68,
      phi: 0.98,
      radius: 15.0,
      target: new THREE.Vector3(0, 0.2, 0),
    };
    const desiredCam = {
      theta: 0.68,
      phi: 0.98,
      radius: 15.0,
      target: new THREE.Vector3(0, 0.2, 0),
    };

    const userOffsets: Record<DragKey, THREE.Vector3> = {
      enclosureBase: new THREE.Vector3(0, 0, 0),
      lid: new THREE.Vector3(0, 0, 0),
      battery: new THREE.Vector3(0, 0, 0),
      shield: new THREE.Vector3(0, 0, 0),
      esp32c3: new THREE.Vector3(0, 0, 0),
      tft18: new THREE.Vector3(0, 0, 0),
    };

    const draggableParts: Record<
      DragKey,
      { group: THREE.Group; compId: GatewayPartId; name: string }
    > = {
      enclosureBase: { group: enclosureBaseGroup, compId: 'enclosure', name: 'Base Carcasa 3D' },
      lid: { group: lidPivotGroup, compId: 'enclosure', name: 'Tapa Articulada 3D' },
      battery: { group: batteryGroup, compId: 'battery', name: 'Batería LiPo 5000mAh' },
      shield: { group: shieldGroup, compId: 'shield', name: 'Shield Expansión Pines' },
      esp32c3: { group: espGroup, compId: 'esp32c3', name: 'ESP32-C3 SuperMini' },
      tft18: { group: tftGroup, compId: 'tft18', name: 'Pantalla TFT 1.8"' },
    };

    enclosureBaseGroup.traverse((o) => {
      o.userData.dragKey = 'enclosureBase';
    });
    lidPivotGroup.traverse((o) => {
      o.userData.dragKey = 'lid';
    });
    batteryGroup.traverse((o) => {
      o.userData.dragKey = 'battery';
    });
    shieldGroup.traverse((o) => {
      o.userData.dragKey = 'shield';
    });
    espGroup.traverse((o) => {
      o.userData.dragKey = 'esp32c3';
    });
    tftGroup.traverse((o) => {
      o.userData.dragKey = 'tft18';
    });

    const selectionBoxHelper = new THREE.BoxHelper(espGroup, 0xfbbf24);
    const boxMat = selectionBoxHelper.material as THREE.LineBasicMaterial;
    boxMat.transparent = true;
    boxMat.opacity = 0.85;
    selectionBoxHelper.visible = false;
    scene.add(selectionBoxHelper);
    disposables.push(selectionBoxHelper.geometry, boxMat);

    const resetAllUserOffsets = () => {
      (Object.keys(userOffsets) as DragKey[]).forEach((k) => userOffsets[k].set(0, 0, 0));
    };

    const selectComponent = (id: GatewayPartId, autoMoveCamera = true) => {
      const spec = COMPONENT_SPECS[id];
      if (!spec) return;
      setActiveComponentId(id);
      if (autoMoveCamera) {
        const view = sceneStateRef.current.isShowcaseExtracted ? spec.camView : spec.assembledCam;
        desiredCam.theta = view.theta;
        desiredCam.phi = view.phi;
        desiredCam.radius = view.radius;
        desiredCam.target.set(view.target[0], view.target[1], view.target[2]);
      }
    };

    sceneActionsRef.current = {
      selectComponent,
      toggleShowcase: () => {
        const next = !sceneStateRef.current.isShowcaseExtracted;
        resetAllUserOffsets();
        setIsShowcaseExtracted(next);
        if (next) {
          setIsBoxOpen(true);
          setIsExploded(false);
          desiredCam.theta = 0.08;
          desiredCam.phi = 0.92;
          desiredCam.radius = 22.5;
          desiredCam.target.set(0.5, -0.8, 0.2);
        } else {
          setIsBoxOpen(false);
          desiredCam.theta = 0.68;
          desiredCam.phi = 0.98;
          desiredCam.radius = 15.0;
          desiredCam.target.set(0, 0.2, 0);
        }
      },
      toggleExplode: () => {
        const next = !sceneStateRef.current.isExploded;
        resetAllUserOffsets();
        setIsExploded(next);
        if (next) {
          setIsShowcaseExtracted(false);
          setIsBoxOpen(true);
          desiredCam.theta = 0.58;
          desiredCam.phi = 0.95;
          desiredCam.radius = 16.5;
          desiredCam.target.set(0, 0.6, 0);
        }
      },
      resetAll: () => {
        resetAllUserOffsets();
        setIsShowcaseExtracted(false);
        setIsBoxOpen(false);
        setIsExploded(false);
        setIsTransparent(false);
        setActiveComponentId(null);
        desiredCam.theta = 0.68;
        desiredCam.phi = 0.98;
        desiredCam.radius = 15.0;
        desiredCam.target.set(0, 0.2, 0);
      },
      refreshTftScreen: drawTFTDashboard,
    };

    let isDraggingPiece = false;
    let draggedKey: DragKey | null = null;
    let isPointerDown = false;
    let pointerButton = 0;
    const startPointer = { x: 0, y: 0 };
    const prevPointer = { x: 0, y: 0 };

    const dragPlane = new THREE.Plane();
    const dragIntersectPoint = new THREE.Vector3();
    const dragStartWorldPos = new THREE.Vector3();
    const dragStartOffset = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const camDirVec = new THREE.Vector3();
    const deltaVec = new THREE.Vector3();
    const upVec = new THREE.Vector3(0, 1, 0);

    const getRayIntersection = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects(gatewayRoot.children, true);
    };

    const setupDragPlane = (worldPos: THREE.Vector3, useVerticalPlane: boolean) => {
      if (useVerticalPlane) {
        camera.getWorldDirection(camDirVec);
        camDirVec.y = 0;
        if (camDirVec.lengthSq() < 0.001) camDirVec.set(0, 0, 1);
        camDirVec.normalize();
        dragPlane.setFromNormalAndCoplanarPoint(camDirVec, worldPos);
      } else {
        dragPlane.setFromNormalAndCoplanarPoint(upVec, worldPos);
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onMouseDown = (e: MouseEvent) => {
      isPointerDown = true;
      pointerButton = e.button;
      startPointer.x = prevPointer.x = e.clientX;
      startPointer.y = prevPointer.y = e.clientY;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));

      if (e.button === 0 && e.target === renderer.domElement) {
        const hits = getRayIntersection(e.clientX, e.clientY);
        if (hits.length > 0) {
          let obj: THREE.Object3D | null = hits[0].object;
          while (obj && !obj.userData?.dragKey && obj.parent) {
            obj = obj.parent;
          }
          const dKey = obj?.userData?.dragKey as DragKey | undefined;
          if (dKey && draggableParts[dKey]) {
            isDraggingPiece = true;
            draggedKey = dKey;
            const partInfo = draggableParts[dKey];
            const useVertical = e.shiftKey || sceneStateRef.current.dragModeVertical;
            setupDragPlane(hits[0].point, useVertical);

            if (raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint)) {
              dragStartWorldPos.copy(dragIntersectPoint);
            } else {
              dragStartWorldPos.copy(hits[0].point);
            }
            dragStartOffset.copy(userOffsets[dKey]);

            selectionBoxHelper.setFromObject(partInfo.group);
            selectionBoxHelper.visible = true;

            const off = userOffsets[dKey];
            setDragHud({
              visible: true,
              name: partInfo.name,
              coords: `Δ(${off.x.toFixed(1)}, ${off.y.toFixed(1)}, ${off.z.toFixed(1)})`,
              x: e.clientX,
              y: e.clientY,
            });
            container.style.cursor = 'grabbing';
          }
        }
      }
    };

    let lastHoverRaycast = 0;
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isDraggingPiece && draggedKey) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const useVertical = e.shiftKey || sceneStateRef.current.dragModeVertical;
        setupDragPlane(draggableParts[draggedKey].group.position, useVertical);

        if (raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint)) {
          deltaVec.subVectors(dragIntersectPoint, dragStartWorldPos);
          if (useVertical) {
            userOffsets[draggedKey].y = Math.max(-4.5, Math.min(9.0, dragStartOffset.y + deltaVec.y));
          } else {
            userOffsets[draggedKey].x = Math.max(-16.0, Math.min(16.0, dragStartOffset.x + deltaVec.x));
            userOffsets[draggedKey].z = Math.max(-14.0, Math.min(14.0, dragStartOffset.z + deltaVec.z));
          }
          dragStartWorldPos.copy(dragIntersectPoint);
          dragStartOffset.copy(userOffsets[draggedKey]);

          const off = userOffsets[draggedKey];
          setDragHud({
            visible: true,
            name: draggableParts[draggedKey].name,
            coords: `Δ(${off.x.toFixed(1)}, ${off.y.toFixed(1)}, ${off.z.toFixed(1)})`,
            x: e.clientX,
            y: e.clientY,
          });
        }
        return;
      }

      if (!isPointerDown) {
        const now = performance.now();
        if (now - lastHoverRaycast < 30) return;
        lastHoverRaycast = now;

        const rect = renderer.domElement.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          sceneStateRef.current.hoveredComponentId = null;
          setHoveredComponentId(null);
          setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
          container.style.cursor = 'default';
          return;
        }

        const intersects = getRayIntersection(e.clientX, e.clientY);
        if (intersects.length > 0) {
          let obj: THREE.Object3D | null = intersects[0].object;
          while (obj && !obj.userData?.componentId && obj.parent) {
            obj = obj.parent;
          }
          const compId = obj?.userData?.componentId as GatewayPartId | undefined;
          if (compId && COMPONENT_SPECS[compId]) {
            sceneStateRef.current.hoveredComponentId = compId;
            setHoveredComponentId(compId);
            container.style.cursor = 'grab';
            setTooltip({
              visible: true,
              compId,
              x: e.clientX,
              y: e.clientY,
            });
            return;
          }
        }

        sceneStateRef.current.hoveredComponentId = null;
        setHoveredComponentId(null);
        container.style.cursor = 'grab';
        setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const dx = e.clientX - prevPointer.x;
      const dy = e.clientY - prevPointer.y;
      prevPointer.x = e.clientX;
      prevPointer.y = e.clientY;

      if (pointerButton === 0) {
        desiredCam.theta -= dx * 0.008;
        desiredCam.phi = Math.max(0.18, Math.min(Math.PI / 2 - 0.04, desiredCam.phi - dy * 0.008));
      } else if (pointerButton === 2) {
        desiredCam.target.x = Math.max(-12.0, Math.min(12.0, desiredCam.target.x - dx * 0.015));
        desiredCam.target.y = Math.max(-3.5, Math.min(5.0, desiredCam.target.y + dy * 0.015));
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (!isPointerDown) return;
      const movedDist = Math.hypot(e.clientX - startPointer.x, e.clientY - startPointer.y);

      if (isDraggingPiece && draggedKey) {
        const clickedCompId = draggableParts[draggedKey].compId;
        isDraggingPiece = false;
        draggedKey = null;
        selectionBoxHelper.visible = false;
        setDragHud((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        container.style.cursor = 'grab';

        if (movedDist < 5) {
          selectComponent(clickedCompId, false);
        }
        isPointerDown = false;
        return;
      }

      isPointerDown = false;
      if (movedDist < 5 && e.target === renderer.domElement) {
        const hits = getRayIntersection(e.clientX, e.clientY);
        if (hits.length > 0) {
          let obj: THREE.Object3D | null = hits[0].object;
          while (obj && !obj.userData?.componentId && obj.parent) {
            obj = obj.parent;
          }
          const compId = obj?.userData?.componentId as GatewayPartId | undefined;
          if (compId && COMPONENT_SPECS[compId]) {
            selectComponent(compId);
          }
        }
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const hits = getRayIntersection(e.clientX, e.clientY);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.dragKey && obj.parent) {
          obj = obj.parent;
        }
        const dKey = obj?.userData?.dragKey as DragKey | undefined;
        if (dKey && userOffsets[dKey]) {
          userOffsets[dKey].set(0, 0, 0);
        }
      }
    };

    const onMouseLeave = () => {
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      if (!isDraggingPiece) {
        sceneStateRef.current.hoveredComponentId = null;
        setHoveredComponentId(null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      desiredCam.radius = Math.max(6.0, Math.min(36, desiredCam.radius + e.deltaY * 0.012));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        isPointerDown = true;
        startPointer.x = prevPointer.x = t.clientX;
        startPointer.y = prevPointer.y = t.clientY;

        const hits = getRayIntersection(t.clientX, t.clientY);
        if (hits.length > 0) {
          let obj: THREE.Object3D | null = hits[0].object;
          while (obj && !obj.userData?.dragKey && obj.parent) {
            obj = obj.parent;
          }
          const dKey = obj?.userData?.dragKey as DragKey | undefined;
          if (dKey && draggableParts[dKey]) {
            isDraggingPiece = true;
            draggedKey = dKey;
            setupDragPlane(hits[0].point, sceneStateRef.current.dragModeVertical);
            if (raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint)) {
              dragStartWorldPos.copy(dragIntersectPoint);
            }
            dragStartOffset.copy(userOffsets[dKey]);
            selectionBoxHelper.setFromObject(draggableParts[dKey].group);
            selectionBoxHelper.visible = true;
          }
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPointerDown || e.touches.length !== 1) return;
      const t = e.touches[0];

      if (isDraggingPiece && draggedKey) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        if (raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint)) {
          deltaVec.subVectors(dragIntersectPoint, dragStartWorldPos);
          if (sceneStateRef.current.dragModeVertical) {
            userOffsets[draggedKey].y = Math.max(-4.5, Math.min(9.0, dragStartOffset.y + deltaVec.y));
          } else {
            userOffsets[draggedKey].x = Math.max(-16.0, Math.min(16.0, dragStartOffset.x + deltaVec.x));
            userOffsets[draggedKey].z = Math.max(-14.0, Math.min(14.0, dragStartOffset.z + deltaVec.z));
          }
          dragStartWorldPos.copy(dragIntersectPoint);
          dragStartOffset.copy(userOffsets[draggedKey]);
        }
        return;
      }

      const dx = t.clientX - prevPointer.x;
      const dy = t.clientY - prevPointer.y;
      prevPointer.x = t.clientX;
      prevPointer.y = t.clientY;

      desiredCam.theta -= dx * 0.008;
      desiredCam.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.04, desiredCam.phi - dy * 0.008));
    };

    const onTouchEnd = () => {
      isPointerDown = false;
      isDraggingPiece = false;
      draggedKey = null;
      selectionBoxHelper.visible = false;
    };

    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    const targetBasePos = new THREE.Vector3();
    const targetLidPos = new THREE.Vector3();
    const targetBatPos = new THREE.Vector3();
    const targetShieldPos = new THREE.Vector3();
    const targetEspPos = new THREE.Vector3();
    const targetTftPos = new THREE.Vector3();
    const projVec = new THREE.Vector3();
    const clock = new THREE.Clock();

    let disposed = false;
    let frameId = 0;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const stepScene = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const st = sceneStateRef.current;

      const camSmooth = 1 - Math.exp(-5.5 * dt);
      camState.theta += (desiredCam.theta - camState.theta) * camSmooth;
      camState.phi += (desiredCam.phi - camState.phi) * camSmooth;
      camState.radius += (desiredCam.radius - camState.radius) * camSmooth;
      camState.target.lerp(desiredCam.target, camSmooth);

      camera.position.x =
        camState.target.x + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
      camera.position.y = camState.target.y + camState.radius * Math.cos(camState.phi);
      camera.position.z =
        camState.target.z + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
      camera.lookAt(camState.target);

      const expectedCaseMat = st.isTransparent ? caseTransparentMat : caseOrangeMat;
      caseMeshes.forEach((m) => {
        if (m.material !== expectedCaseMat) {
          m.material = expectedCaseMat;
        }
      });

      const hoverLift = (id: GatewayPartId) =>
        !isDraggingPiece && st.hoveredComponentId === id ? 0.25 : 0.0;

      if (st.isShowcaseExtracted) {
        targetBasePos.set(-8.5, -1.75 + hoverLift('enclosure'), -2.0).add(userOffsets.enclosureBase);
        targetLidPos.set(-11.8, 0.35 + hoverLift('enclosure'), -2.0).add(userOffsets.lid);
        targetBatPos.set(-3.2, -2.1 + hoverLift('battery'), 1.2).add(userOffsets.battery);
        targetShieldPos.set(1.8, -2.35 + hoverLift('shield'), 1.2).add(userOffsets.shield);
        targetEspPos.set(5.4, -2.35 + hoverLift('esp32c3'), 1.2).add(userOffsets.esp32c3);
        targetTftPos.set(9.2, -2.35 + hoverLift('tft18'), 1.2).add(userOffsets.tft18);
      } else if (st.isExploded) {
        targetBasePos.set(0, -1.4 + hoverLift('enclosure'), 0).add(userOffsets.enclosureBase);
        targetLidPos.set(-3.3, 2.15 + hoverLift('enclosure'), 0).add(userOffsets.lid);
        targetBatPos.set(0, -1.35 + hoverLift('battery'), 0).add(userOffsets.battery);
        targetShieldPos.set(0, 0.15 + hoverLift('shield'), -0.3).add(userOffsets.shield);
        targetEspPos.set(0, 1.35 + hoverLift('esp32c3'), -0.4).add(userOffsets.esp32c3);
        targetTftPos.set(0, 2.55 + hoverLift('tft18'), 0.1).add(userOffsets.tft18);
      } else {
        targetBasePos.set(0, hoverLift('enclosure'), 0).add(userOffsets.enclosureBase);
        targetLidPos.set(-3.3, 0.85 + hoverLift('enclosure'), 0).add(userOffsets.lid);
        targetBatPos.set(0, -0.62 + hoverLift('battery'), 0).add(userOffsets.battery);
        targetShieldPos.set(0, 0.12 + hoverLift('shield'), -0.3).add(userOffsets.shield);
        targetEspPos.set(0, 0.58 + hoverLift('esp32c3'), -0.4).add(userOffsets.esp32c3);
        targetTftPos
          .set(0, (st.isBoxOpen ? 1.35 : 0.92) + hoverLift('tft18'), 0.1)
          .add(userOffsets.tft18);
      }

      const partSmooth = 1 - Math.exp((isDraggingPiece ? -22 : -6.5) * dt);
      enclosureBaseGroup.position.lerp(targetBasePos, partSmooth);
      lidPivotGroup.position.lerp(targetLidPos, partSmooth);
      batteryGroup.position.lerp(targetBatPos, partSmooth);
      shieldGroup.position.lerp(targetShieldPos, partSmooth);
      espGroup.position.lerp(targetEspPos, partSmooth);
      tftGroup.position.lerp(targetTftPos, partSmooth);

      if (selectionBoxHelper.visible && draggedKey && draggableParts[draggedKey]) {
        selectionBoxHelper.setFromObject(draggableParts[draggedKey].group);
      }

      const targetLidRotZ = st.isBoxOpen || st.isShowcaseExtracted ? Math.PI * 0.62 : 0;
      lidPivotGroup.rotation.z = THREE.MathUtils.damp(
        lidPivotGroup.rotation.z,
        targetLidRotZ,
        6,
        dt
      );

      const targetPadOpacity = st.isShowcaseExtracted ? 0.16 : 0.0;
      const targetBorderOpacity = st.isShowcaseExtracted ? 0.65 : 0.0;
      padMeshes.forEach((p) => {
        p.padMat.opacity = THREE.MathUtils.damp(p.padMat.opacity, targetPadOpacity, 6, dt);
        p.borderMat.opacity = THREE.MathUtils.damp(p.borderMat.opacity, targetBorderOpacity, 6, dt);
      });

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      callouts.forEach((def) => {
        const el = labelElsRef.current[def.id];
        if (!el) return;
        if (!st.showLabels) {
          el.style.display = 'none';
          return;
        }
        projVec.copy(def.localOffset);
        def.targetGroup.localToWorld(projVec);
        projVec.project(camera);

        if (projVec.z > 1) {
          el.style.display = 'none';
        } else {
          const x = (projVec.x * 0.5 + 0.5) * cw;
          const y = (-projVec.y * 0.5 + 0.5) * ch;
          el.style.display = 'flex';
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
        }
      });

      renderer.render(scene, camera);
    };

    const tick = () => {
      if (disposed) return;
      stepScene();
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);

      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const setLabelRef = useCallback(
    (id: GatewayPartId) => (el: HTMLButtonElement | null) => {
      labelElsRef.current[id] = el;
    },
    []
  );

  const activeSpec = activeComponentId ? COMPONENT_SPECS[activeComponentId] : DEFAULT_SYSTEM_SPEC;
  const hoveredSpec = tooltip.compId ? COMPONENT_SPECS[tooltip.compId] : null;
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 335 : tooltip.x;
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 230 : tooltip.y;
  const tipLeft = Math.max(8, Math.min(tooltip.x + 18, maxWidth));
  const tipTop = Math.max(8, Math.min(tooltip.y + 18, maxHeight));

  return (
    <div className="bg-[#0b0f19] text-slate-100 rounded-2xl border border-orange-500/25 shadow-2xl overflow-hidden flex flex-col min-h-[760px] lg:h-[calc(100vh-12rem)] select-none">
      {/* Barra Superior */}
      <header className="bg-slate-900/95 z-20 px-4 lg:px-6 py-3 flex flex-wrap justify-between items-center gap-3 border-b border-orange-500/25 shrink-0">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block w-3 h-3 rounded-full shrink-0 ${
              activeDevice?.gatewayOnline ? 'bg-emerald-500' : 'bg-orange-500'
            }`}
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <Router className="w-4 h-4 text-orange-400 shrink-0" />
            <h1 className="text-base md:text-lg font-extrabold tracking-wider text-orange-400">
              MINESAFE GATEWAY 3D
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-orange-950/80 text-orange-300 border border-orange-500/40 font-mono font-semibold">
              ESP32-C3 SuperMini + Bridge
            </span>
          </div>
        </div>

        {/* Botones de Acción 3D */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => sceneActionsRef.current?.toggleShowcase()}
            className={`px-3.5 py-1.5 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold rounded-lg shadow-lg transition flex items-center gap-1.5 border border-orange-300/50 text-xs ${
              isShowcaseExtracted ? 'ring-2 ring-amber-300' : ''
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>{isShowcaseExtracted ? 'Guardar en Carcasa' : 'Extraer y Ordenar Piezas'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDragModeVertical((v) => !v)}
            title="También puedes mantener presionada la tecla Shift mientras arrastras para mover en vertical"
            className={`px-3 py-1.5 font-semibold rounded-lg border transition flex items-center gap-1.5 text-xs ${
              dragModeVertical
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/60'
                : 'bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/50'
            }`}
          >
            <MoveVertical className="w-3.5 h-3.5" />
            <span>{dragModeVertical ? 'Arrastre: Altura Y' : 'Arrastre: Plano XZ'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBoxOpen((v) => !v)}
            className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-orange-300 font-semibold rounded-lg border border-orange-500/40 transition flex items-center gap-1.5 text-xs"
          >
            <PackageOpen className="w-3.5 h-3.5" />
            <span>{isBoxOpen ? 'Cerrar Tapa' : 'Abrir Tapa'}</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.toggleExplode()}
            className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 font-medium text-xs ${
              isExploded
                ? 'bg-amber-950/80 text-amber-300 border-amber-400'
                : 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-amber-500/30'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>{isExploded ? 'Capas Verticales: ON' : 'Capas Verticales: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTransparent((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 font-medium text-xs ${
              isTransparent
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-400'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isTransparent ? 'Transparente: ON' : 'Transparente: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition inline-flex items-center gap-1.5 text-xs"
          >
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <span>{showLabels ? 'Etiquetas: ON' : 'Etiquetas: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.resetAll()}
            className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition inline-flex items-center gap-1.5 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ensamblar / Restaurar</span>
          </button>
        </div>
      </header>

      {/* Contenedor Principal (Visor 3D + Barra Lateral) */}
      <div className="flex flex-col lg:flex-row flex-1 relative overflow-hidden min-h-0">
        <div
          ref={containerRef}
          className="flex-1 min-h-[420px] lg:min-h-0 cursor-grab active:cursor-grabbing relative bg-[#0b0f19]"
        >
          {/* Guía rápida superior izquierda */}
          <div className="absolute top-4 left-4 z-10 pointer-events-none hidden sm:flex flex-col gap-1 bg-slate-900/90 px-3.5 py-2.5 rounded-xl border border-slate-700/80 text-xs text-slate-300 shadow-lg">
            <div className="font-semibold text-orange-400 flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5" />
              <span>Control Interactivo y Arrastre 3D</span>
            </div>
            <div>• Arrastrar Pieza (Clic Izq.): Mover componente libremente</div>
            <div>• Shift + Arrastrar: Subir / Bajar altura (Eje Y)</div>
            <div>• Doble Clic en Pieza: Devolver a su sitio original</div>
            <div>• Arrastrar Fondo: Orbitar cámara 360° • Rueda: Zoom</div>
          </div>

          {/* Etiquetas flotantes 3D proyectadas */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            {(
              [
                { id: 'enclosure', text: 'Carcasa 3D Naranja', color: '#f97316' },
                { id: 'tft18', text: 'TFT LCD 1.8" (128×160)', color: '#a855f7' },
                { id: 'esp32c3', text: 'ESP32-C3 SuperMini', color: '#10b981' },
                { id: 'shield', text: 'Placa Expansión (37.4×22.5mm)', color: '#3b82f6' },
                { id: 'battery', text: 'LiPo 5000mAh (105568)', color: '#06b6d4' },
              ] as const
            ).map((def) => {
              const isActive = activeComponentId === def.id || hoveredComponentId === def.id;
              return (
                <button
                  key={def.id}
                  ref={setLabelRef(def.id)}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sceneActionsRef.current?.selectComponent(def.id, true);
                  }}
                  style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
                  className={`absolute pointer-events-auto cursor-pointer select-none whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-900/95 border text-[11px] font-semibold text-slate-100 shadow-lg flex items-center gap-1.5 z-15 transition-colors ${
                    isActive ? 'border-orange-500 shadow-orange-500/40 bg-slate-800' : 'border-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: def.color }} />
                  <span>{def.text}</span>
                </button>
              );
            })}
          </div>

          {/* Barra Inferior de Telemetría del Gateway */}
          <div className="absolute bottom-4 left-4 right-4 xl:right-auto bg-slate-900/92 px-4 py-2.5 rounded-xl border border-slate-700/80 shadow-2xl flex flex-wrap items-center gap-4 md:gap-6 text-xs z-20">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Estado Telemetría</span>
              <span
                className={`font-bold flex items-center mt-0.5 font-mono ${
                  liveTelemetry.mode === 'vivo'
                    ? 'text-emerald-400'
                    : liveTelemetry.mode === 'falla_canal'
                    ? 'text-rose-400'
                    : 'text-amber-300'
                }`}
              >
                {liveTelemetry.badgeLabel}
              </span>
            </div>
            <div className="border-l border-slate-700/80 pl-4">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Enlace ESP-NOW (M2)</span>
              <span
                className={`font-bold flex items-center mt-0.5 font-mono ${
                  activeDevice?.gatewayOnline ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {activeDevice?.gatewayOnline ? 'Activo (< 0.45s)' : 'Sin enlace en vivo'}
              </span>
            </div>
            <div className="border-l border-slate-700/80 pl-4">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Último Ping Gateway</span>
              <span className="text-cyan-400 font-bold mt-0.5 block font-mono">
                {activeDevice?.lastPing || '--'}
              </span>
            </div>
            <div className="border-l border-slate-700/80 pl-4">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Batería LiPo 105568</span>
              <span className="text-amber-400 font-bold mt-0.5 block font-mono">
                5000mAh • {liveTelemetry.batteryPct !== null ? `${liveTelemetry.batteryPct}%` : '--'}
              </span>
            </div>
            <div className="border-l border-slate-700/80 pl-4 hidden sm:block">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Cloud Firebase RTDB</span>
              <span
                className={`font-bold mt-0.5 block font-mono ${
                  isFirebaseConnected ? 'text-orange-400' : 'text-slate-400'
                }`}
              >
                {isFirebaseConnected ? 'ONLINE' : 'SINCRONIZANDO'}
              </span>
            </div>
          </div>
        </div>

        {/* Panel Lateral Derecho de Inspección */}
        <aside className="w-full lg:w-96 max-h-[48vh] lg:max-h-none bg-slate-900/95 z-20 p-5 flex flex-col justify-between overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-800 shrink-0">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-orange-400">Componentes del Gateway</h2>
                <p className="text-xs text-slate-400 mt-0.5">Selecciona una pieza para ver sus detalles</p>
              </div>
              <span className="px-2 py-1 bg-orange-500/10 text-orange-400 text-xs font-mono rounded border border-orange-500/30">
                GTW-C3
              </span>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {COMPONENT_ORDER.map((id) => {
                const item = COMPONENT_SPECS[id];
                const isActive = activeComponentId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => sceneActionsRef.current?.selectComponent(id, true)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      isActive
                        ? 'border-orange-500 bg-orange-950/35 shadow-md'
                        : 'bg-slate-900/65 border-slate-800 hover:border-orange-500/60'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{item.listTitle}</span>
                      <span className={`w-3 h-3 rounded-full shrink-0 ${item.dotClass}`} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.listShort}</p>
                  </button>
                );
              })}
            </div>

            {/* Ficha Técnica Detallada del Componente Seleccionado */}
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-b from-orange-950/40 to-slate-900/95 border border-orange-500/40 shadow-inner">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  {activeSpec.badge}
                </span>
                <span className="text-[11px] font-mono text-slate-400">{activeSpec.dims}</span>
              </div>
              <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide mt-2">
                {activeSpec.title}
              </h3>
              <p className="text-xs text-slate-200 mt-1.5 leading-relaxed">{activeSpec.desc}</p>
              <div className="mt-3 pt-2.5 border-t border-slate-800/90 text-[11px] text-slate-300 space-y-1 font-mono">
                {activeSpec.specs.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 text-center text-[11px] text-slate-500 border-t border-slate-800/80 pt-3 flex items-center justify-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-orange-400" />
            <span>Proyecto de Título MineSafe • Gateway 3D Inspector</span>
          </div>
        </aside>
      </div>

      {/* HUD Flotante mientras se arrastra una pieza */}
      {dragHud.visible && (
        <div
          style={{
            left: `${dragHud.x}px`,
            top: `${dragHud.y}px`,
            transform: 'translate(-50%, -135%)',
          }}
          className="fixed pointer-events-none z-50 bg-slate-900/95 px-3 py-1.5 rounded-lg border border-amber-400/80 shadow-xl text-[11px] font-mono text-amber-300 flex items-center gap-2"
        >
          <span className="font-bold text-white">{dragHud.name}</span>
          <span className="text-cyan-300">{dragHud.coords}</span>
        </div>
      )}

      {/* Tooltip Flotante Dinámico al pasar el Mouse */}
      {tooltip.visible && hoveredSpec && (
        <div
          role="tooltip"
          style={{ left: `${tipLeft}px`, top: `${tipTop}px` }}
          className="fixed pointer-events-none z-50 max-w-[315px] bg-slate-900/95 p-3.5 rounded-xl border border-orange-500/70 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-700/80">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: hoveredSpec.color }}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-orange-300 font-bold">
                {hoveredSpec.badge}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-950/90 px-1.5 py-0.5 rounded border border-slate-700">
              {hoveredSpec.dims}
            </span>
          </div>
          <h4 className="text-xs md:text-sm font-extrabold text-white mt-2">{hoveredSpec.title}</h4>
          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{hoveredSpec.desc}</p>
          <div className="mt-2 pt-1.5 border-t border-slate-800/90 text-[10px] font-mono text-cyan-300 space-y-0.5">
            {hoveredSpec.specs.slice(0, 2).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-orange-400/90 font-semibold flex items-center justify-between">
            <span>Arrastra para mover • Doble clic: devolver</span>
            <span>Shift: Altura Y</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gateway3DInspectorView;
