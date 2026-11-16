export type SuperAdminDocCategory =
  | 'entregables_p031'
  | 'arquitectura_seguridad'
  | 'cargados';

export interface SuperAdminDocumentItem {
  id: string;
  filename: string;
  title: string;
  category: SuperAdminDocCategory;
  summary: string;
  content: string;
  sizeBytes: number;
  lineCount: number;
  isP031Deliverable: boolean;
  source: 'repo' | 'uploaded';
  updatedAt?: string;
}

export const P031_DELIVERABLE_FILENAMES: readonly string[] = [
  'MINESAFE_CORRECCIONES_P031.md',
  'MINESAFE_RESULTADOS_PRUEBAS.md',
  'MINESAFE_PENDIENTES_EXTERNOS.md',
  'MINESAFE_SEGURIDAD_FIREBASE.md',
  'MINESAFE_EVIDENCIAS_ISO_25010.md',
];

const DELIVERABLE_ORDER_MAP = new Map<string, number>(
  P031_DELIVERABLE_FILENAMES.map((name, idx) => [name.toLowerCase(), idx])
);

export function normalizeDocFilename(rawPathOrName: string): string {
  const cleaned = (rawPathOrName || '').trim().replace(/\\/g, '/');
  const lastSegment = cleaned.split('/').pop() || cleaned;
  return lastSegment;
}

export function extractMarkdownMeta(
  filename: string,
  content: string
): { title: string; summary: string } {
  const lines = content.split(/\r?\n/);
  let title = filename.replace(/\.md$/i, '').replace(/_/g, ' ');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
      break;
    }
  }

  let summary = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('```')
    ) {
      continue;
    }
    const plain = trimmed
      .replace(/^>\s*/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
    if (plain.length > 18) {
      summary = plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
      break;
    }
  }

  return {
    title,
    summary: summary || 'Documento técnico del proyecto MineSafe Web Híbrida.',
  };
}

export function buildSuperAdminDocumentsCatalog(
  rawRepoModules: Record<string, string>,
  uploadedDocs: SuperAdminDocumentItem[] = []
): SuperAdminDocumentItem[] {
  const repoItems: SuperAdminDocumentItem[] = [];

  for (const [rawPath, rawContent] of Object.entries(rawRepoModules || {})) {
    if (typeof rawContent !== 'string') continue;
    const filename = normalizeDocFilename(rawPath);
    if (!filename.toLowerCase().endsWith('.md')) continue;

    const isP031 = DELIVERABLE_ORDER_MAP.has(filename.toLowerCase());
    const { title, summary } = extractMarkdownMeta(filename, rawContent);
    const sizeBytes = new TextEncoder().encode(rawContent).length;
    const lineCount = rawContent.split(/\r?\n/).length;

    repoItems.push({
      id: `repo:${filename}`,
      filename,
      title,
      category: isP031 ? 'entregables_p031' : 'arquitectura_seguridad',
      summary,
      content: rawContent,
      sizeBytes,
      lineCount,
      isP031Deliverable: isP031,
      source: 'repo',
    });
  }

  repoItems.sort((a, b) => {
    const orderA = DELIVERABLE_ORDER_MAP.get(a.filename.toLowerCase());
    const orderB = DELIVERABLE_ORDER_MAP.get(b.filename.toLowerCase());
    if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
    if (orderA !== undefined) return -1;
    if (orderB !== undefined) return 1;
    const aMine = a.filename.toUpperCase().startsWith('MINESAFE_') ? 0 : 1;
    const bMine = b.filename.toUpperCase().startsWith('MINESAFE_') ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.filename.localeCompare(b.filename);
  });

  const normalizedUploaded = uploadedDocs.map((doc) => ({
    ...doc,
    category: 'cargados' as SuperAdminDocCategory,
    source: 'uploaded' as const,
  }));

  return [...repoItems, ...normalizedUploaded];
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' };

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join(' ') });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        const match = ordered
          ? cur.match(/^\d+\.\s+(.+)$/)
          : cur.match(/^[-*]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith('#') ||
        cur.startsWith('```') ||
        cur.startsWith('>') ||
        /^---+$/.test(cur) ||
        /^[-*]\s+/.test(cur) ||
        /^\d+\.\s+/.test(cur) ||
        (cur.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSingleDocumentHtmlExport(doc: SuperAdminDocumentItem): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(doc.filename)} — MineSafe IoT</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 24px; color: #0f172a; line-height: 1.6; }
    header { border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 24px; }
    .meta { color: #475569; font-size: 13px; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="meta">Archivo: ${escapeHtml(doc.filename)} · Líneas: ${doc.lineCount} · Tamaño: ${formatBytesCompact(doc.sizeBytes)}</div>
  </header>
  <pre>${escapeHtml(doc.content)}</pre>
</body>
</html>`;
}

// CRC32 lookup table for browser-native zero-dependency PKZIP archive creation
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchiveUint8Array(
  entries: Array<{ name: string; content: string }>
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = computeCrc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // STORE compression
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const archive = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(eocd, cursor);

  return archive;
}
