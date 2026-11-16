"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company } from "@/components/CompanyDialogs";
import { EmptyState } from "@/components/EmptyState";
import { CloseButton, Modal } from "@/components/Modal";
import { CreateSitioDialog } from "@/components/web/CreateSitioDialog";
import { EditSitioDialog } from "@/components/web/EditSitioDialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  empresaNombre,
  mapSitioRow,
  PALETA_LABELS,
  PLANTILLA_LABELS,
  sitioPublicPath,
  type SitioWeb,
} from "@/lib/crm/sitios";

type Dialog =
  | { mode: "create" }
  | { mode: "edit"; sitio: SitioWeb }
  | { mode: "delete"; sitio: SitioWeb };

export function WebModule({
  companies,
  loading: companiesLoading,
  onNotice,
}: {
  companies: Company[];
  loading: boolean;
  onNotice: (notice: { type: "success" | "error"; text: string }) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sitios, setSitios] = useState<SitioWeb[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSitios = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from("sitios_web")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setSitios([]);
        onNotice({ type: "error", text: "No se han podido cargar las webs." });
      } else {
        setSitios(
          ((data ?? []) as Record<string, unknown>[]).map((row) =>
            mapSitioRow(row, empresaNombre(companies, String(row.empresa_id))),
          ),
        );
      }
      if (!silent) setLoading(false);
    },
    [supabase, companies, onNotice],
  );

  useEffect(() => {
    void loadSitios();
  }, [loadSitios]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sitios;
    return sitios.filter((sitio) => {
      const nombre = empresaNombre(companies, sitio.empresa_id).toLowerCase();
      return nombre.includes(q) || sitio.slug.includes(q);
    });
  }, [sitios, search, companies]);

  const handleDelete = async (sitio: SitioWeb) => {
    setBusyId(sitio.id);
    const { error } = await supabase.from("sitios_web").delete().eq("id", sitio.id);
    setBusyId(null);
    setDialog(null);
    if (error) {
      onNotice({ type: "error", text: "No se ha podido eliminar la web." });
      return;
    }
    onNotice({ type: "success", text: "Web eliminada." });
    await loadSitios({ silent: true });
  };

  const isLoading = loading || companiesLoading;

  return (
    <div className="summary-page">
      <div className="crm-toolbar">
        <div className="search-field">
          <label htmlFor="search-sitios">Buscar por empresa o URL</label>
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="search-sitios"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej.: Acme, acme-corp…"
            />
          </div>
        </div>
        <div className="crm-toolbar-actions">
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "create" })}>
            Crear web
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-column" role="status">
          Cargando…
        </div>
      ) : sitios.length === 0 ? (
        <EmptyState
          title="Todavía no hay webs"
          description="Crea la web de un cliente eligiendo plantilla y paleta. Después solo editarás los textos."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "create" })}>
              Crear web
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin resultados" description="Prueba otro término de búsqueda." />
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th scope="col">Empresa</th>
                <th scope="col">Plantilla</th>
                <th scope="col">Paleta</th>
                <th scope="col">URL</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sitio) => {
                const nombre = empresaNombre(companies, sitio.empresa_id);
                return (
                  <tr key={sitio.id}>
                    <td>{nombre}</td>
                    <td>{PLANTILLA_LABELS[sitio.plantilla]}</td>
                    <td>{PALETA_LABELS[sitio.paleta]}</td>
                    <td>
                      <code>/sitio/{sitio.slug}</code>
                    </td>
                    <td>
                      <div className="rrhh-row-actions">
                        <a
                          className="btn btn-compact"
                          href={sitioPublicPath(sitio.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver
                        </a>
                        <button
                          type="button"
                          className="btn btn-compact"
                          onClick={() => setDialog({ mode: "edit", sitio })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-compact btn-danger-soft"
                          disabled={busyId === sitio.id}
                          onClick={() => setDialog({ mode: "delete", sitio })}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.mode === "create" ? (
        <CreateSitioDialog
          companies={companies}
          sitios={sitios}
          onClose={() => setDialog(null)}
          onCreated={async () => {
            setDialog(null);
            onNotice({ type: "success", text: "Web creada. Ya puedes editar los textos." });
            await loadSitios({ silent: true });
          }}
        />
      ) : null}

      {dialog?.mode === "edit" ? (
        <EditSitioDialog
          sitio={dialog.sitio}
          empresaNombre={empresaNombre(companies, dialog.sitio.empresa_id)}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            onNotice({ type: "success", text: "Contenidos guardados." });
            await loadSitios({ silent: true });
          }}
        />
      ) : null}

      {dialog?.mode === "delete" ? (
        <Modal titleId="delete-sitio-title" onClose={() => setDialog(null)}>
          <div className="modal-header">
            <h2 id="delete-sitio-title">Eliminar web</h2>
            <CloseButton label="Cerrar" onClick={() => setDialog(null)} />
          </div>
          <div className="modal-body">
            <p>
              Vas a eliminar la web de{" "}
              <strong>{empresaNombre(companies, dialog.sitio.empresa_id)}</strong> (
              <code>/sitio/{dialog.sitio.slug}</code>). Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busyId === dialog.sitio.id}
                onClick={() => void handleDelete(dialog.sitio)}
              >
                {busyId === dialog.sitio.id ? "Eliminando…" : "Eliminar web"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
