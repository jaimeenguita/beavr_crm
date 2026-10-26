"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DashboardShell } from "@/components/DashboardShell";
import { EntityLogo } from "@/components/EntityLogo";
import {
  DeleteConfirmDialog,
  EvaluacionDialog,
  NominaSignDialog,
  NominaUploadDialog,
  SectionDeleteActions,
  StaffEditor,
  TerminarFichajeDialog,
  VacacionDialog,
  type StaffFormValues,
} from "@/components/rrhh/HrDialogs";
import {
  ESTADO_LABORAL_LABELS,
  VACACION_LABELS,
  currentQuarterLabel,
  formatDateEs,
  formatDateTimeEs,
  mapStaffRow,
  type Evaluacion,
  type Fichaje,
  type Nomina,
  type OnboardingItem,
  type StaffMember,
  type Vacacion,
  type VacacionEstado,
} from "@/lib/crm/rrhh";
import { fetchPdfBytes, stampSignatureOnNominaPdf } from "@/lib/crm/nominaFirma";
import {
  deleteRrhhFile,
  uploadNominaPdf,
  uploadSignedNominaPdf,
  uploadStaffPhoto,
  validatePdfFile,
  validatePhotoFile,
} from "@/lib/crm/rrhhStorage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

type SelectSection = "fichaje" | "vacacion" | "nomina" | "evaluacion" | "onboarding";

type PendingDelete =
  | { kind: "staff"; label: string }
  | { kind: "fichaje"; ids: string[]; label: string }
  | { kind: "vacacion"; ids: string[]; label: string }
  | { kind: "nomina"; items: { id: string; archivo_url: string }[]; label: string }
  | { kind: "evaluacion"; ids: string[]; label: string }
  | { kind: "onboarding"; ids: string[]; label: string };

const DELETE_CONFIRM: Record<PendingDelete["kind"], string> = {
  staff: "Sí, eliminar ficha",
  fichaje: "Sí, eliminar fichajes",
  vacacion: "Sí, eliminar vacaciones",
  nomina: "Sí, eliminar nóminas",
  evaluacion: "Sí, eliminar evaluaciones",
  onboarding: "Sí, eliminar ítems",
};

function toggleId(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function RrhhDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const staffId = params.id;

  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingItem[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [nominas, setNominas] = useState<Nomina[]>([]);
  const [existingEmails, setExistingEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [vacacionOpen, setVacacionOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [nominaOpen, setNominaOpen] = useState(false);
  const [signingNomina, setSigningNomina] = useState<Nomina | null>(null);
  const [closeFichajeTarget, setCloseFichajeTarget] = useState<Fichaje | null>(null);
  const [selectMode, setSelectMode] = useState<SelectSection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showNotice = (type: "success" | "error", text: string) => {
    setNotice({ type, text });
  };

  const enterSelectMode = (section: SelectSection) => {
    setSelectMode(section);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(null);
    setSelectedIds(new Set());
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);

    const [
      personResult,
      emailsResult,
      fichajesResult,
      vacacionesResult,
      onboardingResult,
      evaluacionesResult,
      nominasResult,
    ] = await Promise.all([
      supabase.from("personas").select("*").eq("id", staffId).eq("es_interno", true).maybeSingle(),
      supabase.from("personas").select("id, email"),
      supabase.from("rrhh_fichajes").select("*").eq("persona_id", staffId).order("entrada_en", { ascending: false }),
      supabase.from("rrhh_vacaciones").select("*").eq("persona_id", staffId).order("fecha_inicio", { ascending: false }),
      supabase.from("rrhh_onboarding").select("*").eq("persona_id", staffId).order("orden", { ascending: true }),
      supabase.from("rrhh_evaluaciones").select("*").eq("persona_id", staffId).order("created_at", { ascending: false }),
      supabase.from("rrhh_nominas").select("*").eq("persona_id", staffId).order("created_at", { ascending: false }),
    ]);

    if (personResult.error || !personResult.data) {
      setNotFound(true);
      setStaff(null);
      if (!silent) setLoading(false);
      return;
    }

    setNotFound(false);
    setStaff(mapStaffRow(personResult.data as Record<string, unknown>));
    setExistingEmails(
      (emailsResult.data ?? [])
        .filter((row) => row.id !== staffId && row.email)
        .map((row) => row.email as string),
    );
    setFichajes((fichajesResult.data ?? []) as Fichaje[]);
    setVacaciones((vacacionesResult.data ?? []) as Vacacion[]);
    setOnboarding((onboardingResult.data ?? []) as OnboardingItem[]);
    setEvaluaciones((evaluacionesResult.data ?? []) as Evaluacion[]);
    setNominas((nominasResult.data ?? []) as Nomina[]);
    if (!silent) setLoading(false);
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const openFichaje = fichajes.find((item) => !item.salida_en) ?? null;

  const handleSaveStaff = async (values: StaffFormValues) => {
    if (!staff) return;
    setSaving(true);

    let fotoUrl = staff.foto_url;
    if (values.fotoFile) {
      const photoError = validatePhotoFile(values.fotoFile);
      if (photoError) {
        setSaving(false);
        showNotice("error", photoError);
        return;
      }
      try {
        fotoUrl = await uploadStaffPhoto(supabase, staff.id, values.fotoFile);
      } catch {
        setSaving(false);
        showNotice("error", "No se ha podido subir la foto.");
        return;
      }
    }

    const { data, error } = await supabase
      .from("personas")
      .update({
        nombre: values.nombre,
        email: values.email || null,
        cargo: values.cargo || null,
        telefono: values.telefono || null,
        notas: values.notas || null,
        estado_laboral: values.estado_laboral,
        fecha_alta: values.fecha_alta || null,
        foto_url: fotoUrl,
        es_interno: true,
        empresa_id: null,
      })
      .eq("id", staff.id)
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      showNotice("error", "No se han podido guardar los cambios.");
      return;
    }

    if (data) {
      setStaff(mapStaffRow(data as Record<string, unknown>));
    } else {
      setStaff({
        ...staff,
        nombre: values.nombre,
        email: values.email || null,
        cargo: values.cargo || null,
        telefono: values.telefono || null,
        notas: values.notas || null,
        estado_laboral: values.estado_laboral,
        fecha_alta: values.fecha_alta || null,
        foto_url: fotoUrl,
      });
    }
    setEditorOpen(false);
    showNotice("success", "Ficha actualizada.");
  };

  const handleTerminarFichaje = async (salidaEn: string) => {
    if (!closeFichajeTarget) return;
    setSaving(true);
    const { error } = await supabase
      .from("rrhh_fichajes")
      .update({ salida_en: salidaEn })
      .eq("id", closeFichajeTarget.id);
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido terminar el fichaje.");
      return;
    }
    setFichajes((list) =>
      list.map((item) => (item.id === closeFichajeTarget.id ? { ...item, salida_en: salidaEn } : item)),
    );
    setCloseFichajeTarget(null);
    showNotice("success", "Fichaje cerrado.");
  };

  const handleClock = async () => {
    if (!staff) return;

    if (openFichaje) {
      setCloseFichajeTarget(openFichaje);
      return;
    }

    setSaving(true);
    const entradaEn = new Date().toISOString();
    const { data, error } = await supabase
      .from("rrhh_fichajes")
      .insert({
        persona_id: staff.id,
        entrada_en: entradaEn,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido fichar la entrada.");
      return;
    }
    if (data) {
      setFichajes((list) => [data as Fichaje, ...list]);
    } else {
      void load({ silent: true });
    }
    showNotice("success", "Entrada registrada.");
  };

  const handleVacacion = async (values: { fecha_inicio: string; fecha_fin: string; motivo: string }) => {
    if (!staff) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("rrhh_vacaciones")
      .insert({
        persona_id: staff.id,
        fecha_inicio: values.fecha_inicio,
        fecha_fin: values.fecha_fin,
        motivo: values.motivo || null,
        estado: "pendiente",
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido solicitar las vacaciones.");
      return;
    }
    if (data) {
      setVacaciones((list) => [data as Vacacion, ...list]);
    } else {
      void load({ silent: true });
    }
    setVacacionOpen(false);
    showNotice("success", "Solicitud de vacaciones enviada.");
  };

  const updateVacacionEstado = async (id: string, estado: VacacionEstado) => {
    const previous = vacaciones.find((item) => item.id === id);
    setVacaciones((list) => list.map((item) => (item.id === id ? { ...item, estado } : item)));
    const { error } = await supabase.from("rrhh_vacaciones").update({ estado }).eq("id", id);
    if (error) {
      if (previous) {
        setVacaciones((list) => list.map((item) => (item.id === id ? previous : item)));
      }
      showNotice("error", "No se ha podido actualizar la solicitud.");
      return;
    }
    showNotice("success", `Solicitud marcada como ${VACACION_LABELS[estado].toLowerCase()}.`);
  };

  const toggleOnboarding = async (item: OnboardingItem) => {
    const next = !item.completado;
    const completadoEn = next ? new Date().toISOString() : null;
    setOnboarding((list) =>
      list.map((row) =>
        row.id === item.id ? { ...row, completado: next, completado_en: completadoEn } : row,
      ),
    );
    const { error } = await supabase
      .from("rrhh_onboarding")
      .update({
        completado: next,
        completado_en: completadoEn,
      })
      .eq("id", item.id);
    if (error) {
      setOnboarding((list) =>
        list.map((row) =>
          row.id === item.id
            ? { ...row, completado: item.completado, completado_en: item.completado_en }
            : row,
        ),
      );
      showNotice("error", "No se ha podido actualizar el checklist.");
    }
  };

  const handleEvaluacion = async (values: { periodo: string; nota: number; comentario: string }) => {
    if (!staff) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("rrhh_evaluaciones")
      .insert({
        persona_id: staff.id,
        periodo: values.periodo,
        nota: values.nota,
        comentario: values.comentario || null,
        evaluador: user?.email ?? null,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      showNotice("error", "No se ha podido guardar la evaluación.");
      return;
    }
    if (data) {
      setEvaluaciones((list) => [data as Evaluacion, ...list]);
    } else {
      void load({ silent: true });
    }
    setEvalOpen(false);
    showNotice("success", "Evaluación guardada.");
  };

  const handleNomina = async (values: { periodo: string; file: File }) => {
    if (!staff) return;
    const fileError = validatePdfFile(values.file);
    if (fileError) {
      showNotice("error", fileError);
      return;
    }
    setSaving(true);
    try {
      const archivoUrl = await uploadNominaPdf(supabase, staff.id, values.file);
      const { data, error } = await supabase
        .from("rrhh_nominas")
        .insert({
          persona_id: staff.id,
          periodo: values.periodo,
          archivo_url: archivoUrl,
          archivo_nombre: values.file.name,
          firmado: false,
        })
        .select("*")
        .single();
      if (error) throw error;
      if (data) {
        setNominas((list) => [data as Nomina, ...list]);
      } else {
        void load({ silent: true });
      }
      setNominaOpen(false);
      showNotice("success", "Nómina subida.");
    } catch {
      showNotice("error", "No se ha podido subir la nómina.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignNomina = async (signaturePng: Blob) => {
    if (!staff || !signingNomina) return;
    const nomina = signingNomina;
    const firmadoEn = new Date().toISOString();
    const firmadoPor = user?.email ?? "usuario";
    setSaving(true);
    try {
      const [pdfBytes, signatureBytes] = await Promise.all([
        fetchPdfBytes(nomina.archivo_url),
        signaturePng.arrayBuffer(),
      ]);
      const signedPdf = await stampSignatureOnNominaPdf(pdfBytes, signatureBytes);
      const archivoUrl = await uploadSignedNominaPdf(
        supabase,
        staff.id,
        signedPdf,
        nomina.archivo_nombre,
      );
      const archivoNombre = (nomina.archivo_nombre || "nomina.pdf").replace(/\.pdf$/i, "") + "-firmada.pdf";
      const { data, error } = await supabase
        .from("rrhh_nominas")
        .update({
          archivo_url: archivoUrl,
          archivo_nombre: archivoNombre,
          firmado: true,
          firmado_en: firmadoEn,
          firmado_por: firmadoPor,
        })
        .eq("id", nomina.id)
        .select("*")
        .single();
      if (error) throw error;
      setNominas((list) =>
        list.map((item) => (item.id === nomina.id ? ((data as Nomina) ?? {
          ...item,
          archivo_url: archivoUrl,
          archivo_nombre: archivoNombre,
          firmado: true,
          firmado_en: firmadoEn,
          firmado_por: firmadoPor,
        }) : item)),
      );
      setSigningNomina(null);
      showNotice("success", "Nómina firmada y PDF actualizado.");
    } catch {
      showNotice("error", "No se ha podido firmar la nómina.");
    } finally {
      setSaving(false);
    }
  };

  const requestBulkDelete = (section: SelectSection) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const count = ids.length;

    if (section === "fichaje") {
      setPendingDelete({
        kind: "fichaje",
        ids,
        label: count === 1 ? "1 fichaje" : `${count} fichajes`,
      });
    } else if (section === "vacacion") {
      setPendingDelete({
        kind: "vacacion",
        ids,
        label: count === 1 ? "1 solicitud" : `${count} solicitudes`,
      });
    } else if (section === "nomina") {
      const items = nominas
        .filter((item) => selectedIds.has(item.id))
        .map((item) => ({ id: item.id, archivo_url: item.archivo_url }));
      setPendingDelete({
        kind: "nomina",
        items,
        label: count === 1 ? "1 nómina" : `${count} nóminas`,
      });
    } else if (section === "evaluacion") {
      setPendingDelete({
        kind: "evaluacion",
        ids,
        label: count === 1 ? "1 evaluación" : `${count} evaluaciones`,
      });
    } else {
      setPendingDelete({
        kind: "onboarding",
        ids,
        label: count === 1 ? "1 ítem" : `${count} ítems`,
      });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !staff) return;
    setDeleting(true);

    try {
      if (pendingDelete.kind === "staff") {
        const { error } = await supabase.from("personas").delete().eq("id", staff.id);
        if (error) throw error;
        setPendingDelete(null);
        router.push("/?vista=rrhh");
        return;
      }

      if (pendingDelete.kind === "fichaje") {
        const { error } = await supabase.from("rrhh_fichajes").delete().in("id", pendingDelete.ids);
        if (error) throw error;
        setFichajes((list) => list.filter((item) => !pendingDelete.ids.includes(item.id)));
        showNotice(
          "success",
          pendingDelete.ids.length === 1 ? "Fichaje eliminado." : `${pendingDelete.ids.length} fichajes eliminados.`,
        );
      } else if (pendingDelete.kind === "vacacion") {
        const { error } = await supabase.from("rrhh_vacaciones").delete().in("id", pendingDelete.ids);
        if (error) throw error;
        setVacaciones((list) => list.filter((item) => !pendingDelete.ids.includes(item.id)));
        showNotice(
          "success",
          pendingDelete.ids.length === 1
            ? "Solicitud de vacaciones eliminada."
            : `${pendingDelete.ids.length} solicitudes eliminadas.`,
        );
      } else if (pendingDelete.kind === "nomina") {
        const ids = pendingDelete.items.map((item) => item.id);
        const { error } = await supabase.from("rrhh_nominas").delete().in("id", ids);
        if (error) throw error;
        await Promise.all(
          pendingDelete.items.map(async (item) => {
            try {
              await deleteRrhhFile(supabase, item.archivo_url);
            } catch {
              /* registro ya borrado */
            }
          }),
        );
        setNominas((list) => list.filter((item) => !ids.includes(item.id)));
        showNotice(
          "success",
          ids.length === 1 ? "Nómina eliminada." : `${ids.length} nóminas eliminadas.`,
        );
      } else if (pendingDelete.kind === "evaluacion") {
        const { error } = await supabase.from("rrhh_evaluaciones").delete().in("id", pendingDelete.ids);
        if (error) throw error;
        setEvaluaciones((list) => list.filter((item) => !pendingDelete.ids.includes(item.id)));
        showNotice(
          "success",
          pendingDelete.ids.length === 1
            ? "Evaluación eliminada."
            : `${pendingDelete.ids.length} evaluaciones eliminadas.`,
        );
      } else if (pendingDelete.kind === "onboarding") {
        const { error } = await supabase.from("rrhh_onboarding").delete().in("id", pendingDelete.ids);
        if (error) throw error;
        setOnboarding((list) => list.filter((item) => !pendingDelete.ids.includes(item.id)));
        showNotice(
          "success",
          pendingDelete.ids.length === 1
            ? "Ítem de onboarding eliminado."
            : `${pendingDelete.ids.length} ítems eliminados.`,
        );
      }

      setPendingDelete(null);
      exitSelectMode();
    } catch {
      const messages: Record<PendingDelete["kind"], string> = {
        staff: "No se ha podido eliminar la ficha.",
        fichaje: "No se ha podido eliminar el fichaje.",
        vacacion: "No se ha podido eliminar la solicitud de vacaciones.",
        nomina: "No se ha podido eliminar la nómina.",
        evaluacion: "No se ha podido eliminar la evaluación.",
        onboarding: "No se ha podido eliminar el ítem de onboarding.",
      };
      showNotice("error", messages[pendingDelete.kind]);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell title="Plantilla" subtitle="Cargando ficha">
        <div className="empty-column">Cargando…</div>
      </DashboardShell>
    );
  }

  if (notFound || !staff) {
    return (
      <DashboardShell title="Plantilla" subtitle="No encontrado">
        <div className="empty-state">
          <strong>No encontramos este trabajador</strong>
          <p>Puede haberse eliminado o el enlace no es válido.</p>
          <Link href="/?vista=rrhh" className="btn btn-primary">
            Volver a plantilla
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const onboardingDone = onboarding.filter((item) => item.completado).length;
  const selecting = (section: SelectSection) => selectMode === section;
  const selectedCount = selectedIds.size;

  return (
    <DashboardShell title={staff.nombre} subtitle="Ficha RRHH · equipo interno">
      <div className="entity-detail">
        <Breadcrumbs
          items={[
            { label: "RRHH", href: "/?vista=rrhh" },
            { label: "Plantilla", href: "/?vista=rrhh" },
            { label: staff.nombre },
          ]}
        />
        <div className="entity-detail-toolbar">
          <Link href="/?vista=rrhh" className="back-link">
            ← Volver a plantilla
          </Link>
          <div className="entity-detail-actions">
            <button type="button" className="btn btn-soft" onClick={() => setEditorOpen(true)}>
              Editar ficha
            </button>
            <button
              type="button"
              className="btn btn-danger-soft"
              onClick={() => setPendingDelete({ kind: "staff", label: staff.nombre })}
              disabled={saving || deleting}
            >
              Eliminar ficha
            </button>
          </div>
        </div>

        {notice ? (
          <div className={`notice notice-${notice.type}`} role="status">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        ) : null}

        <section className="entity-hero" aria-label="Datos del trabajador">
          <EntityLogo name={staff.nombre} logoUrl={staff.foto_url} size="lg" />
          <div className="entity-hero-copy">
            <h2>{staff.nombre}</h2>
            {staff.cargo ? <span className="company-sector">{staff.cargo}</span> : null}
            <div className="rrhh-hero-meta">
              <span className={`rrhh-status rrhh-status-${staff.estado_laboral}`}>
                {ESTADO_LABORAL_LABELS[staff.estado_laboral]}
              </span>
              <span className="crm-table-muted">Alta: {formatDateEs(staff.fecha_alta)}</span>
            </div>
          </div>
        </section>

        <section className="detail-grid" aria-label="Información general">
          <article className="detail-card">
            <h3>Datos</h3>
            <dl className="detail-facts">
              <div>
                <dt>Puesto</dt>
                <dd>{staff.cargo || "—"}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{staff.email ? <span className="contact-email">{staff.email}</span> : "—"}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>
                  {staff.telefono ? (
                    <a href={`tel:${staff.telefono.replace(/\s/g, "")}`}>{staff.telefono}</a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Estado laboral</dt>
                <dd>{ESTADO_LABORAL_LABELS[staff.estado_laboral]}</dd>
              </div>
            </dl>
          </article>
          <article className="detail-card">
            <h3>Notas</h3>
            {staff.notas ? <p className="detail-notes">{staff.notas}</p> : <p className="is-empty">Sin notas</p>}
          </article>
        </section>

        <section
          className={`detail-card${selecting("fichaje") ? " rrhh-select-mode" : ""}`}
          aria-label="Horarios"
        >
          <div className="directory-header">
            <div className="directory-title">
              <h3>Horarios</h3>
              <span>{fichajes.length}</span>
            </div>
            <div className="rrhh-row-actions">
              {!selecting("fichaje") ? (
                <button type="button" className="btn btn-primary" onClick={handleClock} disabled={saving}>
                  {openFichaje ? "Terminar fichaje" : "Fichar entrada"}
                </button>
              ) : null}
              <SectionDeleteActions
                selectMode={selecting("fichaje")}
                selectedCount={selectedCount}
                disabled={saving || deleting}
                canEnter={fichajes.length > 0}
                onEnterSelect={() => enterSelectMode("fichaje")}
                onCancel={exitSelectMode}
                onRequestDelete={() => requestBulkDelete("fichaje")}
              />
            </div>
          </div>

          {openFichaje && !selecting("fichaje") ? (
            <p className="rrhh-inline-hint">
              Jornada abierta desde {formatDateTimeEs(openFichaje.entrada_en)}.
            </p>
          ) : null}

          {selecting("fichaje") ? (
            <p className="rrhh-select-hint">Selecciona los fichajes que quieres eliminar.</p>
          ) : null}

          <div className="crm-table-wrap rrhh-nested-table">
            <table className="crm-table">
              <thead>
                <tr>
                  {selecting("fichaje") ? <th scope="col">Seleccionar</th> : null}
                  <th scope="col">Entrada</th>
                  <th scope="col">Salida</th>
                  {!selecting("fichaje") ? <th scope="col">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {fichajes.length ? (
                  fichajes.slice(0, 10).map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const abierto = !item.salida_en;
                    return (
                      <tr
                        key={item.id}
                        className={
                          selecting("fichaje")
                            ? `rrhh-select-row${isSelected ? " is-selected" : ""}`
                            : undefined
                        }
                      >
                        {selecting("fichaje") ? (
                          <td>
                            <input
                              type="checkbox"
                              className="rrhh-select-check"
                              checked={isSelected}
                              onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                              aria-label="Seleccionar registro"
                            />
                          </td>
                        ) : null}
                        <td>{formatDateTimeEs(item.entrada_en)}</td>
                        <td className="crm-table-muted">
                          {item.salida_en ? formatDateTimeEs(item.salida_en) : "En curso"}
                        </td>
                        {!selecting("fichaje") ? (
                          <td>
                            {abierto ? (
                              <button
                                type="button"
                                className="btn btn-soft"
                                onClick={() => setCloseFichajeTarget(item)}
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
                  })
                ) : (
                  <tr>
                    <td colSpan={selecting("fichaje") ? 3 : 3} className="crm-table-empty">
                      Todavía no hay fichajes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={`detail-card${selecting("vacacion") ? " rrhh-select-mode" : ""}`}
          aria-label="Vacaciones"
        >
          <div className="directory-header">
            <div className="directory-title">
              <h3>Vacaciones</h3>
              <span>{vacaciones.length}</span>
            </div>
            <div className="rrhh-row-actions">
              {!selecting("vacacion") ? (
                <button type="button" className="btn btn-soft" onClick={() => setVacacionOpen(true)}>
                  Solicitar vacaciones
                </button>
              ) : null}
              <SectionDeleteActions
                selectMode={selecting("vacacion")}
                selectedCount={selectedCount}
                disabled={saving || deleting}
                canEnter={vacaciones.length > 0}
                onEnterSelect={() => enterSelectMode("vacacion")}
                onCancel={exitSelectMode}
                onRequestDelete={() => requestBulkDelete("vacacion")}
              />
            </div>
          </div>

          {selecting("vacacion") ? (
            <p className="rrhh-select-hint">Selecciona las solicitudes que quieres eliminar.</p>
          ) : null}

          <div className="crm-table-wrap rrhh-nested-table">
            <table className="crm-table">
              <thead>
                <tr>
                  {selecting("vacacion") ? <th scope="col">Seleccionar</th> : null}
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Estado</th>
                  {!selecting("vacacion") ? <th scope="col">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {vacaciones.length ? (
                  vacaciones.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={
                          selecting("vacacion")
                            ? `rrhh-select-row${isSelected ? " is-selected" : ""}`
                            : undefined
                        }
                      >
                        {selecting("vacacion") ? (
                          <td>
                            <input
                              type="checkbox"
                              className="rrhh-select-check"
                              checked={isSelected}
                              onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                            aria-label="Seleccionar registro"
                            />
                          </td>
                        ) : null}
                        <td>{formatDateEs(item.fecha_inicio)}</td>
                        <td>{formatDateEs(item.fecha_fin)}</td>
                        <td>
                          <span className={`rrhh-status rrhh-status-${item.estado}`}>
                            {VACACION_LABELS[item.estado]}
                          </span>
                        </td>
                        {!selecting("vacacion") ? (
                          <td>
                            <div className="rrhh-row-actions">
                              {item.estado === "pendiente" ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-soft"
                                    onClick={() => updateVacacionEstado(item.id, "aprobada")}
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger-soft"
                                    onClick={() => updateVacacionEstado(item.id, "rechazada")}
                                  >
                                    Rechazar
                                  </button>
                                </>
                              ) : (
                                <span className="crm-table-muted">{item.motivo || "—"}</span>
                              )}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={selecting("vacacion") ? 4 : 4} className="crm-table-empty">
                      Sin solicitudes de vacaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={`detail-card${selecting("onboarding") ? " rrhh-select-mode" : ""}`}
          aria-label="Check de inicio"
        >
          <div className="directory-header">
            <div className="directory-title">
              <h3>Check de inicio</h3>
              <span>
                {onboardingDone}/{onboarding.length}
              </span>
            </div>
            <div className="rrhh-row-actions">
              <SectionDeleteActions
                selectMode={selecting("onboarding")}
                selectedCount={selectedCount}
                disabled={saving || deleting}
                canEnter={onboarding.length > 0}
                onEnterSelect={() => enterSelectMode("onboarding")}
                onCancel={exitSelectMode}
                onRequestDelete={() => requestBulkDelete("onboarding")}
              />
            </div>
          </div>

          {selecting("onboarding") ? (
            <p className="rrhh-select-hint">Selecciona los ítems que quieres eliminar.</p>
          ) : null}

          {onboarding.length ? (
            <ul className="rrhh-checklist">
              {onboarding.map((item) => {
                const isSelected = selectedIds.has(item.id);
                if (selecting("onboarding")) {
                  return (
                    <li
                      key={item.id}
                      className={`rrhh-check-row${isSelected ? " is-selected" : ""}`}
                    >
                      <div className="rrhh-check-item">
                        <input
                          type="checkbox"
                          className="rrhh-select-check"
                          checked={isSelected}
                          onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                            aria-label="Seleccionar registro"
                        />
                        <span className={item.completado ? "is-done" : undefined}>{item.titulo}</span>
                        {item.completado_en ? (
                          <em className="crm-table-muted">{formatDateTimeEs(item.completado_en)}</em>
                        ) : null}
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={item.id} className="rrhh-check-row">
                    <label className="rrhh-check-item">
                      <input
                        type="checkbox"
                        checked={item.completado}
                        onChange={() => toggleOnboarding(item)}
                      />
                      <span className={item.completado ? "is-done" : undefined}>{item.titulo}</span>
                      {item.completado_en ? (
                        <em className="crm-table-muted">{formatDateTimeEs(item.completado_en)}</em>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-column">Sin checklist de onboarding</div>
          )}
        </section>

        <section
          className={`detail-card${selecting("evaluacion") ? " rrhh-select-mode" : ""}`}
          aria-label="Evaluaciones"
        >
          <div className="directory-header">
            <div className="directory-title">
              <h3>Evaluaciones</h3>
              <span>{evaluaciones.length}</span>
            </div>
            <div className="rrhh-row-actions">
              {!selecting("evaluacion") ? (
                <button type="button" className="btn btn-soft" onClick={() => setEvalOpen(true)}>
                  + Nueva evaluación
                </button>
              ) : null}
              <SectionDeleteActions
                selectMode={selecting("evaluacion")}
                selectedCount={selectedCount}
                disabled={saving || deleting}
                canEnter={evaluaciones.length > 0}
                onEnterSelect={() => enterSelectMode("evaluacion")}
                onCancel={exitSelectMode}
                onRequestDelete={() => requestBulkDelete("evaluacion")}
              />
            </div>
          </div>

          {selecting("evaluacion") ? (
            <p className="rrhh-select-hint">Selecciona las evaluaciones que quieres eliminar.</p>
          ) : null}

          {evaluaciones.length ? (
            <div className="related-opp-list">
              {evaluaciones.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`related-opp-card rrhh-eval-card${isSelected && selecting("evaluacion") ? " is-selected" : ""}`}
                  >
                    {selecting("evaluacion") ? (
                      <input
                        type="checkbox"
                        className="rrhh-select-check"
                        checked={isSelected}
                        onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                        aria-label={`Seleccionar evaluación ${item.periodo}`}
                      />
                    ) : null}
                    <div className="related-opp-copy">
                      <strong>
                        {item.periodo} · nota {item.nota}/5
                      </strong>
                      <span>{item.comentario || "Sin comentario"}</span>
                      <span className="related-opp-price">
                        {formatDateEs(item.created_at)}
                        {item.evaluador ? ` · ${item.evaluador}` : ""}
                      </span>
                    </div>
                    {!selecting("evaluacion") ? (
                      <span className="status-pill rrhh-nota-pill">{item.nota}/5</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-column">Todavía no hay evaluaciones trimestrales</div>
          )}
        </section>

        <section
          className={`detail-card${selecting("nomina") ? " rrhh-select-mode" : ""}`}
          aria-label="Nóminas"
        >
          <div className="directory-header">
            <div className="directory-title">
              <h3>Archivos · Nóminas</h3>
              <span>{nominas.length}</span>
            </div>
            <div className="rrhh-row-actions">
              {!selecting("nomina") ? (
                <button type="button" className="btn btn-soft" onClick={() => setNominaOpen(true)}>
                  + Subir nómina
                </button>
              ) : null}
              <SectionDeleteActions
                selectMode={selecting("nomina")}
                selectedCount={selectedCount}
                disabled={saving || deleting}
                canEnter={nominas.length > 0}
                onEnterSelect={() => enterSelectMode("nomina")}
                onCancel={exitSelectMode}
                onRequestDelete={() => requestBulkDelete("nomina")}
              />
            </div>
          </div>

          {selecting("nomina") ? (
            <p className="rrhh-select-hint">Selecciona las nóminas que quieres eliminar.</p>
          ) : null}

          <div className="crm-table-wrap rrhh-nested-table">
            <table className="crm-table">
              <thead>
                <tr>
                  {selecting("nomina") ? <th scope="col">Seleccionar</th> : null}
                  <th scope="col">Periodo</th>
                  <th scope="col">Archivo</th>
                  <th scope="col">Firma</th>
                  {!selecting("nomina") ? <th scope="col">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {nominas.length ? (
                  nominas.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={
                          selecting("nomina")
                            ? `rrhh-select-row${isSelected ? " is-selected" : ""}`
                            : undefined
                        }
                      >
                        {selecting("nomina") ? (
                          <td>
                            <input
                              type="checkbox"
                              className="rrhh-select-check"
                              checked={isSelected}
                              onChange={() => setSelectedIds((prev) => toggleId(prev, item.id))}
                            aria-label="Seleccionar registro"
                            />
                          </td>
                        ) : null}
                        <td>{item.periodo}</td>
                        <td>
                          <a
                            href={item.archivo_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => selecting("nomina") && event.preventDefault()}
                          >
                            {item.archivo_nombre || "Ver PDF"}
                          </a>
                        </td>
                        <td className="crm-table-muted">
                          {item.firmado
                            ? `Firmada ${formatDateTimeEs(item.firmado_en)}${item.firmado_por ? ` · ${item.firmado_por}` : ""}`
                            : "Pendiente de firma"}
                        </td>
                        {!selecting("nomina") ? (
                          <td>
                            <div className="rrhh-row-actions">
                              {!item.firmado ? (
                                <button
                                  type="button"
                                  className="btn btn-soft"
                                  onClick={() => setSigningNomina(item)}
                                >
                                  Firmar
                                </button>
                              ) : (
                                <span className="rrhh-status rrhh-status-aprobada">Firmada</span>
                              )}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={selecting("nomina") ? 4 : 4} className="crm-table-empty">
                      Todavía no hay nóminas subidas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editorOpen ? (
        <StaffEditor
          staff={staff}
          existingEmails={existingEmails}
          saving={saving}
          onSave={handleSaveStaff}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}

      {vacacionOpen ? (
        <VacacionDialog saving={saving} onSave={handleVacacion} onClose={() => setVacacionOpen(false)} />
      ) : null}

      {closeFichajeTarget && staff ? (
        <TerminarFichajeDialog
          personaId={staff.id}
          personaNombre={staff.nombre}
          entradaEn={closeFichajeTarget.entrada_en}
          saving={saving}
          onSave={handleTerminarFichaje}
          onClose={() => {
            if (!saving) setCloseFichajeTarget(null);
          }}
        />
      ) : null}

      {evalOpen ? (
        <EvaluacionDialog
          defaultPeriodo={currentQuarterLabel()}
          saving={saving}
          onSave={handleEvaluacion}
          onClose={() => setEvalOpen(false)}
        />
      ) : null}

      {nominaOpen ? (
        <NominaUploadDialog saving={saving} onSave={handleNomina} onClose={() => setNominaOpen(false)} />
      ) : null}

      {signingNomina ? (
        <NominaSignDialog
          periodo={signingNomina.periodo}
          saving={saving}
          onConfirm={handleSignNomina}
          onClose={() => !saving && setSigningNomina(null)}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteConfirmDialog
          heading={
            pendingDelete.kind === "staff"
              ? `¿Eliminar la ficha de «${pendingDelete.label}»?`
              : pendingDelete.kind === "fichaje"
                ? `¿Eliminar ${pendingDelete.label}?`
                : pendingDelete.kind === "vacacion"
                  ? `¿Eliminar ${pendingDelete.label} de vacaciones?`
                  : pendingDelete.kind === "nomina"
                    ? `¿Eliminar ${pendingDelete.label}?`
                    : pendingDelete.kind === "evaluacion"
                      ? `¿Eliminar ${pendingDelete.label}?`
                      : `¿Eliminar ${pendingDelete.label} del checklist?`
          }
          detail={
            pendingDelete.kind === "nomina"
              ? "Se borrarán los registros y los PDF asociados en el almacenamiento."
              : pendingDelete.kind === "staff"
                ? "Se eliminará la ficha del trabajador y sus datos relacionados según las reglas de la base de datos."
                : undefined
          }
          confirmLabel={DELETE_CONFIRM[pendingDelete.kind]}
          deleting={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </DashboardShell>
  );
}
