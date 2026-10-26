"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  DeleteConfirmDialog,
  SectionDeleteActions,
  VacacionDialog,
} from "@/components/rrhh/HrDialogs";
import { StaffNameLink } from "@/components/rrhh/StaffNameLink";
import {
  formatDateEs,
  VACACION_LABELS,
  type StaffMember,
  type Vacacion,
  type VacacionEstado,
} from "@/lib/crm/rrhh";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

export type VacacionRow = Vacacion & {
  persona_nombre: string;
  persona_cargo: string | null;
};

type EstadoFiltro = "todos" | VacacionEstado;

type EmployeeGroup = {
  persona_id: string;
  persona_nombre: string;
  persona_cargo: string | null;
  vacaciones: VacacionRow[];
};

function daysBetween(inicio: string, fin: string) {
  const start = new Date(`${inicio}T12:00:00`);
  const end = new Date(`${fin}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return days === 1 ? "1 día" : `${days} días`;
}

function toggleId(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function matchesNameQuery(nombre: string, cargo: string | null, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [nombre, cargo].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q);
}

function vacacionMatchesFilters(
  item: VacacionRow,
  estado: EstadoFiltro,
  desde: string,
  hasta: string,
) {
  if (estado !== "todos" && item.estado !== estado) return false;
  // Solapamiento con el rango: la solicitud toca el periodo filtrado
  if (desde && item.fecha_fin < desde) return false;
  if (hasta && item.fecha_inicio > hasta) return false;
  return true;
}

export function VacacionesPanel({
  vacaciones,
  staff,
  loading,
  onRefresh,
}: {
  vacaciones: VacacionRow[];
  staff: StaffMember[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [nameQuery, setNameQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addTarget, setAddTarget] = useState<StaffMember | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const hasDateOrEstadoFilters = Boolean(estado !== "todos" || desde || hasta);
  const hasNameQuery = Boolean(nameQuery.trim());
  const hasAnyConstraint = hasDateOrEstadoFilters || hasNameQuery;

  const groups = useMemo(() => {
    const byPerson = new Map<string, VacacionRow[]>();
    for (const item of vacaciones) {
      if (!vacacionMatchesFilters(item, estado, desde, hasta)) continue;
      const list = byPerson.get(item.persona_id) ?? [];
      list.push(item);
      byPerson.set(item.persona_id, list);
    }

    const activeStaff = staff
      .filter((member) => member.estado_laboral === "activo")
      .filter((member) => matchesNameQuery(member.nombre, member.cargo, nameQuery))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const result: EmployeeGroup[] = [];

    for (const member of activeStaff) {
      const personVacaciones = (byPerson.get(member.id) ?? []).sort((a, b) =>
        b.fecha_inicio.localeCompare(a.fecha_inicio),
      );
      if (hasDateOrEstadoFilters && personVacaciones.length === 0) continue;
      result.push({
        persona_id: member.id,
        persona_nombre: member.nombre,
        persona_cargo: member.cargo,
        vacaciones: personVacaciones,
      });
    }

    if (hasDateOrEstadoFilters || !staff.length) {
      for (const [personaId, list] of byPerson) {
        if (result.some((g) => g.persona_id === personaId)) continue;
        const sample = list[0];
        if (!matchesNameQuery(sample.persona_nombre, sample.persona_cargo, nameQuery)) continue;
        result.push({
          persona_id: personaId,
          persona_nombre: sample.persona_nombre,
          persona_cargo: sample.persona_cargo,
          vacaciones: [...list].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)),
        });
      }
      result.sort((a, b) => a.persona_nombre.localeCompare(b.persona_nombre, "es", { sensitivity: "base" }));
    }

    return result;
  }, [vacaciones, staff, nameQuery, estado, desde, hasta, hasDateOrEstadoFilters]);

  const visibleCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.vacaciones.length, 0),
    [groups],
  );

  const clearFilters = () => {
    setEstado("todos");
    setDesde("");
    setHasta("");
  };

  const showNotice = (type: "success" | "error", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const updateEstado = async (id: string, next: VacacionEstado) => {
    setSavingId(id);
    const { error } = await supabase.from("rrhh_vacaciones").update({ estado: next }).eq("id", id);
    setSavingId(null);
    if (error) {
      showNotice("error", "No se ha podido actualizar la solicitud.");
      return;
    }
    showNotice("success", next === "aprobada" ? "Vacaciones aprobadas." : "Solicitud rechazada.");
    onRefresh();
  };

  const handleAddVacacion = async (values: {
    fecha_inicio: string;
    fecha_fin: string;
    motivo: string;
  }) => {
    if (!addTarget) return;
    setSaving(true);
    const { error } = await supabase.from("rrhh_vacaciones").insert({
      persona_id: addTarget.id,
      fecha_inicio: values.fecha_inicio,
      fecha_fin: values.fecha_fin,
      motivo: values.motivo || null,
      estado: "pendiente",
    });
    setSaving(false);
    if (error) {
      showNotice("error", "No se han podido guardar las vacaciones.");
      return;
    }
    setAddTarget(null);
    showNotice("success", `Vacaciones añadidas para ${addTarget.nombre}.`);
    onRefresh();
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmOpen(false);
  };

  const confirmDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setDeleting(true);
    const { error } = await supabase.from("rrhh_vacaciones").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      showNotice("error", "No se ha podido eliminar la solicitud de vacaciones.");
      return;
    }
    exitSelectMode();
    showNotice(
      "success",
      ids.length === 1 ? "Solicitud de vacaciones eliminada." : `${ids.length} solicitudes eliminadas.`,
    );
    onRefresh();
  };

  const selectedCount = selectedIds.size;
  const busy = deleting || loading || saving || savingId !== null;

  return (
    <section aria-label="Vacaciones" className={selectMode ? "rrhh-select-mode" : undefined}>
      {notice ? (
        <div className={`notice notice-${notice.type}`} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}

      <div className="crm-toolbar rrhh-filters fichajes-filters-top">
        <div className="rrhh-filter-grid fichajes-filter-grid">
          <div className="form-field fichajes-name-search">
            <label htmlFor="vac-buscar-empleado">Buscar empleado</label>
            <div className="staff-search-control">
              <input
                id="vac-buscar-empleado"
                type="search"
                value={nameQuery}
                placeholder="Ej.: María López…"
                autoComplete="off"
                onChange={(event) => setNameQuery(event.target.value)}
              />
              {nameQuery ? (
                <button
                  type="button"
                  className="staff-search-clear"
                  onClick={() => setNameQuery("")}
                  aria-label="Limpiar búsqueda"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="vac-estado">Estado</label>
            <select
              id="vac-estado"
              value={estado}
              onChange={(event) => setEstado(event.target.value as EstadoFiltro)}
            >
              <option value="todos">Todos</option>
              <option value="pendiente">{VACACION_LABELS.pendiente}</option>
              <option value="aprobada">{VACACION_LABELS.aprobada}</option>
              <option value="rechazada">{VACACION_LABELS.rechazada}</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="vac-desde">Desde</label>
            <input
              id="vac-desde"
              type="date"
              value={desde}
              onChange={(event) => {
                const value = event.target.value;
                setDesde(value);
                if (hasta && value && hasta < value) setHasta(value);
              }}
            />
          </div>

          <div className="form-field">
            <label htmlFor="vac-hasta">Hasta</label>
            <input
              id="vac-hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(event) => setHasta(event.target.value)}
            />
          </div>
        </div>

        <div className="rrhh-filter-actions">
          {!selectMode ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearFilters}
              disabled={!hasDateOrEstadoFilters}
            >
              Limpiar filtros
            </button>
          ) : null}
          <SectionDeleteActions
            selectMode={selectMode}
            selectedCount={selectedCount}
            disabled={busy}
            canEnter={visibleCount > 0}
            enterLabel="Eliminar vacaciones"
            onEnterSelect={() => {
              setSelectMode(true);
              setSelectedIds(new Set());
            }}
            onCancel={exitSelectMode}
            onRequestDelete={() => setConfirmOpen(true)}
          />
        </div>
      </div>

      {hasDateOrEstadoFilters ? (
        <p className="fichajes-filter-summary" role="status">
          Mostrando vacaciones
          {estado !== "todos" ? ` ${VACACION_LABELS[estado].toLowerCase()}` : ""}
          {desde || hasta ? ` del ${desde || "…"} al ${hasta || "…"}` : ""}
          {` · ${groups.length} empleado${groups.length === 1 ? "" : "s"} · ${visibleCount} solicitud${visibleCount === 1 ? "" : "es"}`}
        </p>
      ) : null}

      {selectMode ? (
        <p className="rrhh-select-hint">Selecciona las solicitudes que quieres eliminar.</p>
      ) : null}

      <div className="fichajes-employee-list">
        {loading ? (
          <p className="fichajes-loading" role="status">
            Cargando vacaciones…
          </p>
        ) : groups.length ? (
          groups.map((group) => {
            const count = group.vacaciones.length;
            const countLabel = count === 1 ? "1 solicitud" : `${count} solicitudes`;
            const member = staff.find((item) => item.id === group.persona_id) ?? null;
            return (
              <article key={group.persona_id} className="fichajes-employee-card">
                <header className="fichajes-employee-header">
                  <div className="fichajes-employee-identity">
                    <h2 className="fichajes-employee-name">
                      <StaffNameLink id={group.persona_id}>{group.persona_nombre}</StaffNameLink>
                    </h2>
                    {group.persona_cargo ? (
                      <p className="fichajes-employee-role">{group.persona_cargo}</p>
                    ) : null}
                  </div>
                  <div className="fichajes-employee-actions">
                    <span className="fichajes-count" aria-label={countLabel}>
                      {countLabel}
                    </span>
                    {!selectMode && member ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setAddTarget(member)}
                        disabled={busy}
                      >
                        Añadir vacaciones
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="crm-table-wrap fichajes-card-table">
                  {group.vacaciones.length ? (
                    <table className="crm-table">
                      <thead>
                        <tr>
                          {selectMode ? <th scope="col">Seleccionar</th> : null}
                          <th scope="col">Desde</th>
                          <th scope="col">Hasta</th>
                          <th scope="col">Días</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Motivo</th>
                          {!selectMode ? <th scope="col">Acciones</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {group.vacaciones.map((item) => {
                          const isSelected = selectedIds.has(item.id);
                          return (
                            <tr
                              key={item.id}
                              className={
                                selectMode ? `rrhh-select-row${isSelected ? " is-selected" : ""}` : undefined
                              }
                            >
                              {selectMode ? (
                                <td>
                                  <input
                                    type="checkbox"
                                    className="rrhh-select-check"
                                    checked={isSelected}
                                    onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                                    aria-label={`Seleccionar vacaciones del ${formatDateEs(item.fecha_inicio)}`}
                                  />
                                </td>
                              ) : null}
                              <td>{formatDateEs(item.fecha_inicio)}</td>
                              <td>{formatDateEs(item.fecha_fin)}</td>
                              <td className="crm-table-muted">
                                {daysBetween(item.fecha_inicio, item.fecha_fin)}
                              </td>
                              <td>
                                <span className={`rrhh-status rrhh-status-${item.estado}`}>
                                  {VACACION_LABELS[item.estado]}
                                </span>
                              </td>
                              <td className="crm-table-muted">{item.motivo || "—"}</td>
                              {!selectMode ? (
                                <td>
                                  <div className="rrhh-row-actions">
                                    {item.estado === "pendiente" ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-soft"
                                          disabled={savingId === item.id || deleting}
                                          onClick={() => updateEstado(item.id, "aprobada")}
                                        >
                                          Aprobar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-danger-soft"
                                          disabled={savingId === item.id || deleting}
                                          onClick={() => updateEstado(item.id, "rechazada")}
                                        >
                                          Rechazar
                                        </button>
                                      </>
                                    ) : (
                                      <span className="crm-table-muted">—</span>
                                    )}
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState
                      title="Sin vacaciones en este periodo"
                      description="Puedes registrar una solicitud con el botón Añadir vacaciones."
                      action={
                        member && !selectMode ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setAddTarget(member)}
                          >
                            Añadir vacaciones
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            title={
              hasAnyConstraint
                ? hasNameQuery && !hasDateOrEstadoFilters
                  ? "Ningún empleado coincide"
                  : "Ninguna vacación en ese periodo"
                : "Todavía no hay empleados activos"
            }
            description={
              hasAnyConstraint
                ? hasNameQuery && !hasDateOrEstadoFilters
                  ? "Prueba otro nombre o limpia la búsqueda."
                  : "Ajusta el estado o las fechas para ver empleados y sus solicitudes de ese rango."
                : "Añade trabajadores en Plantilla para empezar a gestionar vacaciones."
            }
            action={
              hasAnyConstraint ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setNameQuery("");
                    clearFilters();
                  }}
                >
                  Limpiar búsqueda y filtros
                </button>
              ) : (
                <Link href="/?vista=rrhh" className="btn btn-primary">
                  Ir a plantilla
                </Link>
              )
            }
          />
        )}
      </div>

      {addTarget ? (
        <VacacionDialog
          personaId={addTarget.id}
          personaNombre={addTarget.nombre}
          saving={saving}
          onSave={handleAddVacacion}
          onClose={() => {
            if (!saving) setAddTarget(null);
          }}
        />
      ) : null}

      {confirmOpen && selectedCount > 0 ? (
        <DeleteConfirmDialog
          heading={
            selectedCount === 1
              ? "¿Eliminar 1 solicitud de vacaciones?"
              : `¿Eliminar ${selectedCount} solicitudes de vacaciones?`
          }
          confirmLabel={selectedCount === 1 ? "Sí, eliminar vacaciones" : "Sí, eliminar vacaciones"}
          deleting={deleting}
          onConfirm={confirmDelete}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </section>
  );
}
