import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileText,
  FolderOpen,
  Lock,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildSingleDocumentHtmlExport,
  buildSuperAdminDocumentsCatalog,
  createZipArchiveUint8Array,
  extractMarkdownMeta,
  formatBytesCompact,
  normalizeDocFilename,
  parseMarkdownBlocks,
  SuperAdminDocCategory,
  SuperAdminDocumentItem,
} from '../utils/superAdminDocs';
import { ROOT_MARKDOWN_FILES } from '../data/generatedDocs';

const UPLOADED_DOCS_STORAGE_KEY = 'minesafe_superadmin_uploaded_docs_v1';

type DocFilterCategory = 'all' | SuperAdminDocCategory;

interface SuperAdminDocsViewProps {
  currentUser: UserProfile;
}

function triggerBlobDownload(filename: string, data: BlobPart, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-cyan-300 font-mono text-[12px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function loadStoredUploadedDocs(): SuperAdminDocumentItem[] {
  try {
    const raw = localStorage.getItem(UPLOADED_DOCS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SuperAdminDocumentItem =>
        Boolean(item && typeof item.filename === 'string' && typeof item.content === 'string')
    );
  } catch {
    return [];
  }
}

export const SuperAdminDocsView: React.FC<SuperAdminDocsViewProps> = ({ currentUser }) => {
  const [uploadedDocs, setUploadedDocs] = useState<SuperAdminDocumentItem[]>(() =>
    loadStoredUploadedDocs()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DocFilterCategory>('all');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'success' | 'error' } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(UPLOADED_DOCS_STORAGE_KEY, JSON.stringify(uploadedDocs));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [uploadedDocs]);

  const showNotice = (text: string, tone: 'success' | 'error') => {
    setFeedback({ text, tone });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const allDocuments = useMemo(
    () => buildSuperAdminDocumentsCatalog(ROOT_MARKDOWN_FILES, uploadedDocs),
    [uploadedDocs]
  );

  const p031Documents = useMemo(
    () => allDocuments.filter((doc) => doc.isP031Deliverable),
    [allDocuments]
  );

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allDocuments.filter((doc) => {
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        doc.filename.toLowerCase().includes(q) ||
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q)
      );
    });
  }, [allDocuments, categoryFilter, searchQuery]);

  const [selectedDocId, setSelectedDocId] = useState<string>(() => {
    const firstP031 = allDocuments.find((d) => d.isP031Deliverable);
    return firstP031?.id || allDocuments[0]?.id || '';
  });

  const selectedDoc = useMemo(() => {
    return (
      filteredDocuments.find((d) => d.id === selectedDocId) ||
      allDocuments.find((d) => d.id === selectedDocId) ||
      filteredDocuments[0] ||
      allDocuments[0] ||
      null
    );
  }, [allDocuments, filteredDocuments, selectedDocId]);

  const parsedBlocks = useMemo(() => {
    if (!selectedDoc || viewMode !== 'preview') return [];
    return parseMarkdownBlocks(selectedDoc.content);
  }, [selectedDoc, viewMode]);

  if (currentUser.role !== 'superadmin') {
    return (
      <div className="p-8 text-center bg-slate-900 border border-rose-900/60 rounded-xl max-w-xl mx-auto my-12">
        <Lock className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-2">Acceso Exclusivo de SuperAdministrador</h2>
        <p className="text-sm text-slate-400">
          Esta biblioteca de entregables técnicos y documentación de auditoría P031 está restringida únicamente al SuperAdministrador.
        </p>
      </div>
    );
  }

  const handleDownloadMarkdown = (doc: SuperAdminDocumentItem) => {
    triggerBlobDownload(doc.filename, `\uFEFF${doc.content}`, 'text/markdown;charset=utf-8');
    showNotice(`Descargado ${doc.filename}`, 'success');
  };

  const handleDownloadHtml = (doc: SuperAdminDocumentItem) => {
    const baseName = doc.filename.replace(/\.[^.]+$/, '');
    const html = buildSingleDocumentHtmlExport(doc);
    triggerBlobDownload(`${baseName}.html`, html, 'text/html;charset=utf-8');
    showNotice(`Exportado ${baseName}.html`, 'success');
  };

  const handleDownloadZip = (docs: SuperAdminDocumentItem[], archiveFilename: string) => {
    if (docs.length === 0) {
      showNotice('No hay documentos disponibles para empaquetar.', 'error');
      return;
    }
    const zipBytes = createZipArchiveUint8Array(
      docs.map((doc) => ({ name: doc.filename, content: doc.content }))
    );
    const copy = new Uint8Array(zipBytes.length);
    copy.set(zipBytes);
    triggerBlobDownload(archiveFilename, copy.buffer, 'application/zip');
    showNotice(`Paquete ${archiveFilename} descargado (${docs.length} archivos).`, 'success');
  };

  const handleCopyContent = async (doc: SuperAdminDocumentItem) => {
    try {
      await navigator.clipboard.writeText(doc.content);
      setCopiedId(doc.id);
      setTimeout(() => setCopiedId((prev) => (prev === doc.id ? null : prev)), 2000);
    } catch {
      showNotice('No se pudo copiar al portapapeles en este navegador.', 'error');
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const added: SuperAdminDocumentItem[] = [];
    for (const file of Array.from(files)) {
      const filename = normalizeDocFilename(file.name);
      if (!/\.(md|txt|markdown|json)$/i.test(filename)) {
        showNotice(`Formato no compatible (${filename}). Usa .md, .txt o .json.`, 'error');
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        showNotice(`El archivo ${filename} supera el límite de 2 MB.`, 'error');
        continue;
      }
      const content = await file.text();
      const { title, summary } = extractMarkdownMeta(filename, content);
      const id = `uploaded:${filename}:${Date.now()}`;
      added.push({
        id,
        filename,
        title,
        category: 'cargados',
        summary,
        content,
        sizeBytes: new TextEncoder().encode(content).length,
        lineCount: content.split(/\r?\n/).length,
        isP031Deliverable: false,
        source: 'uploaded',
        updatedAt: new Date().toLocaleString('es-CL'),
      });
    }

    if (added.length > 0) {
      setUploadedDocs((prev) => {
        const filtered = prev.filter(
          (existing) => !added.some((n) => n.filename.toLowerCase() === existing.filename.toLowerCase())
        );
        return [...added, ...filtered];
      });
      setSelectedDocId(added[0].id);
      showNotice(
        added.length === 1
          ? `Documento ${added[0].filename} cargado en tu biblioteca.`
          : `${added.length} documentos cargados en tu biblioteca.`,
        'success'
      );
    }

    e.target.value = '';
  };

  const handleRemoveUploadedDoc = (docId: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
    showNotice('Documento cargado eliminado de esta sesión.', 'success');
  };

  const totalBytes = useMemo(
    () => allDocuments.reduce((acc, doc) => acc + doc.sizeBytes, 0),
    [allDocuments]
  );

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-purple-300 font-medium">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Exclusivo SuperAdministrador</span>
            <span aria-hidden="true">·</span>
            <span>Centro de Descarga Documental</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Entregables Documentales P031 y Reportes Técnicos
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 tabular-nums">
            <span>{p031Documents.length} entregables P031 listos</span>
            <span aria-hidden="true">·</span>
            <span>{allDocuments.length} documentos cargados en total</span>
            <span aria-hidden="true">·</span>
            <span>{formatBytesCompact(totalBytes)} acumulados</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,.json"
            multiple
            onChange={handleUploadFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Cargar documento</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadZip(p031Documents, 'minesafe-entregables-p031.zip')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <FileArchive className="w-4 h-4" />
            <span>Descargar P031 (.zip)</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadZip(allDocuments, 'minesafe-documentacion-completa.zip')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-cyan-700/70 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Descargar todo (.zip)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
            feedback.tone === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-300 hover:text-white text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Split Workspace: Document Index + Document Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        {/* Left Sidebar: Filters & Catalog */}
        <aside className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-800 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar documento o contenido..."
                aria-label="Buscar documentos técnicos"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: `Todos (${allDocuments.length})` },
                  { id: 'entregables_p031', label: `P031 (${p031Documents.length})` },
                  { id: 'arquitectura_seguridad', label: 'Repo' },
                  { id: 'cargados', label: `Cargados (${uploadedDocs.length})` },
                ] as Array<{ id: DocFilterCategory; label: string }>
              ).map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[680px] overflow-y-auto">
            {filteredDocuments.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-medium text-slate-300">
                  No se encontraron documentos para ese filtro.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Restablecer filtros
                </button>
              </div>
            ) : (
              filteredDocuments.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    className={`p-3.5 transition-colors ${
                      isSelected ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDocId(doc.id)}
                        className="text-left flex-1 min-w-0 focus:outline-none"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                          <FileText
                            className={`w-3.5 h-3.5 shrink-0 ${
                              doc.isP031Deliverable ? 'text-purple-400' : 'text-cyan-400'
                            }`}
                          />
                          <span className="font-mono truncate text-slate-300">{doc.filename}</span>
                        </div>
                        <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400 tabular-nums">
                          <span>
                            {doc.isP031Deliverable
                              ? 'Entregable P031'
                              : doc.source === 'uploaded'
                              ? 'Cargado manual'
                              : 'Documento Repo'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBytesCompact(doc.sizeBytes)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{doc.lineCount} lín.</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadMarkdown(doc)}
                        title={`Descargar ${doc.filename}`}
                        aria-label={`Descargar ${doc.filename}`}
                        className="p-2 rounded-lg border border-slate-700/80 bg-slate-950 hover:bg-cyan-950 hover:border-cyan-700 text-slate-300 hover:text-cyan-200 transition-colors shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Reader Pane */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[560px] flex flex-col">
          {!selectedDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold text-white">Selecciona un documento</p>
              <p className="text-xs text-slate-400 max-w-md">
                Elige cualquiera de los entregables P031 o carga un archivo Markdown adicional para previsualizarlo y descargarlo.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                    <span className="font-mono text-cyan-300 font-semibold">
                      {selectedDoc.filename}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytesCompact(selectedDoc.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedDoc.lineCount} líneas</span>
                    {selectedDoc.updatedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{selectedDoc.updatedAt}</span>
                      </>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white truncate">
                    {selectedDoc.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        viewMode === 'preview'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Vista previa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        viewMode === 'raw'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Texto .md</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyContent(selectedDoc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedId === selectedDoc.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadHtml(selectedDoc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Descargar .html</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadMarkdown(selectedDoc)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar .md</span>
                  </button>

                  {selectedDoc.source === 'uploaded' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUploadedDoc(selectedDoc.id)}
                      title="Quitar documento cargado"
                      className="p-2 rounded-lg border border-rose-800/70 bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto max-h-[680px]">
                {viewMode === 'raw' ? (
                  <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {selectedDoc.content}
                  </pre>
                ) : (
                  <article className="space-y-4 text-sm text-slate-300 leading-relaxed max-w-4xl">
                    {parsedBlocks.map((block, index) => {
                      if (block.type === 'hr') {
                        return <hr key={index} className="border-slate-800 my-4" />;
                      }
                      if (block.type === 'heading') {
                        if (block.level === 1) {
                          return (
                            <h2
                              key={index}
                              className="text-xl font-bold text-white tracking-tight pt-1"
                            >
                              {renderInlineMarkdown(block.text)}
                            </h2>
                          );
                        }
                        if (block.level === 2) {
                          return (
                            <h3
                              key={index}
                              className="text-base font-bold text-cyan-300 pt-3 border-t border-slate-800/80"
                            >
                              {renderInlineMarkdown(block.text)}
                            </h3>
                          );
                        }
                        return (
                          <h4 key={index} className="text-sm font-semibold text-white pt-2">
                            {renderInlineMarkdown(block.text)}
                          </h4>
                        );
                      }
                      if (block.type === 'blockquote') {
                        return (
                          <blockquote
                            key={index}
                            className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs sm:text-sm"
                          >
                            {renderInlineMarkdown(block.text)}
                          </blockquote>
                        );
                      }
                      if (block.type === 'code') {
                        return (
                          <pre
                            key={index}
                            className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap"
                          >
                            {block.code}
                          </pre>
                        );
                      }
                      if (block.type === 'list') {
                        const ListTag = block.ordered ? 'ol' : 'ul';
                        return (
                          <ListTag
                            key={index}
                            className={`space-y-1.5 pl-5 ${
                              block.ordered ? 'list-decimal' : 'list-disc'
                            } text-slate-300`}
                          >
                            {block.items.map((item, itemIdx) => (
                              <li key={itemIdx}>{renderInlineMarkdown(item)}</li>
                            ))}
                          </ListTag>
                        );
                      }
                      if (block.type === 'table') {
                        return (
                          <div
                            key={index}
                            className="overflow-x-auto rounded-lg border border-slate-800"
                          >
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="bg-slate-950 text-slate-200 border-b border-slate-800">
                                <tr>
                                  {block.headers.map((header, hIdx) => (
                                    <th key={hIdx} className="px-3 py-2.5 font-semibold">
                                      {renderInlineMarkdown(header)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/80">
                                {block.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-800/30">
                                    {row.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="px-3 py-2.5 text-slate-300 align-top"
                                      >
                                        {renderInlineMarkdown(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      }
                      return (
                        <p key={index} className="text-slate-300">
                          {renderInlineMarkdown(block.text)}
                        </p>
                      );
                    })}
                  </article>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SuperAdminDocsView;
