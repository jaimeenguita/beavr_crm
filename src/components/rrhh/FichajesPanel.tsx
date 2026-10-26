"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  DeleteConfirmDialog,
  FichajeDialog,
  SectionDeleteActions,
  TerminarFichajeDialog,
  type FichajeFormValues,
} from "@/components/rrhh/HrDialogs";
import { StaffNameLink } from "@/components/rrhh/StaffNameLink";
import { formatDateTimeEs, type Fichaje, type StaffMember } from "@/lib/crm/rrhh";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

export type FichajeRow = Fichaje & {
  persona_nombre: string;
  persona_cargo: string | null;
};

type EstadoFiltro = "todos" | "abiertos" | "cerrados";

type EmployeeGroup = {
  persona_id: string;
  persona_nombre: string;
  persona_cargo: string | null;
  fichajes: FichajeRow[];
};

function durationLabel(entrada: string, salida: string | null) {
  if (!salida) return "En curso";
  const ms = new Date(salida).getTime() - new Date(entrada).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours} h ${String(mins).padStart(2, "0")} min`;
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

function fichajeMatchesFilters(item: FichajeRow, estado: EstadoFiltro, desde: string, hasta: string) {
  if (estado === "abiertos" && item.salida_en) return false;
  if (estado === "cerrados" && !item.salida_en) return false;
  const day = item.entrada_en.slice(0, 10);
  if (desde && day < desde) return false;
  if (hasta && day > hasta) return false;
  return true;
}

export function FichajesPanel({
  fichajes,
  staff,
  loading,
  onRefresh,
}: {
  fichajes: FichajeRow[];
  staff: StaffMember[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [nameQuery, setNameQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addTarget, setAddTarget] = useState<StaffMember | null>(null);
  const [closeTarget, setCloseTarget] = useState<FichajeRow | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const hasDateOrEstadoFilters = Boolean(estado !== "todos" || desde || hasta);
  const hasNameQuery = Boolean(nameQuery.trim());
  const hasAnyConstraint = hasDateOrEstadoFilters || hasNameQuery;

  const groups = useMemo(() => {
    const fichajesByPerson = new Map<string, FichajeRow[]>();
    for (const item of fichajes) {
      if (!fichajeMatchesFilters(item, estado, desde, hasta)) continue;
      const list = fichajesByPerson.get(item.persona_id) ?? [];
      list.push(item);
      fichajesByPerson.set(item.persona_id, list);
    }

    const activeStaff = staff
      .filter((member) => member.estado_laboral === "activo")
      .filter((member) => matchesNameQuery(member.nombre, member.cargo, nameQuery))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const result: EmployeeGroup[] = [];

    for (const member of activeStaff) {
      const personFichajes = (fichajesByPerson.get(member.id) ?? []).sort((a, b) =>
        b.entrada_en.localeCompare(a.entrada_en),
      );
      // Con filtros de fecha/estado: solo empleados con fichajes en el rango.
      // Sin esos filtros: todos los activos (para poder añadir fichaje).
      if (hasDateOrEstadoFilters && personFichajes.length === 0) continue;
      result.push({
        persona_id: member.id,
        persona_nombre: member.nombre,
        persona_cargo: member.cargo,
        fichajes: personFichajes,
      });
    }

    // Empleados con fichajes pero ya no activos / no en lista staff
    if (hasDateOrEstadoFilters || !staff.length) {
      for (const [personaId, list] of fichajesByPerson) {
        if (result.some((g) => g.persona_id === personaId)) continue;
        const sample = list[0];
        if (!matchesNameQuery(sample.persona_nombre, sample.persona_cargo, nameQuery)) continue;
        result.push({
          persona_id: personaId,
          persona_nombre: sample.persona_nombre,
          persona_cargo: sample.persona_cargo,
          fichajes: [...list].sort((a, b) => b.entrada_en.localeCompare(a.entrada_en)),
        });
      }
      result.sort((a, b) => a.persona_nombre.localeCompare(b.persona_nombre, "es", { sensitivity: "base" }));
    }

    return result;
  }, [fichajes, staff, nameQuery, estado, desde, hasta, hasDateOrEstadoFilters]);

  const visibleFichajeCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.fichajes.length, 0),
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

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmOpen(false);
  };

  const confirmDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setDeleting(true);
    const { error } = await supabase.from("rrhh_fichajes").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      showNotice("error", "No se ha podido eliminar el fichaje.");
      return;
    }
    exitSelectMode();
    showNotice("success", ids.length === 1 ? "Fichaje eliminado." : `${ids.length} fichajes eliminados.`);
    onRefresh();
  };

  const handleAddFichaje = async (values: FichajeFormValues) => {
    if (!addTarget) return;
    setSaving(true);
    const { error } = await supabase.from("rrhh_fichajes").insert({
      persona_id: addTarget.id,
      entrada_en: values.entrada_en,
      salida_en: values.salida_en,
      notas: values.notas || null,
    });
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido guardar el fichaje.");
      return;
    }
    setAddTarget(null);
    showNotice("success", `Fichaje añadido para ${addTarget.nombre}.`);
    onRefresh();
  };

  const handleTerminarFichaje = async (salidaEn: string) => {
    if (!closeTarget) return;
    setSaving(true);
    const { error } = await supabase
      .from("rrhh_fichajes")
      .update({ salida_en: salidaEn })
      .eq("id", closeTarget.id);
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido terminar el fichaje.");
      return;
    }
    const nombre = closeTarget.persona_nombre;
    setCloseTarget(null);
    showNotice("success", `Fichaje de ${nombre} cerrado.`);
    onRefresh();
  };

  const selectedCount = selectedIds.size;

  return (
    <section aria-label="Fichajes" className={selectMode ? "rrhh-select-mode" : undefined}>
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
            <label htmlFor="fichaje-buscar-empleado">Buscar empleado</label>
            <div className="staff-search-control">
              <input
                id="fichaje-buscar-empleado"
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
            <label htmlFor="fichaje-estado">Estado</label>
            <select
              id="fichaje-estado"
              value={estado}
              onChange={(event) => setEstado(event.target.value as EstadoFiltro)}
            >
              <option value="todos">Todos</option>
              <option value="abiertos">En curso</option>
              <option value="cerrados">Cerrados</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="fichaje-desde">Desde</label>
            <input
              id="fichaje-desde"
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
            <label htmlFor="fichaje-hasta">Hasta</label>
            <input
              id="fichaje-hasta"
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
            disabled={deleting || loading || saving}
            canEnter={visibleFichajeCount > 0}
            enterLabel="Eliminar fichajes"
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
          Mostrando fichajes
          {estado === "abiertos" ? " en curso" : estado === "cerrados" ? " cerrados" : ""}
          {desde || hasta
            ? ` del ${desde || "…"} al ${hasta || "…"}`
            : ""}
          {` · ${groups.length} empleado${groups.length === 1 ? "" : "s"} · ${visibleFichajeCount} fichaje${visibleFichajeCount === 1 ? "" : "s"}`}
        </p>
      ) : null}

      {selectMode ? (
        <p className="rrhh-select-hint">Selecciona los fichajes que quieres eliminar.</p>
      ) : null}

      <div className="fichajes-employee-list">
        {loading ? (
          <p className="fichajes-loading" role="status">
            Cargando fichajes…
          </p>
        ) : groups.length ? (
          groups.map((group) => {
            const count = group.fichajes.length;
            const countLabel = count === 1 ? "1 fichaje" : `${count} fichajes`;
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
                      >
                        Añadir fichaje
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="crm-table-wrap fichajes-card-table">
                  {group.fichajes.length ? (
                    <table className="crm-table">
                      <thead>
                        <tr>
                          {selectMode ? <th scope="col">Seleccionar</th> : null}
                          <th scope="col">Entrada</th>
                          <th scope="col">Salida</th>
                          <th scope="col">Duración</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Notas</th>
                          {!selectMode ? <th scope="col">Acciones</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {group.fichajes.map((item) => {
                          const abierto = !item.salida_en;
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
                                    aria-label={`Seleccionar fichaje de ${formatDateTimeEs(item.entrada_en)}`}
                                  />
                                </td>
                              ) : null}
                              <td>{formatDateTimeEs(item.entrada_en)}</td>
                              <td className="crm-table-muted">
                                {item.salida_en ? formatDateTimeEs(item.salida_en) : "—"}
                              </td>
                              <td className="crm-table-muted">
                                {durationLabel(item.entrada_en, item.salida_en)}
                              </td>
                              <td>
                                <span
                                  className={`rrhh-status ${
                                    abierto ? "rrhh-status-pendiente" : "rrhh-status-activo"
                                  }`}
                                >
                                  {abierto ? "En curso" : "Cerrado"}
                                </span>
                              </td>
                              <td className="crm-table-muted">{item.notas || "—"}</td>
                              {!selectMode ? (
                                <td>
                                  {abierto ? (
                                    <button
                                      type="button"
                                      className="btn btn-soft"
                                      onClick={() => setCloseTarget(item)}
                                      disabled={saving}
                                    >
                                      Terminar fichaje
                                    </button>
                                  ) : (
                                    <span className="crm-table-muted">—</span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState
                      title="Sin fichajes en este periodo"
                      description="Puedes registrar una entrada o una jornada completa con el botón Añadir fichaje."
                      action={
                        member && !selectMode ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setAddTarget(member)}
                          >
                            Añadir fichaje
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
                  : "Ningún fichaje en ese periodo"
                : "Todavía no hay empleados activos"
            }
            description={
              hasAnyConstraint
                ? hasNameQuery && !hasDateOrEstadoFilters
                  ? "Prueba otro nombre o limpia la búsqueda."
                  : "Ajusta el estado o las fechas (por ejemplo del 1 al 20 de febrero) para ver empleados y sus fichajes de ese rango."
                : "Añade trabajadores en Plantilla para empezar a registrar fichajes."
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
        <FichajeDialog
          personaId={addTarget.id}
          personaNombre={addTarget.nombre}
          saving={saving}
          onSave={handleAddFichaje}
          onClose={() => {
            if (!saving) setAddTarget(null);
          }}
        />
      ) : null}

      {closeTarget ? (
        <TerminarFichajeDialog
          personaId={closeTarget.persona_id}
          personaNombre={closeTarget.persona_nombre}
          entradaEn={closeTarget.entrada_en}
          saving={saving}
          onSave={handleTerminarFichaje}
          onClose={() => {
            if (!saving) setCloseTarget(null);
          }}
        />
      ) : null}

      {confirmOpen && selectedCount > 0 ? (
        <DeleteConfirmDialog
          heading={
            selectedCount === 1
              ? "¿Eliminar 1 fichaje seleccionado?"
              : `¿Eliminar ${selectedCount} fichajes seleccionados?`
          }
          confirmLabel={selectedCount === 1 ? "Sí, eliminar fichaje" : "Sí, eliminar fichajes"}
          deleting={deleting}
          onConfirm={confirmDelete}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </section>
  );
}
