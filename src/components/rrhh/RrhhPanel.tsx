"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { EntityLogo } from "@/components/EntityLogo";
import {
  AdmisionEditor,
  DeleteConfirmDialog,
  HireAdmisionDialog,
  SectionDeleteActions,
  StaffEditor,
  type AdmisionFormValues,
  type StaffFormValues,
} from "@/components/rrhh/HrDialogs";
import { StaffNameLink } from "@/components/rrhh/StaffNameLink";
import {
  ADMISION_LABELS,
  DEFAULT_ONBOARDING,
  ESTADO_LABORAL_LABELS,
  formatDateEs,
  type Admision,
  type StaffMember,
} from "@/lib/crm/rrhh";
import {
  deleteRrhhFile,
  uploadCv,
  uploadStaffPhoto,
  validatePdfFile,
  validatePhotoFile,
} from "@/lib/crm/rrhhStorage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

type SortMode = "default" | "az" | "za";
export type RrhhSection = "plantilla" | "admisiones";

export function RrhhPanel({
  section,
  staff,
  admisiones,
  loading,
  onRefresh,
}: {
  section: RrhhSection;
  staff: StaffMember[];
  admisiones: Admision[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("default");
  const [staffEditorOpen, setStaffEditorOpen] = useState(false);
  const [admisionEditorOpen, setAdmisionEditorOpen] = useState(false);
  const [hireTarget, setHireTarget] = useState<Admision | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmDeleteOpen(false);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    exitSelectMode();
  }, [section]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = staff.filter((member) => {
      if (!query) return true;
      return [member.nombre, member.email, member.cargo, member.telefono, member.estado_laboral]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    if (sort === "az") return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (sort === "za") return [...list].sort((a, b) => b.nombre.localeCompare(a.nombre, "es"));
    return list;
  }, [staff, search, sort]);

  const filteredAdmisiones = useMemo(() => {
    const query = search.trim().toLowerCase();
    return admisiones.filter((item) => {
      if (!query) return true;
      return [item.nombre, item.email, item.puesto, item.estado].join(" ").toLowerCase().includes(query);
    });
  }, [admisiones, search]);

  const existingEmails = staff.filter((s) => s.email).map((s) => s.email as string);

  const showNotice = (type: "success" | "error", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const handleSaveStaff = async (values: StaffFormValues) => {
    setSaving(true);
    const { data, error } = await supabase
      .from("personas")
      .insert({
        nombre: values.nombre,
        email: values.email || null,
        cargo: values.cargo || null,
        telefono: values.telefono || null,
        notas: values.notas || null,
        estado_laboral: values.estado_laboral,
        fecha_alta: values.fecha_alta || null,
        es_interno: true,
        empresa_id: null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      showNotice("error", "No se ha podido crear la ficha.");
      return;
    }

    if (values.fotoFile) {
      const photoError = validatePhotoFile(values.fotoFile);
      if (photoError) {
        setSaving(false);
        showNotice("error", `Ficha creada, pero la foto no es válida: ${photoError}`);
        setStaffEditorOpen(false);
        onRefresh();
        return;
      }
      try {
        const fotoUrl = await uploadStaffPhoto(supabase, data.id, values.fotoFile);
        await supabase.from("personas").update({ foto_url: fotoUrl }).eq("id", data.id);
      } catch {
        setSaving(false);
        showNotice("error", "Ficha creada, pero no se pudo subir la foto.");
        setStaffEditorOpen(false);
        onRefresh();
        return;
      }
    }

    await supabase.from("rrhh_onboarding").insert(
      DEFAULT_ONBOARDING.map((titulo, orden) => ({
        persona_id: data.id,
        titulo,
        orden,
      })),
    );

    setSaving(false);
    setStaffEditorOpen(false);
    showNotice("success", `Ficha de «${values.nombre}» creada.`);
    onRefresh();
  };

  const handleSaveAdmision = async (values: AdmisionFormValues) => {
    setSaving(true);
    const { data, error } = await supabase
      .from("rrhh_admisiones")
      .insert({
        nombre: values.nombre,
        email: values.email || null,
        telefono: values.telefono || null,
        puesto: values.puesto || null,
        notas: values.notas || null,
        estado: "en_proceso",
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      showNotice("error", "No se ha podido crear la admisión.");
      return;
    }

    if (values.cvFile) {
      const isPdf = values.cvFile.type === "application/pdf";
      const fileError = isPdf ? validatePdfFile(values.cvFile) : validatePhotoFile(values.cvFile);
      if (fileError) {
        setSaving(false);
        showNotice("error", `Admisión creada, pero el CV no es válido: ${fileError}`);
        setAdmisionEditorOpen(false);
        onRefresh();
        return;
      }
      try {
        const cvUrl = await uploadCv(supabase, data.id, values.cvFile);
        await supabase.from("rrhh_admisiones").update({ cv_url: cvUrl }).eq("id", data.id);
      } catch {
        setSaving(false);
        showNotice("error", "Admisión creada, pero no se pudo subir el CV.");
        setAdmisionEditorOpen(false);
        onRefresh();
        return;
      }
    }

    setSaving(false);
    setAdmisionEditorOpen(false);
    showNotice("success", `Admisión de «${values.nombre}» creada.`);
    onRefresh();
  };

  const handleHire = async () => {
    if (!hireTarget) return;
    setSaving(true);

    const { data: person, error } = await supabase
      .from("personas")
      .insert({
        nombre: hireTarget.nombre,
        email: hireTarget.email || null,
        telefono: hireTarget.telefono || null,
        cargo: hireTarget.puesto || null,
        notas: hireTarget.notas || null,
        es_interno: true,
        empresa_id: null,
        estado_laboral: "activo",
        fecha_alta: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (error || !person) {
      setSaving(false);
      showNotice("error", "No se ha podido contratar al candidato.");
      return;
    }

    await supabase
      .from("rrhh_admisiones")
      .update({ estado: "contratado", persona_id: person.id })
      .eq("id", hireTarget.id);

    await supabase.from("rrhh_onboarding").insert(
      DEFAULT_ONBOARDING.map((titulo, orden) => ({
        persona_id: person.id,
        titulo,
        orden,
      })),
    );

    setSaving(false);
    setHireTarget(null);
    showNotice("success", `«${hireTarget.nombre}» contratado. Ficha y checklist creados.`);
    onRefresh();
  };

  const handleDiscard = async (admision: Admision) => {
    const { error } = await supabase.from("rrhh_admisiones").update({ estado: "descartado" }).eq("id", admision.id);
    if (error) {
      showNotice("error", "No se ha podido actualizar la admisión.");
      return;
    }
    showNotice("success", `Admisión de «${admision.nombre}» descartada.`);
    onRefresh();
  };

  const confirmDeleteAdmisiones = async () => {
    const targets = admisiones.filter((item) => selectedIds.has(item.id));
    if (!targets.length) return;
    setDeleting(true);
    const ids = targets.map((item) => item.id);
    const { error } = await supabase.from("rrhh_admisiones").delete().in("id", ids);
    if (error) {
      setDeleting(false);
      showNotice("error", "No se ha podido eliminar la admisión.");
      return;
    }
    await Promise.all(
      targets.map(async (item) => {
        try {
          await deleteRrhhFile(supabase, item.cv_url);
        } catch {
          /* registro ya borrado */
        }
      }),
    );
    setDeleting(false);
    showNotice(
      "success",
      targets.length === 1
        ? `Admisión de «${targets[0].nombre}» eliminada.`
        : `${targets.length} admisiones eliminadas.`,
    );
    exitSelectMode();
    onRefresh();
  };

  const isPlantilla = section === "plantilla";

  return (
    <section aria-label={isPlantilla ? "Plantilla" : "Admisiones"}>
      {notice ? (
        <div className={`notice notice-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}

      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <div className="search-field">
            <label htmlFor={isPlantilla ? "search-plantilla" : "search-admisiones"}>
              {isPlantilla ? "Buscar en plantilla" : "Buscar en admisiones"}
            </label>
            <div className="directory-search-box search-box">
              <span className="search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <input
                id={isPlantilla ? "search-plantilla" : "search-admisiones"}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={isPlantilla ? "Ej.: María López…" : "Ej.: Ana García…"}
              />
            </div>
          </div>
          {isPlantilla ? (
            <div className="sort-controls" role="group" aria-label="Orden de plantilla">
              <span className="sort-label">Orden:</span>
              {(
                [
                  ["default", "Por defecto"],
                  ["az", "A → Z"],
                  ["za", "Z → A"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`sort-chip ${sort === value ? "active" : ""}`}
                  onClick={() => setSort(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="crm-toolbar-actions">
          {isPlantilla ? (
            <button type="button" className="btn btn-primary" onClick={() => setStaffEditorOpen(true)}>
              + Nueva ficha
            </button>
          ) : (
            <>
              {!selectMode ? (
                <button type="button" className="btn btn-primary" onClick={() => setAdmisionEditorOpen(true)}>
                  + Nueva admisión
                </button>
              ) : null}
              <SectionDeleteActions
                selectMode={selectMode}
                selectedCount={selectedIds.size}
                disabled={deleting || saving || loading}
                canEnter={filteredAdmisiones.length > 0}
                onEnterSelect={() => {
                  setSelectMode(true);
                  setSelectedIds(new Set());
                }}
                onCancel={exitSelectMode}
                onRequestDelete={() => setConfirmDeleteOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {isPlantilla ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th scope="col">Trabajador</th>
                <th scope="col">Puesto</th>
                <th scope="col">Estado</th>
                <th scope="col">Alta</th>
                <th scope="col">Email</th>
                <th scope="col">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="crm-table-empty">
                    Cargando...
                  </td>
                </tr>
              ) : filteredStaff.length ? (
                filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <StaffNameLink id={member.id}>
                        <EntityLogo name={member.nombre} logoUrl={member.foto_url} size="sm" />
                        <span>{member.nombre}</span>
                      </StaffNameLink>
                    </td>
                    <td className="crm-table-muted">{member.cargo || "—"}</td>
                    <td>
                      <span className={`rrhh-status rrhh-status-${member.estado_laboral}`}>
                        {ESTADO_LABORAL_LABELS[member.estado_laboral]}
                      </span>
                    </td>
                    <td className="crm-table-muted">{formatDateEs(member.fecha_alta)}</td>
                    <td className="crm-table-muted">{member.email || "—"}</td>
                    <td className="crm-table-muted">{member.telefono || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="crm-table-empty">
                    <EmptyState
                      title={search.trim() ? "Ningún trabajador coincide" : "Todavía no hay plantilla"}
                      description={
                        search.trim()
                          ? "Prueba otra búsqueda o limpia el filtro."
                          : "Crea una ficha o contrata desde Admisiones."
                      }
                      action={
                        !search.trim() ? (
                          <button type="button" className="btn btn-primary" onClick={() => setStaffEditorOpen(true)}>
                            + Nueva ficha
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`crm-table-wrap${selectMode ? " rrhh-select-mode" : ""}`}>
          {selectMode ? (
            <p className="rrhh-select-hint">Selecciona las admisiones que quieres eliminar.</p>
          ) : null}
          <table className="crm-table">
            <thead>
              <tr>
                {selectMode ? <th scope="col">Seleccionar</th> : null}
                <th scope="col">Candidato</th>
                <th scope="col">Puesto</th>
                <th scope="col">Estado</th>
                <th scope="col">Email</th>
                <th scope="col">CV</th>
                {!selectMode ? <th scope="col">Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={selectMode ? 6 : 6} className="crm-table-empty">
                    Cargando...
                  </td>
                </tr>
              ) : filteredAdmisiones.length ? (
                filteredAdmisiones.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={selectMode ? `rrhh-select-row${isSelected ? " is-selected" : ""}` : undefined}
                    >
                      {selectMode ? (
                        <td>
                          <input
                            type="checkbox"
                            className="rrhh-select-check"
                            checked={isSelected}
                            onChange={() => toggleSelected(item.id)}
                            aria-label={`Seleccionar a ${item.nombre}`}
                          />
                        </td>
                      ) : null}
                      <td>
                        {item.persona_id ? (
                          <StaffNameLink id={item.persona_id}>
                            <EntityLogo name={item.nombre} size="sm" />
                            <span>{item.nombre}</span>
                          </StaffNameLink>
                        ) : (
                          <div className="crm-table-link">
                            <EntityLogo name={item.nombre} size="sm" />
                            <span>{item.nombre}</span>
                          </div>
                        )}
                      </td>
                      <td className="crm-table-muted">{item.puesto || "—"}</td>
                      <td>
                        <span className={`rrhh-status rrhh-status-${item.estado}`}>
                          {ADMISION_LABELS[item.estado]}
                        </span>
                      </td>
                      <td className="crm-table-muted">{item.email || "—"}</td>
                      <td className="crm-table-muted">
                        {item.cv_url ? (
                          <a
                            href={item.cv_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => selectMode && event.preventDefault()}
                          >
                            Ver CV
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      {!selectMode ? (
                        <td>
                          <div className="rrhh-row-actions">
                            {item.estado === "en_proceso" ? (
                              <>
                                <button type="button" className="btn btn-soft" onClick={() => setHireTarget(item)}>
                                  Contratar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger-soft"
                                  onClick={() => handleDiscard(item)}
                                >
                                  Descartar
                                </button>
                              </>
                            ) : item.persona_id ? (
                              <Link href={`/rrhh/${item.persona_id}`} className="btn btn-soft">
                                Ver ficha
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="crm-table-empty">
                    <EmptyState
                      title={search.trim() ? "Ninguna admisión coincide" : "Todavía no hay admisiones"}
                      description={
                        search.trim()
                          ? "Prueba otra búsqueda o limpia el filtro."
                          : "Registra un candidato para seguir el proceso de selección."
                      }
                      action={
                        !search.trim() ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setAdmisionEditorOpen(true)}
                          >
                            + Nueva admisión
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {staffEditorOpen ? (
        <StaffEditor
          staff={null}
          existingEmails={existingEmails}
          saving={saving}
          onSave={handleSaveStaff}
          onClose={() => setStaffEditorOpen(false)}
        />
      ) : null}

      {admisionEditorOpen ? (
        <AdmisionEditor
          saving={saving}
          onSave={handleSaveAdmision}
          onClose={() => setAdmisionEditorOpen(false)}
        />
      ) : null}

      {hireTarget ? (
        <HireAdmisionDialog
          admision={hireTarget}
          hiring={saving}
          onConfirm={handleHire}
          onClose={() => setHireTarget(null)}
        />
      ) : null}

      {confirmDeleteOpen && selectedIds.size > 0 ? (
        <DeleteConfirmDialog
          heading={
            selectedIds.size === 1
              ? "¿Eliminar 1 admisión seleccionada?"
              : `¿Eliminar ${selectedIds.size} admisiones seleccionadas?`
          }
          detail="Se borrarán los registros y los CV asociados en el almacenamiento."
          confirmLabel={selectedIds.size === 1 ? "Sí, eliminar admisión" : "Sí, eliminar admisiones"}
          deleting={deleting}
          onConfirm={confirmDeleteAdmisiones}
          onClose={() => setConfirmDeleteOpen(false)}
        />
      ) : null}
    </section>
  );
}
