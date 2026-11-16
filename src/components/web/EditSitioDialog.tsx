"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { CloseButton, Modal } from "@/components/Modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  deleteSitioHero,
  uploadSitioHero,
  validateHeroImageFile,
} from "@/lib/crm/sitioHero";
import {
  isValidSlug,
  mapSitioRow,
  MAX_SERVICIOS,
  MIN_SERVICIOS,
  PALETA_LABELS,
  PLANTILLA_LABELS,
  validateContenido,
  type SitioContenido,
  type SitioWeb,
} from "@/lib/crm/sitios";

export function EditSitioDialog({
  sitio,
  empresaNombre,
  onClose,
  onSaved,
}: {
  sitio: SitioWeb;
  empresaNombre: string;
  onClose: () => void;
  onSaved: (sitio: SitioWeb) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [slug, setSlug] = useState(sitio.slug);
  const [contenido, setContenido] = useState<SitioContenido>(sitio.contenido);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const updateHero = (key: keyof SitioContenido["hero"], value: string) =>
    setContenido((prev) => ({ ...prev, hero: { ...prev.hero, [key]: value } }));
  const updateSobre = (key: keyof SitioContenido["sobre"], value: string) =>
    setContenido((prev) => ({ ...prev, sobre: { ...prev.sobre, [key]: value } }));
  const updateContacto = (key: keyof SitioContenido["contacto"], value: string) =>
    setContenido((prev) => ({ ...prev, contacto: { ...prev.contacto, [key]: value } }));

  const updateServicio = (index: number, key: "titulo" | "descripcion" | "precio", value: string) => {
    setContenido((prev) => ({
      ...prev,
      servicios: prev.servicios.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    }));
  };

  const addServicio = () => {
    setContenido((prev) => {
      if (prev.servicios.length >= MAX_SERVICIOS) return prev;
      return {
        ...prev,
        servicios: [...prev.servicios, { titulo: "", descripcion: "", precio: "" }],
      };
    });
  };

  const removeServicio = (index: number) => {
    setContenido((prev) => {
      if (prev.servicios.length <= MIN_SERVICIOS) return prev;
      return { ...prev, servicios: prev.servicios.filter((_, i) => i !== index) };
    });
  };

  const handleHeroFile = async (file: File | null) => {
    if (!file) return;
    const validation = validateHeroImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const previous = contenido.hero.imagen_url;
      const url = await uploadSitioHero(supabase, sitio.id, file);
      updateHero("imagen_url", url);
      if (previous && previous !== url) {
        await deleteSitioHero(supabase, previous);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se ha podido subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const clearHeroImage = async () => {
    const previous = contenido.hero.imagen_url;
    updateHero("imagen_url", "");
    if (previous) await deleteSitioHero(supabase, previous);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    const normalizedSlug = slug.trim().toLowerCase();
    if (!isValidSlug(normalizedSlug)) {
      setFieldError("slug");
      setError("La URL solo admite minúsculas, números y guiones (ej.: acme-corp).");
      return;
    }

    const contenidoError = validateContenido(contenido);
    if (contenidoError) {
      setError(contenidoError);
      return;
    }

    setSaving(true);
    const { data, error: updateError } = await supabase
      .from("sitios_web")
      .update({ slug: normalizedSlug, contenido })
      .eq("id", sitio.id)
      .select("*")
      .single();

    setSaving(false);
    if (updateError || !data) {
      setError(
        updateError?.code === "23505"
          ? "Esa URL ya está en uso. Elige otra."
          : (updateError?.message ?? "No se ha podido guardar."),
      );
      return;
    }

    onSaved(mapSitioRow(data as Record<string, unknown>, empresaNombre));
  };

  return (
    <Modal titleId="edit-sitio-title" onClose={onClose}>
      <div className="modal-header">
        <h2 id="edit-sitio-title">Editar web · {empresaNombre}</h2>
        <CloseButton label="Cerrar" onClick={onClose} />
      </div>
      <form className="modal-body sitio-edit-form" onSubmit={(e) => void handleSubmit(e)}>
        <p className="form-help">
          Estilo fijo: plantilla {PLANTILLA_LABELS[sitio.plantilla]}, paleta {PALETA_LABELS[sitio.paleta]}. Solo
          puedes cambiar textos, la foto del hero y la URL.
        </p>

        <FormField
          id="sitio-slug"
          label="URL del sitio"
          required
          error={fieldError === "slug" ? error : null}
          help="Se verá como /sitio/tu-url"
        >
          <input
            id="sitio-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Ej.: acme-corp"
            required
          />
        </FormField>

        <fieldset className="form-fieldset">
          <legend>Hero</legend>
          <FormField
            id="hero-imagen"
            label="Foto principal"
            help="PNG, JPG o WEBP · máx. 2 MB. Se usa en la portada de ambas plantillas."
          >
            <input
              id="hero-imagen"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading || saving}
              onChange={(e) => void handleHeroFile(e.target.files?.[0] ?? null)}
            />
          </FormField>
          {contenido.hero.imagen_url ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={contenido.hero.imagen_url} alt="" className="site-hero-preview" />
              <button type="button" className="btn btn-danger-soft" onClick={() => void clearHeroImage()}>
                Quitar foto
              </button>
            </div>
          ) : null}
          {uploading ? <p className="form-help">Subiendo imagen…</p> : null}

          <FormField id="hero-titulo" label="Título" required>
            <input
              id="hero-titulo"
              value={contenido.hero.titulo}
              onChange={(e) => updateHero("titulo", e.target.value)}
              placeholder="Ej.: Acme Solutions"
              required
            />
          </FormField>
          <FormField id="hero-subtitulo" label="Subtítulo">
            <input
              id="hero-subtitulo"
              value={contenido.hero.subtitulo}
              onChange={(e) => updateHero("subtitulo", e.target.value)}
              placeholder="Ej.: Soluciones para tu negocio"
            />
          </FormField>
          <FormField id="hero-cta" label="Texto del botón">
            <input
              id="hero-cta"
              value={contenido.hero.cta}
              onChange={(e) => updateHero("cta", e.target.value)}
              placeholder="Ej.: Contactar"
            />
          </FormField>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend>Sobre nosotros</legend>
          <FormField id="sobre-titulo" label="Título" required>
            <input
              id="sobre-titulo"
              value={contenido.sobre.titulo}
              onChange={(e) => updateSobre("titulo", e.target.value)}
              required
            />
          </FormField>
          <FormField id="sobre-texto" label="Texto" required>
            <textarea
              id="sobre-texto"
              rows={4}
              value={contenido.sobre.texto}
              onChange={(e) => updateSobre("texto", e.target.value)}
              required
            />
          </FormField>
        </fieldset>

        <fieldset className="form-fieldset">
          <legend>Servicios ({contenido.servicios.length}/{MAX_SERVICIOS})</legend>
          <p className="form-help">
            El precio es opcional. Si lo dejas vacío, el servicio se muestra sin precio en la web.
          </p>
          {contenido.servicios.map((servicio, index) => (
            <div key={index} className="sitio-servicio-row">
              <FormField id={`servicio-titulo-${index}`} label={`Servicio ${index + 1} · título`} required>
                <input
                  id={`servicio-titulo-${index}`}
                  value={servicio.titulo}
                  onChange={(e) => updateServicio(index, "titulo", e.target.value)}
                  placeholder="Ej.: Consultoría"
                  required
                />
              </FormField>
              <FormField id={`servicio-desc-${index}`} label="Descripción">
                <textarea
                  id={`servicio-desc-${index}`}
                  rows={2}
                  value={servicio.descripcion}
                  onChange={(e) => updateServicio(index, "descripcion", e.target.value)}
                  placeholder="Ej.: Análisis y plan a medida"
                />
              </FormField>
              <FormField id={`servicio-precio-${index}`} label="Precio" help="Vacío = sin precio en la web.">
                <input
                  id={`servicio-precio-${index}`}
                  value={servicio.precio}
                  onChange={(e) => updateServicio(index, "precio", e.target.value)}
                  placeholder="Ej.: 1.200 € · desde 90 €/h"
                />
              </FormField>
              {contenido.servicios.length > MIN_SERVICIOS ? (
                <button type="button" className="btn btn-danger-soft" onClick={() => removeServicio(index)}>
                  Quitar servicio
                </button>
              ) : null}
            </div>
          ))}
          {contenido.servicios.length < MAX_SERVICIOS ? (
            <button type="button" className="btn" onClick={addServicio}>
              Añadir servicio
            </button>
          ) : null}
        </fieldset>

        <fieldset className="form-fieldset">
          <legend>Contacto</legend>
          <FormField id="contacto-email" label="Email">
            <input
              id="contacto-email"
              type="email"
              value={contenido.contacto.email}
              onChange={(e) => updateContacto("email", e.target.value)}
              placeholder="Ej.: hola@acme.com"
            />
          </FormField>
          <FormField id="contacto-telefono" label="Teléfono">
            <input
              id="contacto-telefono"
              value={contenido.contacto.telefono}
              onChange={(e) => updateContacto("telefono", e.target.value)}
              placeholder="Ej.: +34 600 000 000"
            />
          </FormField>
          <FormField id="contacto-direccion" label="Dirección">
            <input
              id="contacto-direccion"
              value={contenido.contacto.direccion}
              onChange={(e) => updateContacto("direccion", e.target.value)}
              placeholder="Ej.: Calle Mayor 1, Zaragoza"
            />
          </FormField>
        </fieldset>

        {error && fieldError !== "slug" ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            {saving ? "Guardando…" : "Guardar contenidos"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
