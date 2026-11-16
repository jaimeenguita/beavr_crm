"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Company } from "@/components/CompanyDialogs";
import { FormField } from "@/components/FormField";
import { CloseButton, Modal } from "@/components/Modal";
import { PaletaThumb, PlantillaThumb, SitioPreview } from "@/components/web/SitioPreview";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  defaultContenido,
  empresasSinSitio,
  mapSitioRow,
  PALETAS,
  PLANTILLAS,
  slugifyNombre,
  type Paleta,
  type Plantilla,
  type SitioWeb,
} from "@/lib/crm/sitios";

export function CreateSitioDialog({
  companies,
  sitios,
  onClose,
  onCreated,
}: {
  companies: Company[];
  sitios: SitioWeb[];
  onClose: () => void;
  onCreated: (sitio: SitioWeb) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const available = useMemo(() => empresasSinSitio(companies, sitios), [companies, sitios]);
  const [empresaId, setEmpresaId] = useState(available[0]?.id ?? "");
  const [plantilla, setPlantilla] = useState<Plantilla>("animacion");
  const [paleta, setPaleta] = useState<Paleta>("clara");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = available.find((c) => c.id === empresaId) ?? null;
  const previewName = selected?.nombre ?? "Tu empresa";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError("Elige una empresa sin web.");
      return;
    }
    setSaving(true);
    setError(null);

    const slugBase = slugifyNombre(selected.nombre);
    let slug = slugBase;
    let attempt = 0;
    while (attempt < 20) {
      const { data, error: insertError } = await supabase
        .from("sitios_web")
        .insert({
          empresa_id: selected.id,
          slug,
          plantilla,
          paleta,
          contenido: defaultContenido(selected.nombre),
          publicado: true,
        })
        .select("*")
        .single();

      if (!insertError && data) {
        setSaving(false);
        onCreated(mapSitioRow(data as Record<string, unknown>, selected.nombre));
        return;
      }

      const msg = insertError?.message ?? "";
      if (msg.toLowerCase().includes("slug") || insertError?.code === "23505") {
        attempt += 1;
        slug = `${slugBase}-${attempt + 1}`;
        continue;
      }
      setSaving(false);
      setError(insertError?.message ?? "No se ha podido crear la web.");
      return;
    }

    setSaving(false);
    setError("No se ha podido generar una URL libre. Prueba otro nombre de empresa.");
  };

  return (
    <Modal titleId="create-sitio-title" onClose={onClose}>
      <div className="modal-header">
        <h2 id="create-sitio-title">Crear web</h2>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="modal-body sitio-create-form" onSubmit={(e) => void handleSubmit(e)}>
        {available.length === 0 ? (
          <p className="form-help">Todas las empresas de la cartera ya tienen web.</p>
        ) : (
          <>
            <div className="sitio-create-layout">
              <div className="sitio-create-options">
                <FormField id="sitio-empresa" label="Empresa" required>
                  <select
                    id="sitio-empresa"
                    value={empresaId}
                    onChange={(e) => setEmpresaId(e.target.value)}
                    required
                  >
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </FormField>

                <fieldset className="form-fieldset">
                  <legend>Plantilla *</legend>
                  <div className="sitio-choice-grid" role="radiogroup" aria-label="Plantilla">
                    {PLANTILLAS.map((item) => (
                      <label key={item.value} className={`sitio-choice ${plantilla === item.value ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="plantilla"
                          value={item.value}
                          checked={plantilla === item.value}
                          onChange={() => setPlantilla(item.value)}
                        />
                        <PlantillaThumb plantilla={item.value} />
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="form-fieldset">
                  <legend>Paleta *</legend>
                  <div className="sitio-choice-grid sitio-choice-grid-paletas" role="radiogroup" aria-label="Paleta">
                    {PALETAS.map((item) => (
                      <label key={item.value} className={`sitio-choice ${paleta === item.value ? "active" : ""}`}>
                        <input
                          type="radio"
                          name="paleta"
                          value={item.value}
                          checked={paleta === item.value}
                          onChange={() => setPaleta(item.value)}
                        />
                        <PaletaThumb paleta={item.value} />
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {selected ? (
                  <p className="form-help">
                    URL provisional: <code>/sitio/{slugifyNombre(selected.nombre)}</code> (editable después).
                  </p>
                ) : null}
              </div>

              <aside className="sitio-create-preview" aria-label="Vista previa">
                <SitioPreview plantilla={plantilla} paleta={paleta} brandName={previewName} />
              </aside>
            </div>
          </>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || available.length === 0}
          >
            {saving ? "Creando…" : "Crear web"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
