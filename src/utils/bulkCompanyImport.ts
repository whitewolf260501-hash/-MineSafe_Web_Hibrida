import {
  DeviceCategory,
  DeviceRental,
  MiningCrew,
  MiningSector,
  MiningSite,
  Organization,
  RegisteredDeviceConfig,
  UserProfile,
  UserRole,
  WorkerAssignment,
} from '../types';
import { isPlaceholderRut, validateChileanRut } from './rut';

export type BulkEntityType =
  | 'hierarchy'
  | 'users'
  | 'sites'
  | 'crews'
  | 'devices'
  | 'rentals'
  | 'assignments'
  | 'bundle';

export interface ParsedBulkRow<T> {
  rowNumber: number;
  rawLabel: string;
  valid: boolean;
  errors: string[];
  data?: T;
}

export interface BulkUserImportItem {
  name: string;
  email: string;
  rut: string;
  role: 'operador' | 'supervisor' | 'admin';
  shift: string;
  assignedSector: string;
  assignedDeviceCode: string;
  status: 'activo' | 'inactivo';
  password?: string;
}

export interface BulkSiteImportItem {
  site: MiningSite;
}

export interface BulkCrewImportItem {
  crew: MiningCrew;
}

export interface BulkDeviceImportItem {
  device: RegisteredDeviceConfig;
}

export interface BulkHierarchyImportItem {
  organizationName?: string;
  siteName: string;
  crewName: string;
  crewCode: string;
  sectorName: string;
  sectorCode: string;
  deviceId: string;
  deviceName: string;
  deviceCategory: DeviceCategory;
  parentGatewayId?: string;
  region?: string;
  comuna?: string;
}

export interface BulkRentalImportItem {
  rental: Omit<DeviceRental, 'id'>;
}

export interface BulkAssignmentImportItem {
  assignment: Omit<WorkerAssignment, 'id'>;
}

export interface BulkCompanyBundleInput {
  organization?: Partial<Organization> & { name: string };
  users?: Array<Record<string, any>>;
  sites?: Array<Record<string, any>>;
  crews?: Array<Record<string, any>>;
  devices?: Array<Record<string, any>>;
  rentals?: Array<Record<string, any>>;
  assignments?: Array<Record<string, any>>;
}

export interface BulkParseResult<T> {
  entityType: BulkEntityType;
  totalRows: number;
  validRows: ParsedBulkRow<T>[];
  invalidRows: ParsedBulkRow<T>[];
  allRows: ParsedBulkRow<T>[];
  formatError?: string;
}

export interface BulkBundleParseResult {
  organization?: {
    valid: boolean;
    errors: string[];
    data?: Omit<Organization, 'id' | 'createdAt'> & { id?: string };
  };
  users: BulkParseResult<BulkUserImportItem>;
  sites: BulkParseResult<BulkSiteImportItem>;
  crews: BulkParseResult<BulkCrewImportItem>;
  devices: BulkParseResult<BulkDeviceImportItem>;
  rentals: BulkParseResult<BulkRentalImportItem>;
  assignments: BulkParseResult<BulkAssignmentImportItem>;
  formatError?: string;
}

export function normalizeHeaderKey(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function detectDelimiter(headerLine: string): ',' | ';' {
  let commaCount = 0;
  let semiCount = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === ',') commaCount++;
      if (ch === ';') semiCount++;
    }
  }
  return semiCount > commaCount ? ';' : ',';
}

export function parseCsvRecords(rawCsv: string): Record<string, string>[] {
  const cleaned = rawCsv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstNewline = cleaned.indexOf('\n');
  const firstLine = (firstNewline >= 0 ? cleaned.slice(0, firstNewline) : cleaned).trim();
  if (!firstLine) return [];

  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"') {
      if (inQuotes && cleaned[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeaderKey);
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) {
        obj[h] = (row[idx] ?? '').trim();
      }
    });
    records.push(obj);
  }
  return records;
}

function pickField(record: Record<string, any>, aliases: string[]): string {
  const normalizedMap: Record<string, any> = {};
  const compactMap: Record<string, any> = {};
  Object.keys(record || {}).forEach((k) => {
    const norm = normalizeHeaderKey(k);
    normalizedMap[norm] = record[k];
    compactMap[norm.replace(/_/g, '')] = record[k];
  });
  for (const alias of aliases) {
    const key = normalizeHeaderKey(alias);
    const val = normalizedMap[key] ?? compactMap[key.replace(/_/g, '')];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseRecordsFromInput(rawInput: string): { records?: Record<string, any>[]; error?: string } {
  const trimmed = rawInput.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { error: 'Pega datos CSV/JSON o carga un archivo antes de previsualizar.' };
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return { records: parsed };
      }
      return { error: 'El JSON debe ser un arreglo de registros [...] para este tipo de entidad (o usa el modo Paquete JSON).' };
    } catch (err: any) {
      return { error: `JSON inválido: ${err?.message || 'Error de sintaxis'}` };
    }
  }
  const records = parseCsvRecords(trimmed);
  if (records.length === 0) {
    return { error: 'No se detectaron filas de datos válidas después de la cabecera CSV.' };
  }
  return { records };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeBulkUserRole(rawRole: string): { role?: 'operador' | 'supervisor' | 'admin'; error?: string } {
  const clean = rawRole
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!clean || clean === 'operador' || clean === 'usuario' || clean === 'usuario_normal' || clean === 'usuario normal') {
    return { role: 'operador' };
  }
  if (
    clean === 'supervisor' ||
    clean === 'supervisor ambiental' ||
    clean === 'monotoriador' ||
    clean === 'monitoreador' ||
    clean === 'monitor'
  ) {
    return { role: 'supervisor' };
  }
  if (clean === 'admin' || clean === 'administrador' || clean === 'prevencionista') {
    return { role: 'admin' };
  }
  if (clean === 'superadmin' || clean === 'superadministrador' || clean === 'super_admin') {
    return { error: 'Bloqueado: no se permite importar ni escalar usuarios con rol SuperAdmin.' };
  }
  if (clean === 'admin_minesafe' || clean === 'adminminesafe' || clean === 'admin_corporativo') {
    return { error: 'Bloqueado: el rol Admin Corporativo MineSafe solo puede ser otorgado directamente por el SuperAdministrador.' };
  }
  return { error: `Rol inválido "${rawRole}". Usa: operador, supervisor o admin.` };
}

export function validateBulkUsersRecords(records: Record<string, any>[]): BulkParseResult<BulkUserImportItem> {
  const seenEmails = new Set<string>();
  const allRows: ParsedBulkRow<BulkUserImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const name = pickField(rec, ['nombre', 'name', 'nombre_completo', 'full_name']);
    const email = pickField(rec, ['email', 'correo', 'correo_electronico', 'mail']).toLowerCase();
    const rawRut = pickField(rec, ['rut', 'codigoId', 'dni']);
    let rut = 'No registrado';
    if (!isPlaceholderRut(rawRut)) {
      const rutCheck = validateChileanRut(rawRut);
      if (!rutCheck.valid) {
        errors.push(rutCheck.error || `RUT inválido (${rawRut})`);
      } else {
        rut = rutCheck.formatted!;
      }
    }
    const rawRole = pickField(rec, ['rol', 'role', 'tipoUsuario', 'tipo_usuario']);
    const shift = pickField(rec, ['turno', 'shift', 'cargo']) || 'Turno Mañana (07:00 - 15:30)';
    const assignedSector = pickField(rec, ['sector', 'assignedSector', 'geoMina', 'faena']) || 'Faena Minera Central';
    const assignedDeviceCode = pickField(rec, ['dispositivo', 'assignedDeviceCode', 'deviceId', 'codigo_dispositivo']);
    const rawStatus = pickField(rec, ['estado', 'status']).toLowerCase();
    const password = pickField(rec, ['password', 'clave', 'contrasena']);

    if (!name) errors.push('Nombre obligatorio');
    if (!email || !isValidEmail(email)) {
      errors.push('Email válido obligatorio');
    } else if (seenEmails.has(email)) {
      errors.push(`Email duplicado en archivo (${email})`);
    } else {
      seenEmails.add(email);
    }

    const roleCheck = normalizeBulkUserRole(rawRole);
    if (roleCheck.error) {
      errors.push(roleCheck.error);
    }

    const status: 'activo' | 'inactivo' =
      rawStatus === 'inactivo' || rawStatus === 'false' || rawStatus === '0' ? 'inactivo' : 'activo';

    if (password && password.length < 8) {
      errors.push('Si indicas clave, debe tener mínimo 8 caracteres');
    }

    const valid = errors.length === 0;
    return {
      rowNumber,
      rawLabel: name ? `${name} (${email || 'sin correo'})` : email || `Fila ${rowNumber}`,
      valid,
      errors,
      data: valid
        ? {
            name,
            email,
            rut,
            role: roleCheck.role!,
            shift,
            assignedSector,
            assignedDeviceCode,
            status,
            ...(password ? { password } : {}),
          }
        : undefined,
    };
  });

  return {
    entityType: 'users',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

function normalizeSiteType(raw: string): MiningSite['type'] {
  const clean = raw.trim().toLowerCase();
  if (clean.includes('rajo')) return 'rajo_abierto';
  if (clean.includes('mixt')) return 'mixta';
  return 'subterranea';
}

function normalizeSectorType(raw: string): MiningSector['type'] {
  const clean = raw.trim().toLowerCase();
  if (clean.includes('galeria') || clean.includes('ext')) return 'galeria_extraccion';
  if (clean.includes('pique')) return 'piquepal';
  if (clean.includes('taller')) return 'taller_mantencion';
  if (clean.includes('chimenea') || clean.includes('vent')) return 'chimenea_ventilacion';
  return 'socavon';
}

function normalizeVentStatus(raw: string): MiningSector['ventilationFanStatus'] {
  const clean = raw.trim().toLowerCase();
  if (clean.includes('forzad')) return 'ventilacion_forzada';
  if (clean.includes('manten')) return 'en_mantencion';
  if (clean.includes('detenid')) return 'detenido';
  return 'operativo_normal';
}

export function validateBulkSitesRecords(
  records: Record<string, any>[],
  organizationId: string,
  defaultCompanyName?: string
): BulkParseResult<BulkSiteImportItem> {
  const grouped = new Map<
    string,
    {
      rowNumbers: number[];
      site: MiningSite;
      errors: string[];
    }
  >();

  records.forEach((rec, idx) => {
    const rowNumber = idx + 2;
    const siteName = pickField(rec, ['faena', 'nombre_faena', 'siteName', 'name', 'nombre']);
    const company = pickField(rec, ['empresa', 'company']) || defaultCompanyName || 'Empresa Minera';
    const region = pickField(rec, ['region']) || 'Antofagasta';
    const comuna = pickField(rec, ['comuna', 'ubicacion', 'location']);
    const siteType = normalizeSiteType(pickField(rec, ['tipo_faena', 'tipoFaena', 'type']));
    const rawElevation = pickField(rec, ['elevacion', 'elevationMsl', 'altura']);
    const elevationMsl = rawElevation ? Number(rawElevation) : 2400;

    const sectorName = pickField(rec, ['sector', 'nombre_sector', 'sectorName']) || 'Nivel Principal 1';
    const sectorCode = pickField(rec, ['codigo_sector', 'codigoSector', 'sectorCode', 'code']) || `SEC-${String(idx + 1).padStart(2, '0')}`;
    const rawDepth = pickField(rec, ['profundidad', 'depthMeters', 'depth']);
    const depthMeters = rawDepth ? Number(rawDepth) : 250;
    const sectorType = normalizeSectorType(pickField(rec, ['tipo_sector', 'tipoSector', 'sectorType']));
    const rawWorkers = pickField(rec, ['trabajadores', 'dotacion', 'activeWorkers']);
    const activeWorkers = rawWorkers ? Number(rawWorkers) : 10;
    const rawSensors = pickField(rec, ['sensores', 'sensorsCount']);
    const sensorsCount = rawSensors ? Number(rawSensors) : 2;
    const ventilationFanStatus = normalizeVentStatus(pickField(rec, ['ventilacion', 'ventilationFanStatus']));
    const rawCrews = pickField(rec, ['cuadrillas', 'assignedCrews', 'cuadrilla']);
    const assignedCrews = rawCrews
      ? rawCrews.split(/[|,]/).map((c) => c.trim()).filter(Boolean)
      : [];

    const rowErrors: string[] = [];
    if (!siteName) rowErrors.push('Nombre de faena obligatorio');
    if (Number.isNaN(elevationMsl)) rowErrors.push('Elevación inválida');
    if (Number.isNaN(depthMeters) || depthMeters < 0) rowErrors.push('Profundidad inválida');
    if (Number.isNaN(activeWorkers) || activeWorkers < 0) rowErrors.push('Cantidad de trabajadores inválida');
    if (Number.isNaN(sensorsCount) || sensorsCount < 0) rowErrors.push('Cantidad de sensores inválida');

    const groupKey = `${organizationId}::${(siteName || `fila_${rowNumber}`).toLowerCase()}::${company.toLowerCase()}`;
    const slug = (siteName || `faena-${rowNumber}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);

    const sector: MiningSector = {
      id: `sec-${slug}-${idx + 1}`,
      name: sectorName,
      code: sectorCode,
      depthMeters: Number.isFinite(depthMeters) ? depthMeters : 250,
      type: sectorType,
      activeWorkers: Number.isFinite(activeWorkers) ? activeWorkers : 10,
      sensorsCount: Number.isFinite(sensorsCount) ? sensorsCount : 2,
      generalStatus: 'normal',
      ventilationFanStatus,
      assignedCrews,
    };

    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, {
        rowNumbers: [rowNumber],
        errors: [...rowErrors],
        site: {
          id: `site-${organizationId.slice(-8)}-${slug}`,
          organizationId,
          name: siteName || `Faena ${rowNumber}`,
          company,
          location: comuna ? `${comuna}, ${region}` : region,
          comuna: comuna || undefined,
          region,
          type: siteType,
          elevationMsl: Number.isFinite(elevationMsl) ? elevationMsl : 2400,
          activeSectors: [sector],
        },
      });
    } else {
      existing.rowNumbers.push(rowNumber);
      existing.errors.push(...rowErrors);
      existing.site.activeSectors.push(sector);
    }
  });

  const allRows: ParsedBulkRow<BulkSiteImportItem>[] = Array.from(grouped.values()).map((entry) => {
    const uniqueErrors = Array.from(new Set(entry.errors));
    const valid = uniqueErrors.length === 0;
    return {
      rowNumber: entry.rowNumbers[0],
      rawLabel: `${entry.site.name} (${entry.site.activeSectors.length} sector${entry.site.activeSectors.length === 1 ? '' : 'es'})`,
      valid,
      errors: uniqueErrors,
      data: valid ? { site: entry.site } : undefined,
    };
  });

  return {
    entityType: 'sites',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

function normalizePaymentStatus(raw: string): DeviceRental['paymentStatus'] {
  const clean = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (clean === 'vencido') return 'vencido';
  if (clean === 'pago_pendiente' || clean === 'pendiente') return 'pago_pendiente';
  if (clean === 'proximo_a_vencer' || clean === 'por_vencer') return 'proximo_a_vencer';
  return 'al_dia';
}

export function validateBulkRentalsRecords(
  records: Record<string, any>[],
  organizationId: string
): BulkParseResult<BulkRentalImportItem> {
  const seenContracts = new Set<string>();
  const today = new Date().toISOString().split('T')[0];

  const allRows: ParsedBulkRow<BulkRentalImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const contractNumber = pickField(rec, ['numero_contrato', 'numeroContrato', 'contractNumber', 'contrato']).replace(
      /[.#$/[\]]/g,
      '_'
    );
    const deviceCode = pickField(rec, ['codigo_dispositivo', 'codigoDispositivo', 'deviceCode', 'dispositivo']);
    const deviceType = pickField(rec, ['tipo_equipo', 'tipoEquipo', 'deviceType']) || 'Detector MultiGas Certificado DS 132';
    const provider = pickField(rec, ['proveedor', 'provider', 'empresa']) || 'MineSafe Mining Equipments';
    const startDate = pickField(rec, ['fecha_inicio', 'fechaInicio', 'startDate']) || today;
    const endDate = pickField(rec, ['fecha_termino', 'fechaTermino', 'endDate']) || '2026-12-31';
    const rawCost = pickField(rec, ['costo_mensual_clp', 'costoMensualClp', 'monthlyCostClp', 'monto', 'costo']);
    const monthlyCostClp = Number(rawCost.replace(/[^0-9.-]/g, ''));
    const paymentStatus = normalizePaymentStatus(pickField(rec, ['estado_pago', 'estadoPago', 'paymentStatus']));
    const assignedTechnician = pickField(rec, ['tecnico', 'assignedTechnician']) || 'Ingeniería MineSafe';
    const notes = pickField(rec, ['notas', 'notes', 'observaciones']) || 'Carga masiva de empresa';

    if (!contractNumber) {
      errors.push('Número de contrato obligatorio');
    } else if (seenContracts.has(contractNumber)) {
      errors.push(`Contrato duplicado en archivo (${contractNumber})`);
    } else {
      seenContracts.add(contractNumber);
    }
    if (!deviceCode) errors.push('Código de dispositivo obligatorio');
    if (!provider) errors.push('Proveedor obligatorio');
    if (!Number.isFinite(monthlyCostClp) || monthlyCostClp <= 0) {
      errors.push('Costo mensual CLP debe ser > 0');
    }

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59`).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      errors.push('Fecha de término anterior a fecha de inicio');
    }

    const valid = errors.length === 0;
    return {
      rowNumber,
      rawLabel: contractNumber ? `${contractNumber} · ${deviceCode || 'sin equipo'}` : `Fila ${rowNumber}`,
      valid,
      errors,
      data: valid
        ? {
            rental: {
              organizationId,
              contractNumber,
              deviceCode,
              deviceType,
              provider,
              startDate,
              endDate,
              monthlyCostClp,
              paymentStatus,
              lastPaymentDate: startDate,
              nextDueDate: endDate,
              assignedTechnician,
              notes,
            },
          }
        : undefined,
    };
  });

  return {
    entityType: 'rentals',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

export function validateBulkAssignmentsRecords(
  records: Record<string, any>[],
  organizationId: string
): BulkParseResult<BulkAssignmentImportItem> {
  const today = new Date().toISOString().split('T')[0];

  const allRows: ParsedBulkRow<BulkAssignmentImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const workerName = pickField(rec, ['trabajador', 'workerName', 'nombre', 'operador']);
    const rawWorkerRut = pickField(rec, ['rut_trabajador', 'rutTrabajador', 'workerRut', 'rut']);
    let workerRut = 'No registrado';
    if (!isPlaceholderRut(rawWorkerRut)) {
      const rutCheck = validateChileanRut(rawWorkerRut);
      if (!rutCheck.valid) {
        errors.push(rutCheck.error || `RUT trabajador inválido (${rawWorkerRut})`);
      } else {
        workerRut = rutCheck.formatted!;
      }
    }
    const role = pickField(rec, ['cargo', 'role', 'rol']) || 'Operador Subterráneo';
    const crew = pickField(rec, ['cuadrilla', 'crew']) || 'Cuadrilla Alfa - Turno A';
    const sectorName = pickField(rec, ['sector', 'sectorName']) || 'Faena Central';
    const assignedDeviceCode = pickField(rec, ['codigo_dispositivo', 'codigoDispositivo', 'assignedDeviceCode', 'dispositivo']);
    const assignedDeviceId = pickField(rec, ['id_dispositivo', 'assignedDeviceId']) || assignedDeviceCode;
    const assignmentDate = pickField(rec, ['fecha_asignacion', 'fechaAsignacion', 'assignmentDate']) || today;
    const rawBattery = pickField(rec, ['bateria', 'deviceBattery']);
    const parsedBattery = rawBattery ? Number(rawBattery) : 100;
    const deviceBattery = Number.isFinite(parsedBattery)
      ? Math.min(100, Math.max(0, parsedBattery))
      : 100;
    const emergencyContact = pickField(rec, ['contacto_emergencia', 'contactoEmergencia', 'emergencyContact']) || 'Sin registro';

    if (!workerName) errors.push('Nombre del trabajador obligatorio');
    if (!crew) errors.push('Cuadrilla obligatoria');
    if (!sectorName) errors.push('Sector obligatorio');
    if (!assignedDeviceCode) errors.push('Código de dispositivo obligatorio');

    const valid = errors.length === 0;
    return {
      rowNumber,
      rawLabel: workerName ? `${workerName} → ${assignedDeviceCode || 'sin equipo'}` : `Fila ${rowNumber}`,
      valid,
      errors,
      data: valid
        ? {
            assignment: {
              organizationId,
              workerRut,
              workerName,
              role,
              crew,
              sectorName,
              assignedDeviceId,
              assignedDeviceCode,
              assignmentDate,
              deviceBattery,
              emergencyContact,
            },
          }
        : undefined,
    };
  });

  return {
    entityType: 'assignments',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

function normalizeDeviceCategory(raw: string): { category?: DeviceCategory; error?: string } {
  const clean = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!clean || clean === 'nodo' || clean === 'sensor' || clean === 'nodo_sensor' || clean === 'node') {
    return { category: 'nodo' };
  }
  if (clean === 'gateway' || clean === 'concentrador' || clean === 'gw') {
    return { category: 'gateway' };
  }
  return { error: `Tipo de dispositivo inválido "${raw}". Usa: gateway o nodo.` };
}

function slugifyId(val: string, fallback: string): string {
  const clean = val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return clean || fallback;
}

export function validateBulkCrewsRecords(
  records: Record<string, any>[],
  organizationId: string
): BulkParseResult<BulkCrewImportItem> {
  const seenNames = new Set<string>();
  const now = Date.now();
  const allRows: ParsedBulkRow<BulkCrewImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const name = pickField(rec, ['cuadrilla', 'nombre_cuadrilla', 'nombre', 'name', 'crewName']);
    const code =
      pickField(rec, ['codigo_cuadrilla', 'codigo', 'code', 'crewCode']) ||
      `CUA-${String(idx + 1).padStart(2, '0')}`;
    const siteName = pickField(rec, ['faena', 'nombre_faena', 'siteName', 'mina']);
    const sectorName = pickField(rec, ['sector', 'nombre_sector', 'sectorName']);
    const shift = pickField(rec, ['turno', 'shift']) || 'Turno Mañana (07:00 - 15:30)';
    const rawStatus = pickField(rec, ['estado', 'status']).toLowerCase();
    const status: MiningCrew['status'] =
      rawStatus === 'inactiva' ? 'inactiva' : rawStatus === 'en_descanso' ? 'en_descanso' : 'activa';
    const notes = pickField(rec, ['notas', 'observaciones', 'notes']);

    if (!name) {
      errors.push('Nombre de cuadrilla obligatorio');
    } else if (seenNames.has(name.toLowerCase())) {
      errors.push(`Cuadrilla duplicada en archivo (${name})`);
    } else {
      seenNames.add(name.toLowerCase());
    }
    if (!siteName) {
      errors.push('Faena asignada obligatoria (cadena Faena → Cuadrilla)');
    }

    const valid = errors.length === 0;
    const siteSlug = slugifyId(siteName, `site-${idx + 1}`);
    const crewSlug = slugifyId(name, `crew-${idx + 1}`);
    return {
      rowNumber,
      rawLabel: name ? `${code} · ${name} (${siteName || 'sin faena'})` : `Fila ${rowNumber}`,
      valid,
      errors,
      data: valid
        ? {
            crew: {
              id: `crew-${organizationId.slice(-6)}-${crewSlug}`,
              organizationId,
              name,
              code,
              shift,
              status,
              siteId: `site-${organizationId.slice(-8)}-${siteSlug}`,
              siteName,
              sectorId: sectorName ? `sec-${siteSlug}-${slugifyId(sectorName, '1')}` : undefined,
              sectorName: sectorName || undefined,
              notes: notes || undefined,
              members: [],
              createdAt: now,
              updatedAt: now,
            },
          }
        : undefined,
    };
  });

  return {
    entityType: 'crews',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

export function validateBulkDevicesRecords(
  records: Record<string, any>[],
  organizationId: string
): BulkParseResult<BulkDeviceImportItem> {
  const seenIds = new Set<string>();
  const now = Date.now();
  const allRows: ParsedBulkRow<BulkDeviceImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const rawId = pickField(rec, ['id_dispositivo', 'deviceId', 'codigo', 'code', 'id']).replace(
      /[.#$/[\]\s]/g,
      '_'
    );
    const name = pickField(rec, ['nombre_dispositivo', 'nombre', 'name', 'deviceName']) || rawId;
    const rawType = pickField(rec, ['tipo', 'tipo_dispositivo', 'category', 'deviceCategory', 'rol_equipo']);
    const typeCheck = normalizeDeviceCategory(rawType);
    if (typeCheck.error) errors.push(typeCheck.error);

    const siteName = pickField(rec, ['faena', 'mina', 'siteName']);
    const crewName = pickField(rec, ['cuadrilla', 'crewName']);
    const sectorName = pickField(rec, ['sector', 'sectorName', 'galeria']);
    const parentGatewayId = pickField(rec, ['gateway_padre', 'parentGatewayId', 'gateway', 'id_gateway']).replace(
      /[.#$/[\]\s]/g,
      '_'
    );

    if (!rawId) {
      errors.push('ID o código de dispositivo obligatorio');
    } else if (seenIds.has(rawId.toLowerCase())) {
      errors.push(`Dispositivo duplicado en archivo (${rawId})`);
    } else {
      seenIds.add(rawId.toLowerCase());
    }
    if (!sectorName) {
      errors.push('Sector asignado obligatorio (cadena Sector → Dispositivo)');
    }

    const valid = errors.length === 0;
    const siteSlug = siteName ? slugifyId(siteName, 'faena') : '';
    const crewSlug = crewName ? slugifyId(crewName, 'cuadrilla') : '';
    const sectorSlug = slugifyId(sectorName, `sec-${idx + 1}`);
    const category = typeCheck.category || 'nodo';

    return {
      rowNumber,
      rawLabel: rawId
        ? `${name} (${category === 'gateway' ? 'Gateway' : 'Nodo'} → ${sectorName || 'sin sector'})`
        : `Fila ${rowNumber}`,
      valid,
      errors,
      data: valid
        ? {
            device: {
              id: rawId,
              organizationId,
              siteId: siteSlug ? `site-${organizationId.slice(-8)}-${siteSlug}` : undefined,
              siteName: siteName || undefined,
              crewId: crewSlug ? `crew-${organizationId.slice(-6)}-${crewSlug}` : undefined,
              crewName: crewName || undefined,
              sectorId: `sec-${siteSlug || 'org'}-${sectorSlug}`,
              name,
              category,
              sectorName,
              parentGatewayId:
                (category === 'nodo' || category === 'sensor') && parentGatewayId ? parentGatewayId : undefined,
              enabled: true,
              active: true,
              createdAt: now,
            },
          }
        : undefined,
    };
  });

  return {
    entityType: 'devices',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

export function validateBulkHierarchyRecords(
  records: Record<string, any>[],
  _organizationId: string
): BulkParseResult<BulkHierarchyImportItem> {
  const seenDeviceIds = new Set<string>();
  const allRows: ParsedBulkRow<BulkHierarchyImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const organizationName = pickField(rec, ['empresa', 'organizacion', 'organizationName', 'company']);
    const siteName = pickField(rec, ['faena', 'mina', 'siteName']);
    const crewName = pickField(rec, ['cuadrilla', 'crewName']);
    const crewCode =
      pickField(rec, ['codigo_cuadrilla', 'crewCode']) || `CUA-${String(idx + 1).padStart(2, '0')}`;
    const sectorName = pickField(rec, ['sector', 'sectorName']);
    const sectorCode =
      pickField(rec, ['codigo_sector', 'sectorCode']) || `SEC-${String(idx + 1).padStart(2, '0')}`;
    const deviceId = pickField(rec, ['id_dispositivo', 'deviceId', 'codigo_dispositivo', 'dispositivo']).replace(
      /[.#$/[\]\s]/g,
      '_'
    );
    const deviceName = pickField(rec, ['nombre_dispositivo', 'deviceName']) || deviceId;
    const rawType = pickField(rec, ['tipo_dispositivo', 'tipo', 'category']);
    const typeCheck = normalizeDeviceCategory(rawType);
    const parentGatewayId = pickField(rec, ['gateway_padre', 'parentGatewayId', 'gateway']).replace(
      /[.#$/[\]\s]/g,
      '_'
    );
    const region = pickField(rec, ['region']) || 'Antofagasta';
    const comuna = pickField(rec, ['comuna']) || '';

    if (!siteName) errors.push('Faena obligatoria');
    if (!crewName) errors.push('Cuadrilla obligatoria');
    if (!sectorName) errors.push('Sector obligatorio');
    if (!deviceId) {
      errors.push('ID de dispositivo obligatorio');
    } else if (seenDeviceIds.has(deviceId.toLowerCase())) {
      errors.push(`Dispositivo duplicado (${deviceId})`);
    } else {
      seenDeviceIds.add(deviceId.toLowerCase());
    }
    if (typeCheck.error) errors.push(typeCheck.error);

    const valid = errors.length === 0;
    const category = typeCheck.category || 'nodo';

    return {
      rowNumber,
      rawLabel: `${siteName || '?'} → ${crewName || '?'} → ${sectorName || '?'} → ${deviceName || '?'} (${
        category === 'gateway' ? 'Gateway' : 'Nodo'
      })`,
      valid,
      errors,
      data: valid
        ? {
            organizationName: organizationName || undefined,
            siteName,
            crewName,
            crewCode,
            sectorName,
            sectorCode,
            deviceId,
            deviceName,
            deviceCategory: category,
            parentGatewayId:
              (category === 'nodo' || category === 'sensor') && parentGatewayId ? parentGatewayId : undefined,
            region,
            comuna,
          }
        : undefined,
    };
  });

  return {
    entityType: 'hierarchy',
    totalRows: allRows.length,
    validRows: allRows.filter((r) => r.valid),
    invalidRows: allRows.filter((r) => !r.valid),
    allRows,
  };
}

export function expandHierarchyRowsToEntities(
  rows: BulkHierarchyImportItem[],
  organizationId: string,
  defaultCompanyName?: string
): {
  sites: BulkSiteImportItem[];
  crews: BulkCrewImportItem[];
  devices: BulkDeviceImportItem[];
} {
  const now = Date.now();
  const sitesMap = new Map<string, MiningSite>();
  const crewsMap = new Map<string, MiningCrew>();
  const devices: BulkDeviceImportItem[] = [];

  rows.forEach((row, idx) => {
    const siteSlug = slugifyId(row.siteName, `faena-${idx + 1}`);
    const siteId = `site-${organizationId.slice(-8)}-${siteSlug}`;
    const crewSlug = slugifyId(row.crewName, `cuadrilla-${idx + 1}`);
    const crewId = `crew-${organizationId.slice(-6)}-${crewSlug}`;
    const sectorSlug = slugifyId(row.sectorName, `sector-${idx + 1}`);
    const sectorId = `sec-${siteSlug}-${sectorSlug}`;

    let site = sitesMap.get(siteId);
    if (!site) {
      site = {
        id: siteId,
        organizationId,
        name: row.siteName,
        company: row.organizationName || defaultCompanyName || 'Empresa Minera',
        region: row.region || 'Antofagasta',
        comuna: row.comuna || undefined,
        location: row.comuna ? `${row.comuna}, ${row.region || 'Antofagasta'}` : row.region || 'Antofagasta',
        type: 'subterranea',
        elevationMsl: 2400,
        activeSectors: [],
      };
      sitesMap.set(siteId, site);
    }

    if (!site.activeSectors.some((s) => s.id === sectorId)) {
      site.activeSectors.push({
        id: sectorId,
        siteId,
        crewId,
        crewName: row.crewName,
        name: row.sectorName,
        code: row.sectorCode,
        depthMeters: 250,
        type: 'socavon',
        activeWorkers: 0,
        sensorsCount: 1,
        generalStatus: 'normal',
        ventilationFanStatus: 'operativo_normal',
        assignedCrews: [row.crewName],
      });
    } else {
      const existingSec = site.activeSectors.find((s) => s.id === sectorId);
      if (existingSec) {
        existingSec.sensorsCount += 1;
        if (!existingSec.crewId) {
          existingSec.crewId = crewId;
          existingSec.crewName = row.crewName;
        }
        const crewsList = existingSec.assignedCrews || [];
        if (!crewsList.includes(row.crewName)) {
          existingSec.assignedCrews = [...crewsList, row.crewName];
        }
      }
    }

    if (!crewsMap.has(crewId)) {
      crewsMap.set(crewId, {
        id: crewId,
        organizationId,
        name: row.crewName,
        code: row.crewCode,
        shift: 'Turno Mañana (07:00 - 15:30)',
        status: 'activa',
        siteId,
        siteName: row.siteName,
        sectorId,
        sectorName: row.sectorName,
        members: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    devices.push({
      device: {
        id: row.deviceId,
        organizationId,
        siteId,
        siteName: row.siteName,
        crewId,
        crewName: row.crewName,
        sectorId,
        name: row.deviceName,
        category: row.deviceCategory,
        sectorName: row.sectorName,
        parentGatewayId: row.parentGatewayId,
        enabled: true,
        createdAt: now,
      },
    });
  });

  return {
    sites: Array.from(sitesMap.values()).map((site) => ({ site })),
    crews: Array.from(crewsMap.values()).map((crew) => ({ crew })),
    devices,
  };
}

export function parseBulkInput(
  entityType: Exclude<BulkEntityType, 'bundle'>,
  rawInput: string,
  options: { organizationId: string; defaultCompanyName?: string }
): BulkParseResult<any> {
  const { records, error } = parseRecordsFromInput(rawInput);
  if (error || !records) {
    return {
      entityType,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      allRows: [],
      formatError: error || 'No se pudieron leer registros.',
    };
  }
  switch (entityType) {
    case 'hierarchy':
      return validateBulkHierarchyRecords(records, options.organizationId);
    case 'users':
      return validateBulkUsersRecords(records);
    case 'sites':
      return validateBulkSitesRecords(records, options.organizationId, options.defaultCompanyName);
    case 'crews':
      return validateBulkCrewsRecords(records, options.organizationId);
    case 'devices':
      return validateBulkDevicesRecords(records, options.organizationId);
    case 'rentals':
      return validateBulkRentalsRecords(records, options.organizationId);
    case 'assignments':
      return validateBulkAssignmentsRecords(records, options.organizationId);
  }
}

export function parseBulkCompanyBundle(
  rawJson: string,
  fallbackOrgId: string
): BulkBundleParseResult {
  const empty = <T,>(entityType: BulkEntityType): BulkParseResult<T> => ({
    entityType,
    totalRows: 0,
    validRows: [],
    invalidRows: [],
    allRows: [],
  });

  try {
    const parsed = JSON.parse(rawJson.replace(/^\uFEFF/, '').trim()) as BulkCompanyBundleInput;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        users: empty('users'),
        sites: empty('sites'),
        crews: empty('crews'),
        devices: empty('devices'),
        rentals: empty('rentals'),
        assignments: empty('assignments'),
        formatError:
          'El paquete JSON debe ser un objeto con claves opcionales: organization, sites, crews, devices, users, rentals, assignments.',
      };
    }

    let orgResult: BulkBundleParseResult['organization'] | undefined;
    let resolvedOrgId = fallbackOrgId;
    let companyName = '';

    if (parsed.organization) {
      const orgErrors: string[] = [];
      const name = String(parsed.organization.name || '').trim();
      if (name.length < 2) {
        orgErrors.push('El nombre de la empresa debe tener al menos 2 caracteres.');
      }
      const rawOrgRut = String(parsed.organization.rut || '').trim();
      let formattedOrgRut = '';
      if (!isPlaceholderRut(rawOrgRut)) {
        const orgRutCheck = validateChileanRut(rawOrgRut);
        if (!orgRutCheck.valid) {
          orgErrors.push(orgRutCheck.error || `RUT de empresa inválido (${rawOrgRut}).`);
        } else {
          formattedOrgRut = orgRutCheck.formatted!;
        }
      }
      const cleanId =
        parsed.organization.id?.trim() ||
        `org-${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;
      if (orgErrors.length === 0) {
        resolvedOrgId = cleanId;
        companyName = name;
        orgResult = {
          valid: true,
          errors: [],
          data: {
            id: cleanId,
            name,
            rut: formattedOrgRut,
            industry: String(parsed.organization.industry || 'Minería Subterránea & Rajo').trim(),
            status: parsed.organization.status === 'suspendida' ? 'suspendida' : 'activa',
          },
        };
      } else {
        orgResult = { valid: false, errors: orgErrors };
      }
    }

    return {
      organization: orgResult,
      users: Array.isArray(parsed.users) ? validateBulkUsersRecords(parsed.users) : empty('users'),
      sites: Array.isArray(parsed.sites)
        ? validateBulkSitesRecords(parsed.sites, resolvedOrgId, companyName)
        : empty('sites'),
      crews: Array.isArray(parsed.crews)
        ? validateBulkCrewsRecords(parsed.crews, resolvedOrgId)
        : empty('crews'),
      devices: Array.isArray(parsed.devices)
        ? validateBulkDevicesRecords(parsed.devices, resolvedOrgId)
        : empty('devices'),
      rentals: Array.isArray(parsed.rentals)
        ? validateBulkRentalsRecords(parsed.rentals, resolvedOrgId)
        : empty('rentals'),
      assignments: Array.isArray(parsed.assignments)
        ? validateBulkAssignmentsRecords(parsed.assignments, resolvedOrgId)
        : empty('assignments'),
    };
  } catch (err: any) {
    return {
      users: empty('users'),
      sites: empty('sites'),
      crews: empty('crews'),
      devices: empty('devices'),
      rentals: empty('rentals'),
      assignments: empty('assignments'),
      formatError: `Error parseando paquete JSON: ${err?.message || 'JSON inválido'}`,
    };
  }
}

export function getBulkCsvTemplate(entityType: Exclude<BulkEntityType, 'bundle'>): string {
  switch (entityType) {
    case 'hierarchy':
      return [
        'faena,cuadrilla,codigoCuadrilla,sector,codigoSector,idDispositivo,nombreDispositivo,tipoDispositivo,gatewayPadre,region,comuna',
        'Faena Cordón Norte,Cuadrilla Alfa,CUA-01,Galería Norte Nivel -320,SEC-01,GW_NORTE_01,Gateway Principal Norte,gateway,,Antofagasta,Calama',
        'Faena Cordón Norte,Cuadrilla Alfa,CUA-01,Galería Norte Nivel -320,SEC-01,NODO_NORTE_01,Nodo Ambiental Galería 1,nodo,GW_NORTE_01,Antofagasta,Calama',
        'Faena Cordón Norte,Cuadrilla Beta,CUA-02,Rampa Extracción Sur,SEC-02,NODO_SUR_01,Nodo Ambiental Rampa Sur,nodo,GW_NORTE_01,Antofagasta,Calama',
      ].join('\n');
    case 'crews':
      return [
        'cuadrilla,codigoCuadrilla,faena,sector,turno,estado,notas',
        'Cuadrilla Alfa,CUA-01,Faena Cordón Norte,Galería Norte Nivel -320,Turno Mañana (07:00 - 15:30),activa,Frente de avance subterráneo',
        'Cuadrilla Beta,CUA-02,Faena Cordón Norte,Rampa Extracción Sur,Turno Tarde (15:30 - 23:30),activa,Ventilación y carguío',
      ].join('\n');
    case 'devices':
      return [
        'idDispositivo,nombreDispositivo,tipoDispositivo,faena,cuadrilla,sector,gatewayPadre',
        'GW_NORTE_01,Gateway Sector Norte,gateway,Faena Cordón Norte,Cuadrilla Alfa,Galería Norte Nivel -320,',
        'NODO_NORTE_01,Nodo Sensor Galería 1,nodo,Faena Cordón Norte,Cuadrilla Alfa,Galería Norte Nivel -320,GW_NORTE_01',
        'NODO_NORTE_02,Nodo Sensor Galería 2,nodo,Faena Cordón Norte,Cuadrilla Alfa,Galería Norte Nivel -320,GW_NORTE_01',
      ].join('\n');
    case 'users':
      return [
        'nombre,email,rut,rol,turno,sector,dispositivo,estado',
        'Carlos Araya Soto,caraya@empresa.cl,17.456.789-1,operador,Turno Mañana (07:00 - 15:30),Nivel -320 Rampa Norte,NODO_NORTE_01,activo',
        'Lucía Muñoz Vera,lmunoz@empresa.cl,18.901.234-9,supervisor,Turno Tarde (15:30 - 23:30),Nivel -320 Rampa Norte,NODO_NORTE_01,activo',
        'Rodrigo Fuentes Díaz,rfuentes@empresa.cl,15.222.333-1,admin,Turno Administrativo,Faena Principal,,activo',
      ].join('\n');
    case 'sites':
      return [
        'faena,empresa,region,comuna,tipoFaena,elevacion,sector,codigoSector,profundidad,tipoSector,trabajadores,sensores,ventilacion,cuadrillas',
        'Faena Cordón Norte,Minera Andes Sur SpA,Antofagasta,Calama,subterranea,2650,Socavón Principal Nivel -320,SEC-CN-01,320,socavon,18,4,operativo_normal,Cuadrilla Alfa|Cuadrilla Beta',
        'Faena Cordón Norte,Minera Andes Sur SpA,Antofagasta,Calama,subterranea,2650,Galería Ventilación Sur,SEC-CN-02,360,chimenea_ventilacion,6,2,ventilacion_forzada,Cuadrilla Mantención',
      ].join('\n');
    case 'rentals':
      return [
        'numeroContrato,codigoDispositivo,tipoEquipo,proveedor,fechaInicio,fechaTermino,costoMensualClp,estadoPago,tecnico,notas',
        'CT-2026-101,GW_NORTE_01,Gateway Industrial MultiGas,Dräger Safety Chile S.A.,2026-01-15,2026-12-31,290000,al_dia,Equipo Terreno,Arriendo anual gateway principal',
        'CT-2026-102,NODO_NORTE_01,Nodo Ambiental 4-Gases,MineSafe Equipments,2026-02-01,2026-11-30,185000,pago_pendiente,Luis Rojas,Nodo sector norte',
      ].join('\n');
    case 'assignments':
      return [
        'rutTrabajador,trabajador,cargo,cuadrilla,sector,codigoDispositivo,fechaAsignacion,bateria,contactoEmergencia',
        '17.456.789-1,Carlos Araya Soto,Operador Perforación,Cuadrilla Alfa - Turno A,Socavón Principal Nivel -320,NODO_NORTE_01,2026-11-15,96,+56 9 8111 2233',
        '18.901.234-9,Lucía Muñoz Vera,Supervisor Ambiental,Cuadrilla Seguridad,Galería Ventilación Sur,NODO_NORTE_02,2026-11-15,92,+56 9 7222 3344',
      ].join('\n');
  }
}

export function getBulkJsonBundleTemplate(): string {
  const sample: BulkCompanyBundleInput = {
    organization: {
      name: 'Minera Andes Sur SpA',
      rut: '76.543.210-3',
      industry: 'Minería Subterránea Cobre',
      status: 'activa',
    },
    sites: [
      {
        faena: 'Faena Cordón Norte',
        empresa: 'Minera Andes Sur SpA',
        region: 'Antofagasta',
        comuna: 'Calama',
        tipoFaena: 'subterranea',
        elevacion: 2650,
        sector: 'Socavón Principal Nivel -320',
        codigoSector: 'SEC-CN-01',
        profundidad: 320,
        tipoSector: 'socavon',
        trabajadores: 18,
        sensores: 2,
        ventilacion: 'operativo_normal',
        cuadrillas: 'Cuadrilla Alfa',
      },
    ],
    crews: [
      {
        cuadrilla: 'Cuadrilla Alfa',
        codigoCuadrilla: 'CUA-01',
        faena: 'Faena Cordón Norte',
        sector: 'Socavón Principal Nivel -320',
        turno: 'Turno Mañana (07:00 - 15:30)',
        estado: 'activa',
      },
    ],
    devices: [
      {
        idDispositivo: 'GW_ANDES_01',
        nombreDispositivo: 'Gateway Sector Norte',
        tipoDispositivo: 'gateway',
        faena: 'Faena Cordón Norte',
        cuadrilla: 'Cuadrilla Alfa',
        sector: 'Socavón Principal Nivel -320',
      },
      {
        idDispositivo: 'NODO_ANDES_01',
        nombreDispositivo: 'Nodo Ambiental Nivel -320',
        tipoDispositivo: 'nodo',
        faena: 'Faena Cordón Norte',
        cuadrilla: 'Cuadrilla Alfa',
        sector: 'Socavón Principal Nivel -320',
        gatewayPadre: 'GW_ANDES_01',
      },
    ],
    users: [
      {
        nombre: 'Carlos Araya Soto',
        email: 'caraya@andes-sur.cl',
        rut: '17.456.789-1',
        rol: 'operador',
        turno: 'Turno Mañana (07:00 - 15:30)',
        sector: 'Socavón Principal Nivel -320',
        dispositivo: 'NODO_ANDES_01',
      },
      {
        nombre: 'Lucía Muñoz Vera',
        email: 'lmunoz@andes-sur.cl',
        rut: '18.901.234-9',
        rol: 'supervisor',
        turno: 'Turno Tarde (15:30 - 23:30)',
        sector: 'Socavón Principal Nivel -320',
      },
    ],
    rentals: [
      {
        numeroContrato: 'CT-2026-501',
        codigoDispositivo: 'NODO_ANDES_01',
        tipoEquipo: 'Nodo Ambiental MultiGas',
        proveedor: 'MineSafe Equipments',
        fechaInicio: '2026-01-15',
        fechaTermino: '2026-12-31',
        costoMensualClp: 215000,
        estadoPago: 'al_dia',
        tecnico: 'Soporte Terreno',
        notas: 'Carga inicial empresa',
      },
    ],
  };
  return JSON.stringify(sample, null, 2);
}

export function buildCompanyUserProfile(
  item: BulkUserImportItem,
  targetOrgId: string,
  idx: number
): UserProfile {
  const roleLabels: Record<UserRole, string> = {
    superadmin: 'Super Administrador de Seguridad Minera',
    admin_minesafe: 'Admin Corporativo MineSafe',
    admin: 'Administrador de Empresa',
    supervisor: 'Supervisor Ambiental',
    operador: 'Operador de Faena',
  };
  return {
    id: `usr-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    organizationId: targetOrgId,
    name: item.name,
    email: item.email,
    role: item.role,
    roleLabel: roleLabels[item.role],
    rut: item.rut,
    shift: item.shift,
    status: item.status,
    pendingActivation: item.status === 'activo',
    lastLogin: 'Carga masiva administrativa',
    assignedSector: item.assignedSector,
    assignedDeviceCode: item.assignedDeviceCode,
  };
}
