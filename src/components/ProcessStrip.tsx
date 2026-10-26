/** Proceso comercial del ERP (skill erp): del lead al cobro. */
const STEPS = [
  { id: "lead", label: "Lead", module: "CRM" as const },
  { id: "oportunidad", label: "Oportunidad", module: "CRM" as const },
  { id: "presupuesto", label: "Presupuesto", module: "Ventas" as const, future: true },
  { id: "entrega", label: "Entrega", module: "Inventario" as const, future: true },
  { id: "factura", label: "Factura", module: "Facturación" as const, future: true },
  { id: "cobro", label: "Cobro", module: "Facturación" as const, future: true },
] as const;

export function ProcessStrip({ activeId = "oportunidad" }: { activeId?: (typeof STEPS)[number]["id"] }) {
  return (
    <ol className="process-strip" aria-label="Proceso comercial del ERP">
      {STEPS.map((step, index) => {
        const isActive = step.id === activeId;
        const isFuture = "future" in step && step.future;
        const className = [isActive ? "is-active" : "", isFuture ? "is-future" : ""].filter(Boolean).join(" ");
        return (
          <li
            key={step.id}
            className={className || undefined}
            aria-current={isActive ? "step" : undefined}
            title={isFuture ? `${step.label} · módulo ${step.module} (próximamente)` : `${step.label} · ${step.module}`}
          >
            <span className="process-strip-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="process-strip-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
