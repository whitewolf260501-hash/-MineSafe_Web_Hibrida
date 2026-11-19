import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { Organization, UserProfile } from '../types';
import {
  DEFAULT_ORGANIZATION,
  deleteOrganizationFromRTDB,
  saveOrganizationToRTDB,
} from '../services/firebase';
import { soundAlert } from '../services/audioAlert';
import { isPlaceholderRut, validateChileanRut } from '../utils/rut';

interface OrganizationsManagerPanelProps {
  currentUser: UserProfile;
  organizations: Organization[];
  activeOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
  onOrganizationsChanged?: (org: Organization, deletedId?: string) => void;
}

export const OrganizationsManagerPanel: React.FC<OrganizationsManagerPanelProps> = ({
  currentUser,
  organizations,
  activeOrganizationId = 'all',
  onSelectOrganization,
  onOrganizationsChanged,
}) => {
  const canManageOrgs =
    currentUser.role === 'superadmin' ||
    currentUser.role === 'admin_minesafe' ||
    currentUser.role === 'admin';
  const canDeleteAnyOrg =
    currentUser.role === 'superadmin' || currentUser.role === 'admin_minesafe';
  const canViewAllOrganizations =
    currentUser.role === 'superadmin' || currentUser.role === 'admin_minesafe';

  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgRut, setOrgRut] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Minería Subterránea & Rajo');
  const [orgStatus, setOrgStatus] = useState<'activa' | 'suspendida'>('activa');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const showNotice = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageOrgs) {
      showNotice('error', 'No tienes permisos para crear o editar organizaciones.');
      return;
    }
    if (!orgName.trim()) {
      showNotice('error', 'El nombre de la organización es obligatorio.');
      return;
    }
    let formattedOrgRut = '';
    if (!isPlaceholderRut(orgRut)) {
      const rutCheck = validateChileanRut(orgRut);
      if (!rutCheck.valid) {
        showNotice('error', rutCheck.error || 'El RUT de empresa no es válido según Módulo 11.');
        return;
      }
      formattedOrgRut = rutCheck.formatted!;
    }
    setIsSaving(true);
    try {
      const existing = editingOrgId ? organizations.find((o) => o.id === editingOrgId) : undefined;
      const cleanId =
        editingOrgId ||
        `org-${orgName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;
      const payload: Organization = {
        id: cleanId,
        name: orgName.trim(),
        rut: formattedOrgRut,
        industry: orgIndustry.trim() || 'Minería',
        status: orgStatus,
        createdAt: existing?.createdAt || Date.now(),
        ownerUid: existing?.ownerUid || currentUser.id,
      };
      await saveOrganizationToRTDB(payload, currentUser);
      onOrganizationsChanged?.(payload);
      soundAlert.playFeedbackBeep();
      showNotice(
        'success',
        editingOrgId
          ? `Organización "${orgName.trim()}" actualizada en Firebase RTDB.`
          : `Organización "${orgName.trim()}" creada en Firebase RTDB.`
      );
      setEditingOrgId(null);
      setOrgName('');
      setOrgRut('');
      setOrgIndustry('Minería Subterránea & Rajo');
      setOrgStatus('activa');
    } catch (err: any) {
      showNotice('error', err?.message || 'Error al guardar organización en Firebase RTDB.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrg = async (org: Organization) => {
    if (!canDeleteAnyOrg && org.ownerUid !== currentUser.id) {
      showNotice('error', 'No tienes permisos para eliminar esta organización.');
      return;
    }
    setIsSaving(true);
    try {
      await deleteOrganizationFromRTDB(org.id, currentUser);
      onOrganizationsChanged?.(org, org.id);
      if (activeOrganizationId === org.id && onSelectOrganization) {
        onSelectOrganization(canViewAllOrganizations ? 'all' : currentUser.organizationId || DEFAULT_ORGANIZATION.id);
      }
      soundAlert.playFeedbackBeep();
      showNotice('success', `Organización "${org.name}" eliminada.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'No se pudo eliminar la organización.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {canManageOrgs && (
          <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  {editingOrgId ? 'Editar Organización' : 'Nueva Empresa / Organización'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Crea y administra empresas mandantes o divisiones para filtrar faenas, usuarios, dispositivos y alertas en modo multi-empresa.
                </p>
              </div>
              {editingOrgId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrgId(null);
                    setOrgName('');
                    setOrgRut('');
                    setOrgIndustry('Minería Subterránea & Rajo');
                    setOrgStatus('activa');
                  }}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <form onSubmit={handleSaveOrg} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Nombre Comercial / Faena Mandante
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ej: Minera Los Bronces División Sur"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    RUT Empresa (Módulo 11)
                  </label>
                  <input
                    type="text"
                    value={orgRut}
                    onChange={(e) => setOrgRut(e.target.value)}
                    onBlur={() => {
                      const res = validateChileanRut(orgRut);
                      if (res.valid && res.formatted) setOrgRut(res.formatted);
                    }}
                    placeholder="76.543.210-3"
                    className={`w-full px-3 py-2 rounded-lg bg-slate-950 border text-white font-mono ${
                      orgRut.trim() && !isPlaceholderRut(orgRut)
                        ? validateChileanRut(orgRut).valid
                          ? 'border-emerald-500/70 focus:border-emerald-400'
                          : 'border-rose-500/80 focus:border-rose-400'
                        : 'border-slate-700'
                    }`}
                  />
                  {orgRut.trim() && !isPlaceholderRut(orgRut) && (() => {
                    const res = validateChileanRut(orgRut);
                    return (
                      <p className={`mt-1 text-[10px] ${res.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {res.valid
                          ? `✓ RUT válido (${res.formatted})`
                          : res.expectedVerifierDigit
                          ? `✗ DV inválido (esperado: ${res.expectedVerifierDigit})`
                          : `✗ ${res.error}`}
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Estado Operativo</label>
                  <select
                    value={orgStatus}
                    onChange={(e) => setOrgStatus(e.target.value as 'activa' | 'suspendida')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  >
                    <option value="activa">Activa</option>
                    <option value="suspendida">Suspendida</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Rubro / Tipo de Operación
                </label>
                <input
                  type="text"
                  value={orgIndustry}
                  onChange={(e) => setOrgIndustry(e.target.value)}
                  placeholder="Minería Subterránea & Rajo"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {editingOrgId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>
                  {isSaving
                    ? 'Guardando en Firebase RTDB...'
                    : editingOrgId
                    ? 'Guardar Cambios de Organización'
                    : 'Registrar Organización en RTDB'}
                </span>
              </button>
            </form>
          </div>
        )}

        <div
          className={`${
            canManageOrgs ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4`}
        >
          <div className="pb-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                Organizaciones Registradas ({organizations.length})
              </h3>
              <p className="text-[11px] text-slate-400">
                Cambia el contexto activo para filtrar el dashboard, equipos, usuarios y faenas por empresa.
              </p>
            </div>
            {onSelectOrganization && canViewAllOrganizations && (
              <button
                type="button"
                onClick={() => onSelectOrganization('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  activeOrganizationId === 'all'
                    ? 'bg-cyan-600 text-white border-cyan-400'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-cyan-500'
                }`}
              >
                Ver Todas las Empresas
              </button>
            )}
          </div>

          <div className="space-y-3">
            {organizations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl">
                No hay organizaciones registradas visibles en tu alcance actual.
              </div>
            ) : (
              organizations.map((org) => {
                const isSelectedOrg = activeOrganizationId === org.id;
                const isDefaultOrg = org.id === DEFAULT_ORGANIZATION.id;
                const canDeleteThisOrg =
                  !isDefaultOrg && (canDeleteAnyOrg || org.ownerUid === currentUser.id);
                return (
                  <div
                    key={org.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isSelectedOrg
                        ? 'bg-cyan-950/40 border-cyan-500'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-white">{org.name}</span>
                          {isDefaultOrg && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700">
                              Principal
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                              org.status === 'activa'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-rose-950 text-rose-300 border-rose-700'
                            }`}
                          >
                            {org.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap gap-3">
                          <span>ID: {org.id}</span>
                          {org.rut && <span>RUT: {org.rut}</span>}
                          {org.industry && <span>Rubro: {org.industry}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onSelectOrganization && (
                          <button
                            type="button"
                            onClick={() => onSelectOrganization(org.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                              isSelectedOrg
                                ? 'bg-cyan-600 text-white border-cyan-400'
                                : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-slate-700'
                            }`}
                          >
                            {isSelectedOrg ? 'Contexto Activo' : 'Activar Filtro'}
                          </button>
                        )}
                        {canManageOrgs && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrgId(org.id);
                              setOrgName(org.name);
                              setOrgRut(org.rut || '');
                              setOrgIndustry(org.industry || 'Minería');
                              setOrgStatus(org.status || 'activa');
                            }}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                            title="Editar organización"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteThisOrg && (
                          <button
                            type="button"
                            onClick={() => handleDeleteOrg(org)}
                            disabled={isSaving}
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 disabled:opacity-50"
                            title="Eliminar organización"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
