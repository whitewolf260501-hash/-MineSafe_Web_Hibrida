import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  Box,
  Layers,
  LockOpen,
  Lock,
  RotateCcw,
  RefreshCw,
  Undo2,
  Volume2,
  Radio,
} from 'lucide-react';
import { SensorDevice } from '../types';

type PartId =
  | 'esp32'
  | 'tft'
  | 'dht11'
  | 'mq2'
  | 'pm25'
  | 'speaker'
  | 'beacon'
  | 'case';

interface ComponentSpec {
  name: string;
  dotClass: string;
  short: string;
  title: string;
  desc: string;
  specs: string[];
  tipColor: string;
  tipType: string;
  tipWhat: string;
}

const COMPONENT_DATA: Record<PartId, ComponentSpec> = {
  esp32: {
    name: 'ESP32 DevKit V1',
    dotClass: 'bg-emerald-500',
    short: 'Cerebro del sistema: lógica en tiempo real, Wi-Fi y Firebase.',
    title: 'ESP32 DevKit V1 (MCU central)',
    desc: 'El cerebro del sistema. Procesa la lógica en tiempo real, gestiona la conexión Wi-Fi al hotspot y sincroniza las órdenes con Firebase RTDB. Corre FreeRTOS, lee los sensores y controla la sirena y la baliza.',
    specs: [
      'CPU: Xtensa LX6 dual-core @ 240 MHz',
      'Wi-Fi 802.11 b/g/n (conexión al hotspot) + Bluetooth',
      'SO: FreeRTOS (tareas concurrentes)',
      'Nube: Firebase Realtime Database (RTDB)',
    ],
    tipColor: '#10b981',
    tipType: 'Microcontrolador',
    tipWhat:
      'Cerebro del nodo: procesa la lógica en tiempo real, se conecta por Wi-Fi al hotspot y sincroniza las órdenes con Firebase.',
  },
  tft: {
    name: 'Pantalla ST7789 (TFT 1.3")',
    dotClass: 'bg-cyan-500',
    short: 'Panel gráfico local incrustado en la tapa.',
    title: 'Pantalla ST7789 TFT LCD (1.3")',
    desc: 'Muestra el panel gráfico principal del nodo, incrustado en la tapa de la caja impresa en 3D. Presenta en terreno temperatura, humedad, CO y PM2.5, y cambia a rojo cuando hay una alerta.',
    specs: [
      'Controlador: ST7789 · 1.3" · interfaz SPI',
      'Resolución típica: 240 × 240 px',
      'Ubicación: tapa de la caja impresa en 3D',
      'Muestra: temperatura, humedad, CO y PM2.5',
    ],
    tipColor: '#06b6d4',
    tipType: 'Pantalla ST7789',
    tipWhat:
      'Muestra en terreno temperatura, humedad, CO y PM2.5, y se pone en rojo ante una alerta.',
  },
  dht11: {
    name: 'Sensor DHT11 (Pin D22)',
    dotClass: 'bg-blue-500',
    short: 'Temperatura y humedad ambiental con caché de retención.',
    title: 'Sensor DHT11 (Pin D22 / GPIO 22)',
    desc: 'Mide la temperatura y la humedad ambiental. Usa un algoritmo no bloqueante y una caché de retención del último valor válido, para evitar caídas a cero cuando una lectura falla o el Wi-Fi interfiere.',
    specs: [
      'Pin: D22 (GPIO 22)',
      'Rango: 0–50 °C · 20–90 %HR',
      'Lectura no bloqueante',
      'Caché de retención de la última lectura válida',
    ],
    tipColor: '#3b82f6',
    tipType: 'Sensor · Pin D22',
    tipWhat:
      'Mide la temperatura y la humedad del ambiente, con caché para no caer a cero si una lectura falla.',
  },
  mq2: {
    name: 'Sensor MQ-2 / MQ-135 (ADC 34)',
    dotClass: 'bg-amber-500',
    short: 'Monóxido de carbono y gases combustibles.',
    title: 'Sensor de gas MQ-2 / MQ-135 (ADC Pin 34)',
    desc: 'Detecta la concentración de monóxido de carbono y de gases combustibles en la galería. Su salida analógica entra por el ADC del Pin 34 del ESP32, y al superar el umbral se activan la sirena y la baliza.',
    specs: [
      'Mide: monóxido de carbono (CO) y gases combustibles',
      'Salida analógica → ADC Pin 34',
      'Tipo: semiconductor (SnO₂) con calefactor',
      'Requiere precalentamiento',
    ],
    tipColor: '#f59e0b',
    tipType: 'Sensor de gas · ADC 34',
    tipWhat:
      'Detecta monóxido de carbono y gases combustibles; dispara las alarmas cuando supera el umbral.',
  },
  pm25: {
    name: 'Sensor Sharp GP2Y10 (PM2.5)',
    dotClass: 'bg-violet-500',
    short: 'Polvo y material particulado por pulsos ópticos IR.',
    title: 'Sensor de polvo Sharp GP2Y10 (PM2.5)',
    desc: 'Mide el polvo y el material particulado en suspensión mediante pulsos ópticos infrarrojos: un LED IR ilumina el aire que pasa por el orificio del sensor y un fotodetector mide la luz dispersada por las partículas.',
    specs: [
      'Modelo: Sharp GP2Y10 (sensor óptico de polvo)',
      'Mide: polvo / material particulado (PM2.5)',
      'Principio: pulsos ópticos infrarrojos (LED IR + fotodetector)',
      'Salida: analógica, proporcional a la densidad de polvo',
    ],
    tipColor: '#8b5cf6',
    tipType: 'Sensor de polvo · Sharp GP2Y10',
    tipWhat:
      'Mide el polvo y material particulado (PM2.5) en suspensión mediante pulsos ópticos infrarrojos.',
  },
  speaker: {
    name: 'Módulo I2S y parlante',
    dotClass: 'bg-rose-500',
    short: 'Sirena con tonos variables para alertar al personal.',
    title: 'Módulo de audio I2S y parlante',
    desc: 'Emite tonos de sirena variables para alertar al personal en terreno ante un evento crítico. Puede activarse de forma local, por los sensores, o de forma remota, desde la nube.',
    specs: [
      'Interfaz: I2S (audio digital)',
      'Salida: amplificador + parlante',
      'Sonido: tonos de sirena variables',
      'Disparo: local o remoto',
    ],
    tipColor: '#f43f5e',
    tipType: 'Módulo I2S + parlante',
    tipWhat: 'Emite tonos de sirena variables para alertar al personal en terreno.',
  },
  beacon: {
    name: 'Baliza 12 V con MOSFET',
    dotClass: 'bg-yellow-400',
    short: 'Luz estroboscópica de alta visibilidad.',
    title: 'Baliza de 12 V con MOSFET',
    desc: 'Luz estroboscópica de alta visibilidad para señalizar el peligro. Funciona a 12 V y el ESP32 la enciende y apaga a través de un MOSFET, ya que sus pines no pueden alimentarla directamente. Complementa a la sirena con una alarma lumínica.',
    specs: [
      'Alimentación: 12 V',
      'Conmutación: MOSFET controlado por el ESP32',
      'Efecto: luz estroboscópica de alta visibilidad',
      'Disparo: local o remoto',
    ],
    tipColor: '#facc15',
    tipType: 'Baliza 12 V + MOSFET',
    tipWhat:
      'Luz estroboscópica de alta visibilidad que señala peligro; el ESP32 la enciende mediante un MOSFET.',
  },
  case: {
    name: 'Carcasa impresa en 3D',
    dotClass: 'bg-orange-500',
    short: 'Estructura modular PETG/PLA naranja.',
    title: 'Carcasa impresa en 3D (PETG / PLA naranja)',
    desc: 'Estructura modular diseñada a medida e impresa en 3D. Tiene espacio para alojar la tornillería, ventilación y los componentes electrónicos de forma segura, y lleva la pantalla incrustada en la tapa.',
    specs: [
      'Material: PETG / PLA naranja',
      'Fabricación: impresión 3D a medida',
      'Diseño modular con espacio para tornillería',
      'Ventilación para la electrónica',
    ],
    tipColor: '#f97316',
    tipType: 'Carcasa impresa en 3D',
    tipWhat:
      'Estructura modular en PETG/PLA naranja que aloja y protege la electrónica, con ventilación y espacio para tornillería.',
  },
};

const PART_ORDER: PartId[] = [
  'esp32',
  'tft',
  'dht11',
  'mq2',
  'pm25',
  'speaker',
  'beacon',
  'case',
];

const ALERT_CO_THRESHOLD = 50;

interface Node3DInspectorViewProps {
  activeDevice?: SensorDevice;
}

export type Node3DTelemetryMode = 'simulacion' | 'vivo' | 'falla_canal' | 'desconectado';

export interface TelemetrySnapshot {
  temp: number | null;
  hum: number | null;
  co: number | null;
  pm: number | null;
  over: boolean;
  mode: Node3DTelemetryMode;
  badgeLabel: string;
  faultChannels: string[];
}

export function resolveNode3DLiveTelemetry(
  device: SensorDevice | undefined,
  alarmSim: boolean,
  useLiveNode: boolean
): TelemetrySnapshot | null {
  if (!useLiveNode) {
    return null;
  }
  if (!device) {
    return {
      temp: null,
      hum: null,
      co: null,
      pm: null,
      over: Boolean(alarmSim),
      mode: 'desconectado',
      badgeLabel: 'SIN NODO ACTIVO',
      faultChannels: [],
    };
  }

  const faultList = Array.isArray(device.faultFields) ? device.faultFields : [];
  const faults = new Set(faultList);
  const hasLiveBaseline =
    device.gatewayOnline ||
    device.status !== 'desconectado' ||
    (typeof device.lastUpdateServer === 'number' && device.lastUpdateServer > 0);

  if (!hasLiveBaseline) {
    return {
      temp: null,
      hum: null,
      co: null,
      pm: null,
      over: Boolean(alarmSim),
      mode: 'desconectado',
      badgeLabel: 'NODO DESCONECTADO',
      faultChannels: faultList,
    };
  }

  const readFinite = (val: unknown): number | null =>
    typeof val === 'number' && Number.isFinite(val) ? val : null;

  const temp = faults.has('temperatura')
    ? null
    : readFinite(device.rawTemp ?? device.metrics?.temperatura);
  const hum = faults.has('humedad')
    ? null
    : readFinite(device.rawHum ?? device.metrics?.humedad);
  const co = faults.has('CO')
    ? null
    : readFinite(device.rawCO ?? device.metrics?.co);
  const pm = faults.has('PM2_5')
    ? null
    : readFinite(device.rawPM25 ?? device.metrics?.polvoPM);

  const hasFault =
    faults.size > 0 || temp === null || hum === null || co === null || pm === null;
  const over = Boolean(
    alarmSim ||
      (!faults.has('CO') && co !== null && co > ALERT_CO_THRESHOLD) ||
      device.status === 'critico'
  );

  return {
    temp,
    hum,
    co,
    pm,
    over,
    mode: hasFault ? 'falla_canal' : 'vivo',
    badgeLabel: hasFault ? 'FALLA DE CANAL' : 'DATOS EN VIVO',
    faultChannels: faultList,
  };
}

interface TooltipState {
  visible: boolean;
  id: PartId | null;
  canDrag: boolean;
  x: number;
  y: number;
}

interface RegisteredPart {
  id: PartId;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  base: THREE.Vector3;
  explode: THREE.Vector3;
  offset?: THREE.Vector3;
}

interface MovableEntry {
  obj: THREE.Object3D;
  part?: RegisteredPart;
  home?: THREE.Vector3;
  lid?: boolean;
  returning: boolean;
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

export const Node3DInspectorView: React.FC<Node3DInspectorViewProps> = ({
  activeDevice,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isExploded, setIsExploded] = useState(false);
  const [isAlarmSim, setIsAlarmSim] = useState(false);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [useLiveNode, setUseLiveNode] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartId | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    temp: 23.4,
    hum: 48,
    co: 4,
    pm: 11,
    over: false,
    mode: 'simulacion',
    badgeLabel: 'MODO SIMULACIÓN',
    faultChannels: [],
  });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    id: null,
    canDrag: false,
    x: 0,
    y: 0,
  });

  // Mutable refs for Three.js loop access without re-mounting WebGL scene
  const simStateRef = useRef({
    open: false,
    explode: false,
    alarm: false,
    autoRotate: false,
    selected: null as PartId | null,
    hover: null as PartId | null,
    page: 0,
    over: false,
    sound: false,
    useLiveNode: false,
  });

  const telemetryRef = useRef<TelemetrySnapshot>({
    temp: 23.4,
    hum: 48,
    co: 4,
    pm: 11,
    over: false,
    mode: 'simulacion',
    badgeLabel: 'MODO SIMULACIÓN',
    faultChannels: [],
  });

  const activeDeviceRef = useRef<SensorDevice | undefined>(activeDevice);
  activeDeviceRef.current = activeDevice;

  // Imperative actions exposed from the Three.js mount effect
  const sceneActionsRef = useRef<{
    setOpen: (v: boolean, returnMovables?: boolean) => void;
    setExplode: (v: boolean) => void;
    selectPart: (id: PartId | null, focus: boolean) => void;
    returnPieces: () => void;
    resetView: () => void;
    setAutoRotate: (v: boolean) => void;
  } | null>(null);

  const nodeLabel = activeDevice?.id || 'device_38A839E81F84';

  // Sync React controls to mutable refs
  useEffect(() => {
    simStateRef.current.alarm = isAlarmSim;
  }, [isAlarmSim]);

  useEffect(() => {
    simStateRef.current.sound = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    simStateRef.current.useLiveNode = useLiveNode;
  }, [useLiveNode]);

  // Web Audio alarm loop when simulating gas alert + sound checked
  useEffect(() => {
    if (!isAlarmSim || !soundEnabled) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      return;
    }

    const playBeep = () => {
      if (!ctx || ctx.state === 'closed') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.035;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } catch {
        // Ignore audio errors when context cannot start without gesture
      }
    };

    playBeep();
    const timer = window.setInterval(playBeep, 600);
    return () => {
      window.clearInterval(timer);
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    };
  }, [isAlarmSim, soundEnabled]);

  // Telemetry ticker (simulated or mirrored from active node if live mode enabled)
  useEffect(() => {
    const step = () => {
      const liveResolved = resolveNode3DLiveTelemetry(
        activeDeviceRef.current,
        simStateRef.current.alarm,
        simStateRef.current.useLiveNode
      );
      if (liveResolved) {
        telemetryRef.current = liveResolved;
        simStateRef.current.over = liveResolved.over;
        setTelemetry(liveResolved);
        return;
      }

      const prev = telemetryRef.current;
      const baseTemp = prev.temp ?? 23.4;
      const baseHum = prev.hum ?? 48;
      const baseCo = prev.co ?? 4;
      const basePm = prev.pm ?? 11;
      const rnd = (s: number) => (Math.random() - 0.5) * s;
      const alarm = simStateRef.current.alarm;
      const temp = THREE.MathUtils.clamp(baseTemp + rnd(0.3), 20, 28);
      const hum = THREE.MathUtils.clamp(baseHum + rnd(1.0), 35, 65);
      const coTarget = alarm ? 120 : 4;
      const pmTarget = alarm ? 85 : 11;
      const co = Math.max(0, baseCo + (coTarget - baseCo) * (alarm ? 0.35 : 0.2) + rnd(1.2));
      const pm = Math.max(0, basePm + (pmTarget - basePm) * 0.2 + rnd(0.8));
      const over = co > ALERT_CO_THRESHOLD;

      const next: TelemetrySnapshot = {
        temp,
        hum,
        co,
        pm,
        over,
        mode: 'simulacion',
        badgeLabel: 'MODO SIMULACIÓN',
        faultChannels: [],
      };
      telemetryRef.current = next;
      simStateRef.current.over = over;
      setTelemetry(next);
    };

    step();
    const teleTimer = window.setInterval(step, 1000);
    const pageTimer = window.setInterval(() => {
      simStateRef.current.page = (simStateRef.current.page + 1) % 2;
    }, 4000);

    return () => {
      window.clearInterval(teleTimer);
      window.clearInterval(pageTimer);
    };
  }, []);

  // Main Three.js WebGL scene setup (runs once per mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.014);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const DEFAULT_CAM = new THREE.Vector3(11, 7, 15);
    const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
    camera.position.copy(DEFAULT_CAM);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;';
    container.prepend(renderer.domElement);

    // Studio reflection environment map (ensures brushed metals and dome glow realistically)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    disposables.push(envTarget);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotateSpeed = 1.2;
    controls.target.copy(DEFAULT_TARGET);

    const resize = () => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    // Lighting rig
    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 0.65));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 18, 14);
    dirLight.castShadow = !isSoftwareGl;
    dirLight.shadow.mapSize.set(2048, 2048);
    Object.assign(dirLight.shadow.camera, {
      left: -14,
      right: 14,
      top: 14,
      bottom: -14,
      near: 1,
      far: 60,
    });
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x2563eb, 1.4, 40);
    blueLight.position.set(-10, 5, -8);
    scene.add(blueLight);

    const orangeLight = new THREE.PointLight(0xf97316, 1.2, 40);
    orangeLight.position.set(9, -2, 9);
    scene.add(orangeLight);

    // Ground plane & subtle grid
    const floorMat = track(new THREE.ShadowMaterial({ opacity: 0.35 }));
    const floorGeo = track(new THREE.PlaneGeometry(60, 60));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.3;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(60, 60, 0x1e293b, 0x111827);
    grid.position.y = -4.29;
    scene.add(grid);

    // Material & mesh helpers
    const makeMat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
      track(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...opts }));

    const makeBox = (
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      parent?: THREE.Object3D
    ) => {
      const geo = track(new THREE.BoxGeometry(w, h, d));
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent?.add(mesh);
      return mesh;
    };

    const makeCyl = (
      rt: number,
      rb: number,
      h: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D,
      axisZ = true,
      seg = 32
    ) => {
      const geo = track(new THREE.CylinderGeometry(rt, rb, h, seg));
      const mesh = new THREE.Mesh(geo, m);
      if (axisZ) mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const makeLedMat = (hex: number) => {
      const m = makeMat(hex, { emissive: hex, emissiveIntensity: 1, roughness: 0.3 });
      m.userData.led = true;
      return m;
    };

    const deviceGroup = new THREE.Group();
    scene.add(deviceGroup);

    const innerLight = new THREE.PointLight(0xffffff, 0, 16);
    innerLight.position.set(0, 0.5, 2.2);
    deviceGroup.add(innerLight);

    // Hollow 3D-printed housing
    const orangeMat = makeMat(0xe65c00, { roughness: 0.45 });
    const darkMat = makeMat(0x111827, { roughness: 0.35, metalness: 0.5 });
    const metalMat = makeMat(0x94a3b8, { metalness: 0.9, roughness: 0.2 });
    const T = 0.2;
    const housing = new THREE.Group();
    deviceGroup.add(housing);
    const occluders: THREE.Mesh[] = [];

    const walls: Array<[number, number, number, number, number, number]> = [
      [6, 8, T, 0, 0, -1.5],
      [T, 8, 3.2, -2.9, 0, 0],
      [T, 8, 3.2, 2.9, 0, 0],
      [6, T, 3.2, 0, 3.9, 0],
      [6, T, 3.2, 0, -3.9, 0],
    ];
    walls.forEach(([w, h, d, x, y, z]) => {
      const mesh = makeBox(w, h, d, orangeMat, x, y, z, housing);
      mesh.userData.occluder = true;
      occluders.push(mesh);
    });

    makeBox(5.4, 7.4, 0.05, makeMat(0x1f2937, { roughness: 0.7 }), 0, 0, -1.375, housing);
    makeCyl(0.28, 0.28, 0.5, darkMat, 0, -4.1, 0, housing, false);
    [-2.2, 2.2].forEach((y) => makeCyl(0.14, 0.14, 1.0, metalMat, -3.03, y, 1.52, housing, false, 16));

    // Hinged front lid
    const lidGroup = new THREE.Group();
    lidGroup.position.set(-3, 0, 1.5);
    deviceGroup.add(lidGroup);
    const lidMesh = makeBox(6, 8, T, orangeMat, 3, 0, 0, lidGroup);
    lidMesh.userData.occluder = true;
    occluders.push(lidMesh);

    const screwCoords: Array<[number, number]> = [
      [0.35, 3.65],
      [5.65, 3.65],
      [0.35, -3.65],
      [5.65, -3.65],
    ];
    screwCoords.forEach(([x, y]) => makeCyl(0.14, 0.14, 0.08, metalMat, x, y, 0.13, lidGroup, true, 12));
    makeBox(0.25, 0.9, 0.18, darkMat, 5.85, 0, 0.15, lidGroup);

    // Embedded ST7789 TFT Screen
    const tftGroup = new THREE.Group();
    lidGroup.add(tftGroup);
    makeBox(3.7, 3.7, 0.1, makeMat(0x0b0f19, { roughness: 0.3, metalness: 0.4 }), 3, 0.7, 0.15, tftGroup);

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 240;
    screenCanvas.height = 240;
    const sctx = screenCanvas.getContext('2d');
    const screenTex = track(new THREE.CanvasTexture(screenCanvas));
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const screenPlaneMat = track(new THREE.MeshBasicMaterial({ map: screenTex }));
    const screenPlaneGeo = track(new THREE.PlaneGeometry(3.2, 3.2));
    const screenMesh = new THREE.Mesh(screenPlaneGeo, screenPlaneMat);
    screenMesh.position.set(3, 0.7, 0.205);
    tftGroup.add(screenMesh);

    // Front lid label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 96;
    const lctx = labelCanvas.getContext('2d');
    if (lctx) {
      lctx.fillStyle = '#111827';
      lctx.fillRect(0, 0, 512, 96);
      lctx.fillStyle = '#fb923c';
      lctx.font = 'bold 40px sans-serif';
      lctx.textBaseline = 'middle';
      lctx.fillText('MINESAFE', 20, 36);
      lctx.fillStyle = '#94a3b8';
      lctx.font = '24px sans-serif';
      lctx.fillText(`Nodo IoT · ${nodeLabel.replace(/^device_/, '')}`, 20, 72);
    }
    const labelTex = track(new THREE.CanvasTexture(labelCanvas));
    labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const labelMesh = new THREE.Mesh(
      track(new THREE.PlaneGeometry(3.6, 0.675)),
      track(new THREE.MeshBasicMaterial({ map: labelTex }))
    );
    labelMesh.position.set(3, -2.55, 0.105);
    lidGroup.add(labelMesh);

    const lidLedMat = makeLedMat(0x22c55e);
    const lidLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 16, 16)), lidLedMat);
    lidLed.position.set(3, -3.4, 0.13);
    lidGroup.add(lidLed);

    // Internal hardware parts registry
    const parts = {} as Record<PartId, RegisteredPart>;
    const registerPart = (id: PartId, group: THREE.Group, explode: [number, number, number]) => {
      const meshes: THREE.Mesh[] = [];
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !o.userData.noPick) {
          const mesh = o as THREE.Mesh;
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && !m.userData?.led && !m.map) {
            mesh.material = track(m.clone());
          }
          mesh.userData.part = id;
          meshes.push(mesh);
        }
      });
      parts[id] = {
        id,
        group,
        meshes,
        base: group.position.clone(),
        explode: new THREE.Vector3(...explode),
        offset: new THREE.Vector3(),
      };
    };

    // ESP32 DevKit V1
    const espGroup = new THREE.Group();
    espGroup.position.set(-1.0, -0.6, -1.25);
    deviceGroup.add(espGroup);
    makeBox(2.0, 3.4, 0.12, makeMat(0x14532d, { roughness: 0.6 }), 0, 0, 0, espGroup);
    makeBox(1.3, 1.5, 0.1, metalMat, 0, 0.5, 0.11, espGroup);
    makeBox(1.3, 0.45, 0.04, makeMat(0x0a0a0a), 0, 1.5, 0.08, espGroup);
    for (let i = 0; i < 4; i++) {
      makeBox(1.0, 0.04, 0.02, makeMat(0xd4a017, { metalness: 0.8 }), 0, 1.38 + i * 0.1, 0.11, espGroup);
    }
    makeBox(0.7, 0.5, 0.25, metalMat, 0, -1.55, 0.17, espGroup);
    [-0.88, 0.88].forEach((x) => makeBox(0.12, 3.0, 0.14, makeMat(0x0a0a0a), x, 0, 0.12, espGroup));
    const espLedMat = makeLedMat(0x3b82f6);
    const espLed = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.14, 0.06)), espLedMat);
    espLed.position.set(0.45, -0.9, 0.09);
    espGroup.add(espLed);
    registerPart('esp32', espGroup, [-1.6, -0.3, 2.4]);

    // DHT11
    const dhtGroup = new THREE.Group();
    dhtGroup.position.set(1.7, 2.4, -1.1);
    deviceGroup.add(dhtGroup);
    makeBox(1.0, 1.4, 0.5, makeMat(0x0284c7, { roughness: 0.55 }), 0, 0, 0, dhtGroup);
    for (let i = 0; i < 6; i++) {
      makeBox(0.8, 0.04, 0.03, makeMat(0x0c4a6e), 0, -0.5 + i * 0.2, 0.26, dhtGroup);
    }
    [-0.3, -0.1, 0.1, 0.3].forEach((x) => makeBox(0.05, 0.4, 0.05, metalMat, x, -0.9, 0, dhtGroup));
    registerPart('dht11', dhtGroup, [0.8, 1.0, 2.8]);

    // MQ-2 / MQ-135
    const mqGroup = new THREE.Group();
    mqGroup.position.set(1.6, 0.5, -1.25);
    deviceGroup.add(mqGroup);
    makeBox(1.5, 1.8, 0.1, makeMat(0x1d4ed8, { roughness: 0.55 }), 0, -0.1, 0, mqGroup);
    makeCyl(0.55, 0.55, 0.7, metalMat, 0, 0.1, 0.4, mqGroup);
    makeCyl(0.42, 0.42, 0.05, makeMat(0x475569, { metalness: 0.7 }), 0, 0.1, 0.77, mqGroup);
    makeBox(0.3, 0.3, 0.2, makeMat(0x1e40af), 0.45, -0.85, 0.12, mqGroup);
    registerPart('mq2', mqGroup, [1.8, 0.3, 2.2]);

    // Speaker + I2S module
    const spkGroup = new THREE.Group();
    spkGroup.position.set(1.5, -2.3, -1.25);
    deviceGroup.add(spkGroup);
    makeBox(1.6, 1.4, 0.1, makeMat(0x312e81, { roughness: 0.55 }), 0, 0, 0, spkGroup);
    makeCyl(0.55, 0.55, 0.35, makeMat(0x0a0a0a, { roughness: 0.4 }), 0, 0, 0.25, spkGroup);
    const cone = new THREE.Mesh(track(new THREE.TorusGeometry(0.38, 0.05, 12, 32)), metalMat);
    cone.position.set(0, 0, 0.44);
    spkGroup.add(cone);

    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const ringMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.55, 0.62, 40)), ringMat);
      ring.position.set(0, 0, 0.55);
      ring.userData.noPick = true;
      ring.userData.phase = i / 3;
      spkGroup.add(ring);
      rings.push(ring);
    }
    registerPart('speaker', spkGroup, [1.2, -1.4, 2.0]);

    // Sharp GP2Y10 PM2.5 Sensor
    const pmGroup = new THREE.Group();
    pmGroup.position.set(-1.2, 2.5, -0.95);
    deviceGroup.add(pmGroup);
    makeBox(1.8, 1.2, 0.7, makeMat(0x1f2937, { roughness: 0.55 }), 0, 0, 0, pmGroup);
    makeBox(1.84, 0.12, 0.74, makeMat(0xcbd5e1, { metalness: 0.85, roughness: 0.3 }), 0, 0.55, 0, pmGroup);
    makeCyl(0.3, 0.3, 0.05, makeMat(0x020617, { roughness: 0.8 }), 0, -0.05, 0.36, pmGroup);
    const pmHole = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.31, 0.04, 12, 32)),
      makeMat(0x64748b, { metalness: 0.8, roughness: 0.3 })
    );
    pmHole.position.set(0, -0.05, 0.37);
    pmHole.castShadow = true;
    pmGroup.add(pmHole);

    const pmIrMat = makeLedMat(0xff2a2a);
    const pmIr = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 12, 12)), pmIrMat);
    pmIr.position.set(0.62, -0.05, 0.36);
    pmGroup.add(pmIr);
    makeBox(1.0, 0.25, 0.4, makeMat(0xf8fafc, { roughness: 0.6 }), 0, -0.72, 0, pmGroup);
    for (let i = 0; i < 6; i++) {
      makeBox(0.05, 0.3, 0.05, metalMat, -0.4 + i * 0.16, -0.95, 0, pmGroup);
    }
    const pmLedMat = makeLedMat(0x22c55e);
    const pmLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 12, 12)), pmLedMat);
    pmLed.position.set(-0.7, 0.3, 0.36);
    pmGroup.add(pmLed);

    const PM_N = 45;
    const pmPos = new Float32Array(PM_N * 3);
    const pmSeeds = Array.from({ length: PM_N }, () => ({
      a: Math.random() * Math.PI * 2,
      r0: 0.4 + Math.random() * 0.6,
      t: Math.random(),
      s: 0.4 + Math.random() * 0.8,
    }));
    const pmGeo = track(new THREE.BufferGeometry());
    pmGeo.setAttribute('position', new THREE.BufferAttribute(pmPos, 3));
    const pmPointsMat = track(
      new THREE.PointsMaterial({
        color: 0xfde68a,
        size: 0.06,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      })
    );
    const pmPoints = new THREE.Points(pmGeo, pmPointsMat);
    pmPoints.frustumCulled = false;
    pmPoints.position.set(0, -0.05, 0);
    pmGroup.add(pmPoints);
    registerPart('pm25', pmGroup, [-0.6, 1.2, 2.6]);

    // 12V Strobe Beacon + internal MOSFET driver
    const beaconGroup = new THREE.Group();
    beaconGroup.position.set(0, 4.0, 0);
    deviceGroup.add(beaconGroup);
    const beaconTop = new THREE.Group();
    beaconGroup.add(beaconTop);
    makeCyl(0.75, 0.8, 0.25, darkMat, 0, 0.125, 0, beaconTop, false, 32);
    makeCyl(0.55, 0.65, 0.12, makeMat(0x475569, { metalness: 0.6, roughness: 0.4 }), 0, 0.31, 0, beaconTop, false, 32);
    const domeMat = makeMat(0xff9f1c, {
      emissive: 0xff6a00,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.88,
      roughness: 0.2,
      depthWrite: false,
    });
    domeMat.userData.led = true;
    const dome = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
      domeMat
    );
    dome.position.set(0, 0.37, 0);
    dome.renderOrder = 2;
    dome.castShadow = true;
    beaconTop.add(dome);

    const bulbMat = makeMat(0xfff7ed, { emissive: 0xffb347, emissiveIntensity: 0.2 });
    bulbMat.userData.led = true;
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 16, 12)), bulbMat);
    bulb.position.set(0, 0.65, 0);
    beaconTop.add(bulb);

    const beaconLight = new THREE.PointLight(0xff7a00, 0, 18);
    beaconLight.position.set(0, 0.8, 0.5);
    beaconTop.add(beaconLight);

    const mos = new THREE.Group();
    mos.position.set(-1.2, -7.0, -1.3);
    beaconGroup.add(mos);
    makeBox(1.7, 1.1, 0.1, makeMat(0x991b1b, { roughness: 0.6 }), 0, 0, 0, mos);
    makeBox(0.5, 0.55, 0.2, makeMat(0x0a0a0a), -0.35, 0.05, 0.15, mos);
    makeBox(0.5, 0.25, 0.04, metalMat, -0.35, 0.42, 0.1, mos);
    makeBox(0.45, 0.4, 0.3, makeMat(0x1d4ed8), 0.5, -0.3, 0.2, mos);
    makeBox(0.45, 0.4, 0.3, makeMat(0x1d4ed8), 0.5, 0.25, 0.2, mos);
    const mosLedMat = makeLedMat(0xef4444);
    const mosLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 12, 12)), mosLedMat);
    mosLed.position.set(-0.7, -0.4, 0.08);
    mos.add(mosLed);
    registerPart('beacon', beaconGroup, [0, 1.0, 2.0]);

    // TFT screen selectable on lid
    registerPart('tft', tftGroup, [0, 0, 0]);

    // Case ventilation slots + selection registration
    for (let i = 0; i < 6; i++) {
      makeBox(0.06, 0.12, 1.4, darkMat, 3.0, -1.6 + i * 0.4, 0, housing);
    }
    const caseMeshes: THREE.Mesh[] = [];
    [housing, lidGroup].forEach((g) =>
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !o.userData.part && !o.userData.noPick) {
          const mesh = o as THREE.Mesh;
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && !m.userData?.led && !m.map) {
            mesh.material = track(m.clone());
          }
          mesh.userData.part = 'case';
          caseMeshes.push(mesh);
        }
      })
    );
    parts.case = {
      id: 'case',
      group: housing,
      meshes: caseMeshes,
      base: housing.position.clone(),
      explode: new THREE.Vector3(0, 0, 0),
    };

    // Internal wiring harness
    const wires = new THREE.Group();
    deviceGroup.add(wires);
    const addWire = (pts: Array<[number, number, number]>, color: number) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const wireMesh = new THREE.Mesh(
        track(new THREE.TubeGeometry(curve, 32, 0.045, 8, false)),
        makeMat(color, { roughness: 0.6 })
      );
      wireMesh.castShadow = true;
      wires.add(wireMesh);
    };
    addWire([[-0.1, 0.4, -1.1], [0.5, 1.3, -0.95], [1.4, 2.0, -1.0]], 0xef4444);
    addWire([[0.0, 0.2, -1.1], [0.7, 0.4, -0.95], [1.3, 0.5, -1.0]], 0x3b82f6);
    addWire([[-0.05, -0.3, -1.1], [0.6, -1.4, -0.95], [1.2, -2.2, -1.1]], 0xfacc15);
    addWire([[-0.2, 0.5, -1.1], [0.9, 1.0, -0.85], [1.9, 2.0, -1.0]], 0x10b981);
    addWire([[-1.3, 1.1, -1.1], [-1.5, 1.6, -1.0], [-1.8, 2.3, -1.05]], 0x06b6d4);
    addWire(
      [
        [-1.5, -2.85, -1.1],
        [-2.55, -2.0, -1.0],
        [-2.6, 0.5, -1.0],
        [-2.5, 3.55, -1.0],
        [-1.0, 3.7, -0.7],
        [0, 3.85, -0.2],
      ],
      0xf1f5f9
    );

    // Draw dynamic ST7789 screen texture
    const drawScreen = () => {
      if (!sctx) return;
      const tele = telemetryRef.current;
      const over = !!tele.over;
      const flash = over && Math.floor(performance.now() / 400) % 2 === 0;
      sctx.fillStyle = over ? (flash ? '#7f1d1d' : '#450a0a') : '#04101c';
      sctx.fillRect(0, 0, 240, 240);
      sctx.fillStyle = over ? '#dc2626' : '#ea580c';
      sctx.fillRect(0, 0, 240, 36);
      sctx.fillStyle = '#ffffff';
      sctx.textBaseline = 'middle';
      sctx.font = 'bold 19px sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText('MINESAFE', 10, 18);
      sctx.textAlign = 'right';
      sctx.font = '14px sans-serif';
      sctx.fillText('Wi-Fi ●', 230, 18);
      sctx.textAlign = 'left';

      const drawRow = (label: string, val: string, unit: string, y: number, color: string) => {
        sctx.fillStyle = '#94a3b8';
        sctx.font = '14px sans-serif';
        sctx.fillText(label, 14, y);
        sctx.fillStyle = color;
        sctx.font = 'bold 38px sans-serif';
        sctx.fillText(val, 14, y + 34);
        const w = sctx.measureText(val).width;
        sctx.fillStyle = '#94a3b8';
        sctx.font = '16px sans-serif';
        sctx.fillText(unit, 20 + w, y + 40);
      };

      if (over) {
        sctx.fillStyle = '#ffffff';
        sctx.textAlign = 'center';
        sctx.font = 'bold 30px sans-serif';
        sctx.fillText('¡ALERTA!', 120, 75);
        sctx.font = '16px sans-serif';
        sctx.fillText('GAS PELIGROSO', 120, 105);
        sctx.fillStyle = '#fde047';
        sctx.font = 'bold 54px sans-serif';
        sctx.fillText(tele.co !== null ? String(Math.round(tele.co)) : '--', 120, 160);
        sctx.fillStyle = '#fecaca';
        sctx.font = '16px sans-serif';
        sctx.fillText('ppm CO', 120, 195);
        sctx.fillStyle = '#ffffff';
        sctx.font = 'bold 15px sans-serif';
        sctx.fillText('EVACUAR ZONA', 120, 222);
        sctx.textAlign = 'left';
      } else if (simStateRef.current.page === 0) {
        sctx.fillStyle = tele.mode === 'vivo' ? '#34d399' : tele.mode === 'simulacion' ? '#38bdf8' : '#fbbf24';
        sctx.font = 'bold 13px sans-serif';
        sctx.fillText(tele.badgeLabel, 14, 56);
        drawRow('Temperatura', tele.temp !== null ? tele.temp.toFixed(1) : '--', '°C', 82, tele.temp !== null ? '#7dd3fc' : '#f87171');
        drawRow('Humedad', tele.hum !== null ? String(Math.round(tele.hum)) : '--', '%', 150, tele.hum !== null ? '#7dd3fc' : '#f87171');
      } else {
        sctx.fillStyle = tele.mode === 'vivo' ? '#34d399' : '#fbbf24';
        sctx.font = 'bold 13px sans-serif';
        sctx.fillText(tele.mode === 'vivo' ? 'AIRE EN VIVO' : tele.badgeLabel, 14, 56);
        drawRow('Monóxido (CO)', tele.co !== null ? String(Math.round(tele.co)) : '--', 'ppm', 82, tele.co !== null ? '#fcd34d' : '#f87171');
        drawRow('Partículas PM2.5', tele.pm !== null ? String(Math.round(tele.pm)) : '--', 'µg/m³', 150, tele.pm !== null ? '#fcd34d' : '#f87171');
      }

      if (!over) {
        sctx.fillStyle = simStateRef.current.page === 0 ? '#fb923c' : '#334155';
        sctx.fillRect(100, 228, 16, 4);
        sctx.fillStyle = simStateRef.current.page === 1 ? '#fb923c' : '#334155';
        sctx.fillRect(124, 228, 16, 4);
      }
      screenTex.needsUpdate = true;
    };

    drawScreen();
    const screenTimer = window.setInterval(drawScreen, 200);

    // Highlights & selection helpers
    const applyHighlights = () => {
      const selId = simStateRef.current.selected;
      const hovId = simStateRef.current.hover;
      Object.values(parts).forEach((p) => {
        const isSel = selId === p.id;
        const isHov = hovId === p.id;
        p.meshes.forEach((m) => {
          const mt = m.material as THREE.MeshStandardMaterial;
          if (!mt || !mt.emissive || mt.userData?.led) return;
          if (isSel) {
            mt.emissive.setHex(0xff6a00);
            mt.emissiveIntensity = 0.45;
          } else if (isHov) {
            mt.emissive.setHex(0xffa040);
            mt.emissiveIntensity = 0.3;
          } else {
            mt.emissive.setHex(0x000000);
            mt.emissiveIntensity = 1;
          }
        });
      });
    };

    // Camera fly animation state
    let fly: {
      t: number;
      fromT: THREE.Vector3;
      toT: THREE.Vector3;
      fromP: THREE.Vector3;
      toP: THREE.Vector3;
    } | null = null;
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const flyTo = (target: THREE.Vector3, pos: THREE.Vector3) => {
      fly = {
        t: 0,
        fromT: controls.target.clone(),
        toT: target.clone(),
        fromP: camera.position.clone(),
        toP: pos.clone(),
      };
    };

    controls.addEventListener('start', () => {
      fly = null;
    });

    const focusOn = (id: PartId) => {
      const p = parts[id];
      if (!p) return;
      const target = new THREE.Vector3();
      if (id === 'tft') {
        target.set(0, 0.7, 1.6);
      } else if (id === 'case') {
        target.set(0, 0, 0);
      } else {
        p.group
          .getWorldPosition(target)
          .add(p.explode.clone().multiplyScalar(simStateRef.current.explode ? 1 : 0));
      }
      const dir = new THREE.Vector3(0.55, 0.3, 1).normalize();
      const dist = id === 'tft' ? 9 : id === 'case' ? 16 : 10;
      flyTo(target, target.clone().add(dir.multiplyScalar(dist)));
    };

    // Movable / extractable components
    const movables: MovableEntry[] = [
      ...(['esp32', 'dht11', 'mq2', 'pm25', 'speaker'] as PartId[]).map((id) => ({
        obj: parts[id].group,
        part: parts[id],
        returning: false,
      })),
      { obj: beaconTop, home: beaconTop.position.clone(), returning: false },
      { obj: mos, home: mos.position.clone(), returning: false },
    ];
    const lidMv: MovableEntry = {
      obj: lidGroup,
      home: lidGroup.position.clone(),
      lid: true,
      returning: false,
    };
    movables.push(lidMv);
    let lidFree = false;

    const setOpenInternal = (v: boolean, returnMovables = false) => {
      if (returnMovables) {
        if (!v) {
          movables.forEach((m) => {
            m.returning = true;
          });
        } else if (lidFree) {
          lidMv.returning = true;
        }
      }
      simStateRef.current.open = v;
      setIsOpen(v);
    };

    const setExplodeInternal = (v: boolean) => {
      simStateRef.current.explode = v;
      setIsExploded(v);
      if (v) setOpenInternal(true, false);
    };

    const selectPartInternal = (id: PartId | null, focus: boolean) => {
      simStateRef.current.selected = id;
      setSelectedPart(id);
      applyHighlights();
      if (id && focus) {
        if (!['tft', 'case', 'beacon'].includes(id) && !simStateRef.current.open) {
          setOpenInternal(true, false);
        }
        focusOn(id);
      }
    };

    sceneActionsRef.current = {
      setOpen: setOpenInternal,
      setExplode: setExplodeInternal,
      selectPart: selectPartInternal,
      returnPieces: () => {
        movables.forEach((m) => {
          m.returning = true;
        });
      },
      resetView: () => {
        selectPartInternal(null, false);
        flyTo(DEFAULT_TARGET, DEFAULT_CAM);
      },
      setAutoRotate: (v: boolean) => {
        simStateRef.current.autoRotate = v;
        controls.autoRotate = v;
        setIsAutoRotate(v);
      },
    };

    // Raycasting & drag-to-extract
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pickObjs: THREE.Object3D[] = [
      ...occluders,
      ...Object.values(parts).flatMap((p) => p.meshes),
    ];

    const pickHit = (e: PointerEvent | MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(pickObjs, false)[0] || null;
    };

    const movableFor = (hit: THREE.Intersection): MovableEntry | null => {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const found = movables.find((m) => m.obj === o);
        if (found) return found;
        o = o.parent;
      }
      return null;
    };

    const dragPlane = new THREE.Plane();
    const dragPt = new THREE.Vector3();
    const dragOff = new THREE.Vector3();
    const _worldVec = new THREE.Vector3();
    const _camDir = new THREE.Vector3();
    const _pivotCenter = new THREE.Vector3(3, 0, 0);
    const _beforeWorld = new THREE.Vector3();
    let explodeK = 0;

    let drag: {
      mv: MovableEntry;
      id: PartId;
      rotate: boolean;
      x: number;
      y: number;
      sx: number;
      sy: number;
      moved: boolean;
    } | null = null;
    let downPos: { x: number; y: number } | null = null;
    let touchTipTimer: number | null = null;
    let lastHoverTime = 0;

    const dom = renderer.domElement;

    const onContainerPointerDown = (e: PointerEvent) => {
      if (e.target !== dom) return;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      if (e.button !== 0 && e.button !== 2) return;
      const hit = pickHit(e);
      const mv = hit ? movableFor(hit) : null;
      if (!mv) return;
      e.stopPropagation();
      mv.returning = false;
      fly = null;
      mv.obj.getWorldPosition(_worldVec);
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(_camDir),
        _worldVec
      );
      if (!raycaster.ray.intersectPlane(dragPlane, dragPt)) return;
      dragOff.copy(_worldVec).sub(dragPt);
      drag = {
        mv,
        id: hit.object.userData.part as PartId,
        rotate: e.shiftKey || e.button === 2,
        x: e.clientX,
        y: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      dom.setPointerCapture(e.pointerId);
      dom.style.cursor = 'grabbing';
    };

    const handleDragMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        if (drag.mv.lid) {
          lidFree = true;
        } else if (simStateRef.current.selected !== drag.id) {
          selectPartInternal(drag.id, false);
        }
      }
      const o = drag.mv.obj;
      if (drag.rotate || e.shiftKey) {
        if (drag.mv.lid) {
          o.updateMatrixWorld(true);
          _beforeWorld.copy(_pivotCenter).applyMatrix4(o.matrixWorld);
          o.rotation.y += dx * 0.01;
          o.rotation.x += dy * 0.01;
          o.updateMatrixWorld(true);
          const after = _pivotCenter.clone().applyMatrix4(o.matrixWorld);
          o.position.add(_beforeWorld.sub(after));
        } else {
          o.rotation.y += dx * 0.01;
          o.rotation.x += dy * 0.01;
        }
        return;
      }

      const r = dom.getBoundingClientRect();
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPt)) return;

      const worldPt = dragPt.clone().add(dragOff);
      worldPt.y = Math.max(worldPt.y, drag.mv.lid ? -0.3 : -4.0);
      worldPt.clampLength(0, 18);
      if (!o.parent) return;
      const localPt = o.parent.worldToLocal(worldPt);
      const p = drag.mv.part;
      if (p && p.offset) {
        p.offset.copy(localPt).sub(p.base).addScaledVector(p.explode, -explodeK);
      } else {
        o.position.copy(localPt);
      }
    };

    const onDomPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onDomPointerUp = (e: PointerEvent) => {
      if (drag) {
        const finished = drag;
        drag = null;
        try {
          dom.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        dom.style.cursor = 'grab';
        if (!finished.moved) {
          selectPartInternal(finished.id, false);
        }
        return;
      }

      if (
        downPos &&
        Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 5
      ) {
        const hit = pickHit(e);
        const id = hit?.object.userData.part
          ? (hit.object.userData.part as PartId)
          : null;
        selectPartInternal(id, false);
        if (id && e.pointerType === 'touch') {
          const mv = hit ? movableFor(hit) : null;
          setTooltip({
            visible: true,
            id,
            canDrag: Boolean(mv),
            x: e.clientX,
            y: e.clientY,
          });
          if (touchTipTimer) window.clearTimeout(touchTipTimer);
          touchTipTimer = window.setTimeout(() => {
            setTooltip((prev) => ({ ...prev, visible: false }));
          }, 4000);
        }
      }
      downPos = null;
    };

    const onDomPointerMove = (e: PointerEvent) => {
      if (drag) {
        handleDragMove(e);
        return;
      }
      if (e.buttons || e.pointerType === 'touch') return;
      const now = performance.now();
      if (now - lastHoverTime < 35) return;
      lastHoverTime = now;

      const hit = pickHit(e);
      const id = hit?.object.userData.part
        ? (hit.object.userData.part as PartId)
        : null;
      if (id !== simStateRef.current.hover) {
        simStateRef.current.hover = id;
        applyHighlights();
      }
      const mv = hit ? movableFor(hit) : null;
      dom.style.cursor = !id ? '' : mv ? 'grab' : 'pointer';
      if (id) {
        setTooltip({
          visible: true,
          id,
          canDrag: Boolean(mv),
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };

    const onDomPointerLeave = () => {
      if (drag) return;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      if (simStateRef.current.hover) {
        simStateRef.current.hover = null;
        applyHighlights();
      }
    };

    const onDomDblClick = (e: MouseEvent) => {
      const hit = pickHit(e);
      const mv = hit ? movableFor(hit) : null;
      if (mv) mv.returning = true;
    };

    const onDomContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    container.addEventListener('pointerdown', onContainerPointerDown, true);
    dom.addEventListener('pointerdown', onDomPointerDown);
    dom.addEventListener('pointerup', onDomPointerUp);
    dom.addEventListener('pointermove', onDomPointerMove);
    dom.addEventListener('pointerleave', onDomPointerLeave);
    dom.addEventListener('dblclick', onDomDblClick);
    dom.addEventListener('contextmenu', onDomContextMenu);

    // Animation loop (with software WebGL frame pacing guard)
    const clock = new THREE.Clock();
    const OPEN_ANGLE = -Math.PI * 0.72;
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
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
      const t = clock.elapsedTime;
      const st = simStateRef.current;
      const tele = telemetryRef.current;

      const targetAngle = st.open ? OPEN_ANGLE : 0;
      if (!lidFree) {
        lidGroup.rotation.y = THREE.MathUtils.damp(
          lidGroup.rotation.y,
          targetAngle,
          6,
          dt
        );
      }
      innerLight.intensity = THREE.MathUtils.damp(
        innerLight.intensity,
        st.open ? 1.8 : 0,
        5,
        dt
      );

      explodeK = THREE.MathUtils.damp(explodeK, st.explode ? 1 : 0, 5, dt);
      Object.values(parts).forEach((p) => {
        p.group.position.copy(p.base).addScaledVector(p.explode, explodeK);
        if (p.offset) p.group.position.add(p.offset);
      });

      movables.forEach((m) => {
        if (!m.returning) return;
        if (m.lid && !lidFree) {
          m.returning = false;
          return;
        }
        const k = 1 - Math.exp(-7 * dt);
        const o = m.obj;
        const ty = m.lid ? (st.open ? OPEN_ANGLE : 0) : 0;
        if (m.part?.offset) {
          m.part.offset.multiplyScalar(1 - k);
        } else if (m.home) {
          o.position.lerp(m.home, k);
        }
        o.rotation.x *= 1 - k;
        o.rotation.z *= 1 - k;
        o.rotation.y += (ty - o.rotation.y) * k;

        const dist = m.part?.offset
          ? m.part.offset.length()
          : m.home
          ? o.position.distanceTo(m.home)
          : 0;
        if (
          dist < 0.01 &&
          Math.abs(o.rotation.x) + Math.abs(o.rotation.z) + Math.abs(o.rotation.y - ty) <
            0.01
        ) {
          if (m.part?.offset) m.part.offset.set(0, 0, 0);
          else if (m.home) o.position.copy(m.home);
          o.rotation.set(0, ty, 0);
          m.returning = false;
          if (m.lid) lidFree = false;
        }
      });

      const anyOut = movables.some(
        (m) =>
          !m.lid &&
          (m.returning ||
            (m.part?.offset
              ? m.part.offset.lengthSq()
              : m.home
              ? m.obj.position.distanceToSquared(m.home)
              : 0) > 1e-4 ||
            Math.abs(m.obj.rotation.x) + Math.abs(m.obj.rotation.y) > 1e-3)
      );
      wires.visible = explodeK < 0.05 && !anyOut;

      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 0.9);
        const k = ease(fly.t);
        controls.target.lerpVectors(fly.fromT, fly.toT, k);
        camera.position.lerpVectors(fly.fromP, fly.toP, k);
        if (fly.t >= 1) fly = null;
      }

      const over = !!tele.over;
      const blink = Math.floor(t * (over ? 4 : 1.5)) % 2 === 0;
      espLedMat.emissive.setHex(over ? 0xef4444 : 0x3b82f6);
      espLedMat.color.setHex(over ? 0xef4444 : 0x3b82f6);
      espLedMat.emissiveIntensity = blink ? 1.2 : 0.1;

      lidLedMat.emissive.setHex(over ? 0xef4444 : 0x22c55e);
      lidLedMat.color.setHex(over ? 0xef4444 : 0x22c55e);
      lidLedMat.emissiveIntensity = over ? (blink ? 1.5 : 0.1) : 0.9;

      orangeLight.intensity = over ? 1.2 + Math.abs(Math.sin(t * 6)) * 2.5 : 1.2;
      orangeLight.color.setHex(over ? 0xff2a2a : 0xf97316);

      rings.forEach((r) => {
        const ringMat = r.material as THREE.MeshBasicMaterial;
        if (!over) {
          ringMat.opacity = 0;
          return;
        }
        const phase = Number(r.userData.phase || 0);
        const k = (t * 1.2 + phase) % 1;
        r.scale.setScalar(1 + k * 2.2);
        ringMat.opacity = (1 - k) * 0.8;
      });

      pmIrMat.emissiveIntensity = Math.floor(t * 20) % 2 === 0 ? 1.4 : 0.15;
      const pmVal = typeof tele.pm === 'number' ? tele.pm : 0;
      const pmLevel = pmVal > 55 ? 2 : pmVal > 35 ? 1 : 0;
      const pmCol = tele.pm === null ? 0xf59e0b : [0x22c55e, 0xf59e0b, 0xef4444][pmLevel];
      pmLedMat.emissive.setHex(pmCol);
      pmLedMat.color.setHex(pmCol);
      pmLedMat.emissiveIntensity = pmLevel === 2 ? (blink ? 1.5 : 0.1) : 0.9;

      for (let i = 0; i < PM_N; i++) {
        const p = pmSeeds[i];
        p.t += dt * 0.3 * p.s * (1 + pmVal / 40);
        if (p.t > 1) p.t -= 1;
        const r = p.r0 * (0.9 * (1 - p.t) + 0.08);
        pmPos[i * 3] = r * Math.cos(p.a);
        pmPos[i * 3 + 1] = r * Math.sin(p.a);
        pmPos[i * 3 + 2] = 0.4 + (1 - p.t) * 0.55;
      }
      pmGeo.attributes.position.needsUpdate = true;
      pmPointsMat.opacity = tele.pm === null ? 0.12 : THREE.MathUtils.clamp(0.15 + pmVal / 70, 0.15, 1);
      pmPointsMat.size = 0.05 + Math.min(pmVal, 100) / 1200;

      const strobe = over && Math.floor(t * 8) % 2 === 0;
      domeMat.emissiveIntensity = strobe ? 2.4 : 0.15;
      bulbMat.emissiveIntensity = strobe ? 2.5 : 0.2;
      beaconLight.intensity = strobe ? 6 : 0;
      mosLedMat.emissiveIntensity = strobe ? 1.6 : 0.1;

      controls.update();
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
      window.clearInterval(screenTimer);
      if (touchTipTimer) window.clearTimeout(touchTipTimer);
      resizeObserver.disconnect();

      container.removeEventListener('pointerdown', onContainerPointerDown, true);
      dom.removeEventListener('pointerdown', onDomPointerDown);
      dom.removeEventListener('pointerup', onDomPointerUp);
      dom.removeEventListener('pointermove', onDomPointerMove);
      dom.removeEventListener('pointerleave', onDomPointerLeave);
      dom.removeEventListener('dblclick', onDomDblClick);
      dom.removeEventListener('contextmenu', onDomContextMenu);

      controls.dispose();
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
  }, [nodeLabel]);

  const activeSpec = selectedPart ? COMPONENT_DATA[selectedPart] : null;
  const tipSpec = tooltip.id ? COMPONENT_DATA[tooltip.id] : null;

  const tooltipLeft =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(tooltip.x + 16, window.innerWidth - 286))
      : tooltip.x + 16;
  const tooltipTop =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(tooltip.y + 16, window.innerHeight - 170))
      : tooltip.y + 16;

  return (
    <div className="bg-[#060913] text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[760px] lg:h-[calc(100vh-12rem)] select-none">
      {/* Header Toolbar */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 lg:px-6 py-3 flex flex-wrap gap-3 justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              telemetry.over ? 'bg-red-500' : 'bg-emerald-500'
            }`}
          />
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-orange-400 shrink-0" />
            <h1 className="text-base lg:text-lg font-bold tracking-wider text-orange-400">
              MINESAFE 3D INSPECTOR
            </h1>
          </div>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            Nodo: {nodeLabel}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => sceneActionsRef.current?.setOpen(!isOpen, true)}
            aria-pressed={isOpen}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
              !isOpen
                ? 'bg-orange-600 border-orange-400 text-white'
                : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isOpen ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            <span>{isOpen ? 'Cerrar carcasa' : 'Abrir carcasa'}</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.setExplode(!isExploded)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
              isExploded
                ? 'bg-orange-600 border-orange-400 text-white'
                : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Vista explosionada</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAlarmSim((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
              isAlarmSim
                ? 'bg-red-600 border-red-400 text-white'
                : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{isAlarmSim ? '■ Detener alerta' : 'Simular alerta de gas'}</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.setAutoRotate(!isAutoRotate)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
              isAutoRotate
                ? 'bg-orange-600 border-orange-400 text-white'
                : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Auto‑rotar</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.returnPieces()}
            title="Devuelve las piezas extraídas a su lugar"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Devolver piezas</span>
          </button>

          <button
            type="button"
            onClick={() => sceneActionsRef.current?.resetView()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer vista</span>
          </button>
        </div>
      </div>

      {/* Main Split: 3D Viewport + Hardware Inspector Sidebar */}
      <div className="flex flex-col lg:flex-row flex-1 relative overflow-hidden min-h-0">
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[420px] lg:min-h-0 cursor-grab active:cursor-grabbing bg-[#060913]"
        >
          <div className="absolute bottom-3 left-4 right-4 text-[11px] text-slate-400 pointer-events-none z-10">
            Arrastra el fondo para orbitar · rueda para zoom · arrastra un componente o la tapa para sacarlos (Shift o clic derecho: girar) · doble clic: devolver
          </div>

          {telemetry.over && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-red-600/95 border border-red-300 text-white text-xs sm:text-sm font-bold tracking-wide shadow-lg whitespace-nowrap">
              ⚠ ALERTA: CONCENTRACIÓN DE CO SOBRE EL UMBRAL
            </div>
          )}
        </div>

        <aside className="w-full lg:w-96 max-h-[50vh] lg:max-h-none bg-slate-900/95 z-10 p-5 flex flex-col gap-5 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-800">
          {/* Descripción */}
          <section>
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="text-orange-400 font-semibold">MineSafe</span> es un nodo sensor IoT autónomo y robusto para la seguridad en faenas mineras subterráneas. Vigila de forma continua gases nocivos, material particulado, temperatura y humedad; muestra los datos en terreno (pantalla TFT) y en la plataforma web, activando alarmas acústicas y lumínicas ante una emergencia.
            </p>
          </section>

          {/* Telemetría simulada / en vivo */}
          <section>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-2">
              <h2 className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
                {useLiveNode ? 'Telemetría del nodo activo' : 'Telemetría simulada'}
              </h2>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                  telemetry.over
                    ? 'bg-red-900/70 text-red-200 border-red-500'
                    : telemetry.mode === 'vivo'
                    ? 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70'
                    : telemetry.mode === 'falla_canal' || telemetry.mode === 'desconectado'
                    ? 'bg-amber-900/60 text-amber-200 border-amber-600/70'
                    : 'bg-cyan-900/50 text-cyan-200 border-cyan-700/60'
                }`}
              >
                {telemetry.over ? 'ALERTA GAS' : telemetry.badgeLabel}
              </span>
            </div>

            {activeDevice && (
              <button
                type="button"
                onClick={() => setUseLiveNode((v) => !v)}
                className={`mt-2.5 w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  useLiveNode
                    ? 'bg-cyan-950/60 border-cyan-700 text-cyan-200'
                    : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{useLiveNode ? 'Espejando lecturas reales (RTDB)' : 'Usar lecturas reales en la pantalla 3D'}</span>
                </span>
                <span className="text-[10px] uppercase font-bold">
                  {useLiveNode ? 'Vivo' : 'Sim.'}
                </span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Temperatura</div>
                <div className={`text-lg font-bold ${telemetry.temp === null ? 'text-rose-400' : 'text-sky-300'}`}>
                  {telemetry.temp !== null ? telemetry.temp.toFixed(1) : '--'}{' '}
                  <span className="text-xs font-normal text-slate-400">°C</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Humedad</div>
                <div className={`text-lg font-bold ${telemetry.hum === null ? 'text-rose-400' : 'text-sky-300'}`}>
                  {telemetry.hum !== null ? Math.round(telemetry.hum) : '--'}{' '}
                  <span className="text-xs font-normal text-slate-400">%</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">CO</div>
                <div className={`text-lg font-bold ${telemetry.co === null ? 'text-rose-400' : telemetry.over ? 'text-red-400' : 'text-amber-300'}`}>
                  {telemetry.co !== null ? Math.round(telemetry.co) : '--'}{' '}
                  <span className="text-xs font-normal text-slate-400">ppm</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">PM2.5</div>
                <div className={`text-lg font-bold ${telemetry.pm === null ? 'text-rose-400' : 'text-amber-300'}`}>
                  {telemetry.pm !== null ? Math.round(telemetry.pm) : '--'}{' '}
                  <span className="text-xs font-normal text-slate-400">µg/m³</span>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 mt-3 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="accent-orange-500"
              />
              <Volume2 className="w-3.5 h-3.5 text-orange-400" />
              <span>Sonido de alarma al simular alerta</span>
            </label>
          </section>

          {/* Lista de componentes */}
          <section>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
                Componentes del nodo
              </h2>
              <span className="text-[11px] text-slate-400">Clic para inspeccionar</span>
            </div>
            <div className="mt-3 space-y-2">
              {PART_ORDER.map((id) => {
                const item = COMPONENT_DATA[id];
                const active = selectedPart === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      sceneActionsRef.current?.selectPart(active ? null : id, true)
                    }
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? 'border-orange-500/80 bg-orange-950/40'
                        : 'bg-slate-950/60 border-slate-800 hover:border-orange-500/50'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-100">
                        {item.name}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dotClass}`} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{item.short}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tarjeta de especificación técnica */}
          <section className="p-4 rounded-xl bg-orange-950/25 border border-orange-500/35">
            <h3 className="text-xs sm:text-sm font-bold text-orange-400 uppercase tracking-wide">
              {activeSpec ? activeSpec.title : 'Selecciona un componente'}
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              {activeSpec
                ? activeSpec.desc
                : 'Haz clic sobre un elemento de la lista o directamente sobre el modelo 3D para ver su especificación técnica y su rol en MineSafe.'}
            </p>
            {activeSpec && (
              <ul className="mt-3 space-y-1 text-xs text-slate-300">
                {activeSpec.specs.map((specLine) => (
                  <li key={specLine} className="flex gap-2">
                    <span className="text-orange-400 shrink-0">▸</span>
                    <span>{specLine}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-auto text-center text-[11px] text-slate-500">
            Proyecto de Título MineSafe • Inspector Hardware IoT
          </div>
        </aside>
      </div>

      {/* Floating 3D Tooltip */}
      {tooltip.visible && tipSpec && (
        <div
          role="tooltip"
          style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px` }}
          className="fixed pointer-events-none z-50 w-max max-w-[270px] px-3 py-2.5 rounded-xl bg-slate-900/95 border border-orange-500/60 shadow-2xl"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tipSpec.tipColor }}
            />
            <span className="text-xs font-bold text-slate-100">{tipSpec.name}</span>
          </div>
          <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300">
            {tipSpec.tipType}
          </span>
          <p className="mt-1.5 text-xs leading-snug text-slate-300">{tipSpec.tipWhat}</p>
          <div className="mt-1.5 text-[10px] text-slate-400">
            {tooltip.canDrag
              ? 'Arrastra para sacarlo · Shift o clic derecho + arrastrar para girarlo · doble clic para devolverlo'
              : 'Clic para ver las especificaciones'}
          </div>
        </div>
      )}
    </div>
  );
};

export default Node3DInspectorView;
