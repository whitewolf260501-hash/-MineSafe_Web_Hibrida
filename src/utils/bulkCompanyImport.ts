import {
  DeviceRental,
  MiningSector,
  MiningSite,
  Organization,
  UserProfile,
  UserRole,
  WorkerAssignment,
} from '../types';

export type BulkEntityType = 'users' | 'sites' | 'rentals' | 'assignments' | 'bundle';

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
  role: 'operador' | 'monotoriador' | 'admin';
  shift: string;
  assignedSector: string;
  assignedDeviceCode: string;
  status: 'activo' | 'inactivo';
  password?: string;
}

export interface BulkSiteImportItem {
  site: MiningSite;
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
  Object.keys(record || {}).forEach((k) => {
    normalizedMap[normalizeHeaderKey(k)] = record[k];
  });
  for (const alias of aliases) {
    const key = normalizeHeaderKey(alias);
    const val = normalizedMap[key];
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

function normalizeBulkUserRole(rawRole: string): { role?: 'operador' | 'monotoriador' | 'admin'; error?: string } {
  const clean = rawRole
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!clean || clean === 'operador' || clean === 'usuario' || clean === 'usuario_normal' || clean === 'usuario normal') {
    return { role: 'operador' };
  }
  if (clean === 'monotoriador' || clean === 'monitoreador' || clean === 'monitor') {
    return { role: 'monotoriador' };
  }
  if (clean === 'admin' || clean === 'administrador' || clean === 'prevencionista') {
    return { role: 'admin' };
  }
  if (clean === 'superadmin' || clean === 'superadministrador' || clean === 'super_admin') {
    return { error: 'Bloqueado: no se permite importar ni escalar usuarios con rol SuperAdmin.' };
  }
  return { error: `Rol inválido "${rawRole}". Usa: operador, monotoriador o admin.` };
}

export function validateBulkUsersRecords(records: Record<string, any>[]): BulkParseResult<BulkUserImportItem> {
  const seenEmails = new Set<string>();
  const allRows: ParsedBulkRow<BulkUserImportItem>[] = records.map((rec, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const name = pickField(rec, ['nombre', 'name', 'nombre_completo', 'full_name']);
    const email = pickField(rec, ['email', 'correo', 'correo_electronico', 'mail']).toLowerCase();
    const rut = pickField(rec, ['rut', 'codigoId', 'dni']) || 'No registrado';
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

    if (password && password.length < 6) {
      errors.push('Si indicas clave, debe tener mínimo 6 caracteres');
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
    const workerRut = pickField(rec, ['rut_trabajador', 'rutTrabajador', 'workerRut', 'rut']) || 'No registrado';
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
    case 'users':
      return validateBulkUsersRecords(records);
    case 'sites':
      return validateBulkSitesRecords(records, options.organizationId, options.defaultCompanyName);
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
        rentals: empty('rentals'),
        assignments: empty('assignments'),
        formatError: 'El paquete JSON debe ser un objeto con claves opcionales: organization, users, sites, rentals, assignments.',
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
            rut: String(parsed.organization.rut || '').trim(),
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
      rentals: empty('rentals'),
      assignments: empty('assignments'),
      formatError: `Error parseando paquete JSON: ${err?.message || 'JSON inválido'}`,
    };
  }
}

export function getBulkCsvTemplate(entityType: Exclude<BulkEntityType, 'bundle'>): string {
  switch (entityType) {
    case 'users':
      return [
        'nombre,email,rut,rol,turno,sector,dispositivo,estado',
        'Carlos Araya Soto,caraya@empresa.cl,17.456.789-2,operador,Turno Mañana (07:00 - 15:30),Nivel -320 Rampa Norte,device_38A839E81F84,activo',
        'Lucía Muñoz Vera,lmunoz@empresa.cl,18.901.234-5,monotoriador,Turno Tarde (15:30 - 23:30),Nivel -320 Rampa Norte,device_38A839E81F84,activo',
        'Rodrigo Fuentes Díaz,rfuentes@empresa.cl,15.222.333-4,admin,Turno Administrativo,Faena Principal,,activo',
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
        'CT-2026-101,device_38A839E81F84,Gateway ESP32 MultiGas,Dräger Safety Chile S.A.,2026-01-15,2026-12-31,290000,al_dia,Equipo Terreno,Arriendo anual nodo principal',
        'CT-2026-102,MS-PORT-204,Detector Portátil 4-Gases,MineSafe Equipments,2026-02-01,2026-11-30,185000,pago_pendiente,Luis Rojas,Equipo respaldo cuadrilla B',
      ].join('\n');
    case 'assignments':
      return [
        'rutTrabajador,trabajador,cargo,cuadrilla,sector,codigoDispositivo,fechaAsignacion,bateria,contactoEmergencia',
        '17.456.789-2,Carlos Araya Soto,Operador Perforación,Cuadrilla Alfa - Turno A,Socavón Principal Nivel -320,device_38A839E81F84,2026-11-15,96,+56 9 8111 2233',
        '18.901.234-5,Lucía Muñoz Vera,Monotoriador Ambiental,Cuadrilla Seguridad,Galería Ventilación Sur,MS-PORT-204,2026-11-15,92,+56 9 7222 3344',
      ].join('\n');
  }
}

export function getBulkJsonBundleTemplate(): string {
  const sample: BulkCompanyBundleInput = {
    organization: {
      name: 'Minera Andes Sur SpA',
      rut: '76.543.210-8',
      industry: 'Minería Subterránea Cobre',
      status: 'activa',
    },
    users: [
      {
        nombre: 'Carlos Araya Soto',
        email: 'caraya@andes-sur.cl',
        rut: '17.456.789-2',
        rol: 'operador',
        turno: 'Turno Mañana (07:00 - 15:30)',
        sector: 'Socavón Principal Nivel -320',
        dispositivo: 'device_38A839E81F84',
      },
      {
        nombre: 'Lucía Muñoz Vera',
        email: 'lmunoz@andes-sur.cl',
        rut: '18.901.234-5',
        rol: 'monotoriador',
        turno: 'Turno Tarde (15:30 - 23:30)',
        sector: 'Galería Ventilación Sur',
      },
    ],
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
        sensores: 4,
        ventilacion: 'operativo_normal',
        cuadrillas: 'Cuadrilla Alfa|Cuadrilla Beta',
      },
    ],
    rentals: [
      {
        numeroContrato: 'CT-2026-501',
        codigoDispositivo: 'MS-PORT-204',
        tipoEquipo: 'Detector Portátil MultiGas',
        proveedor: 'MineSafe Equipments',
        fechaInicio: '2026-01-15',
        fechaTermino: '2026-12-31',
        costoMensualClp: 215000,
        estadoPago: 'al_dia',
        tecnico: 'Soporte Terreno',
        notas: 'Carga inicial empresa',
      },
    ],
    assignments: [
      {
        rutTrabajador: '17.456.789-2',
        trabajador: 'Carlos Araya Soto',
        cargo: 'Operador Subterráneo',
        cuadrilla: 'Cuadrilla Alfa',
        sector: 'Socavón Principal Nivel -320',
        codigoDispositivo: 'MS-PORT-204',
        bateria: 95,
        contactoEmergencia: '+56 9 8111 2233',
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
    admin: 'Administrador / Prevencionista Sernageomin',
    monotoriador: 'Monotoriador Ambiental',
    operador: 'Usuario Normal / Operador de Faena',
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
