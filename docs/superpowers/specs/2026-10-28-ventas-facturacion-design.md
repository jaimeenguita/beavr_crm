# Ventas y facturación — design

Date: 2026-10-28. Status: draft for approval.

## Intent

The SGE assignment asks for a sales + invoicing module (and later an AI agent) inside the beavr CRM.
This change adds the first two parts as one new section, **Ventas y facturación**, following prototype 1
("Pestañas") from `prototipos/ventas-facturacion-ia.html`. The AI agent tab is explicitly out of scope
until the team decides what it should do.

Success: a user can see every won sale, create an invoice from it, issue it, mark it as paid, and see at a
glance how much is pending and overdue — all with the existing look of the app.

## Goals

- New sidebar section **Ventas** with one entry, **Ventas y facturación** (`/?vista=ventas`).
- Two pill tabs at the top of the view: **Ventas** and **Facturas** (`&tab=facturas`; default `ventas`).
- Sales come from opportunities in stage **Ganada** (`estado = 'won'`). No separate sales table.
- Invoices are stored in a new Supabase table `facturas`, one invoice per sale, no line items.

## Non-goals

- AI agent tab (not even a placeholder tab).
- Invoice PDF, export, emailing, multi-line invoices, credit notes, partial payments.
- Changing the opportunity pipeline UI, except the error notice described under "Integrity with the pipeline".

## Anti-goals

- No new visual language: only tokens, classes and components already in `globals.css` / `src/components/`
  (`crm-kpi`, `crm-table`, `filter-chip`, `rrhh-status`, `btn`, `search-box`, `Modal`, `FormField`, `EmptyState`).
- No duplicated data: a sale's amount and customer always come from the opportunity.

## Data model (decided)

### `oportunidades.ganada_en` (new column)

`timestamptz null`. The sale date. A trigger sets it to `now()` when `estado` changes to `won` and clears it
when it leaves `won`. Backfill: existing won rows get `creado_en`. *(Builder's call: needed because the table
has no date for when a deal was won.)*

### `facturas` (new table)

| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| numero | text unique null | `F-YYYY-NNNN`; null while draft, assigned when issued (correlative per year of `fecha_emision`) |
| oportunidad_id | uuid not null | fk `oportunidades(id)` on delete restrict; partial unique index `where estado <> 'anulada'` — one live invoice per sale |
| empresa_id | uuid null | fk `empresas(id)` on delete set null; copied from the opportunity at creation |
| fecha_emision | date not null | default `current_date` |
| fecha_vencimiento | date not null | default emission + 30 days; check `>= fecha_emision` |
| base | numeric(12,2) not null | check `>= 0`; prefilled with the opportunity `precio` |
| iva_pct | numeric(5,2) not null default 21 | |
| estado | text not null default 'borrador' | check in (`borrador`, `pendiente`, `pagada`, `anulada`) |
| pagada_en | date null | set when marked paid |
| anulada_en | date null | set when cancelled |
| created_at / updated_at | timestamptz | existing `public.set_updated_at()` trigger |

- **Vencida** is not stored: an invoice is overdue when `estado = 'pendiente'` and `fecha_vencimiento < today`.
- **Anulada** (user decision): the way to correct an issued invoice. Allowed from `pendiente` (incl. overdue).
  It keeps its number, is excluded from every total, and the sale goes back to *Sin facturar* so a new invoice
  can be created. Issued invoices are otherwise immutable: no editing of `pendiente`, `pagada` or `anulada`.
- Total = `base * (1 + iva_pct/100)`, computed in the app (rounded to 2 decimals).
- `base` is always the opportunity `precio` at creation time and is not editable in the dialog. A draft
  refreshes its base from `precio` when edited or issued. A won sale with `precio` null cannot be invoiced:
  the row shows *Sin precio* with a link to the opportunity, and is excluded from amounts. *(Builder's call.)*
- Won = `estado in ('won', 'ganada')` everywhere (trigger, backfill, app via `normalizeStage`). *(Builder's call.)*

### Integrity with the pipeline (user decision)

While an opportunity has a live invoice, it cannot leave **Ganada** nor be deleted:

- Before-update trigger on `oportunidades`: if `estado` leaves won and there is a `pendiente` or `pagada`
  invoice, raise an error; a `borrador` is deleted instead. `anulada` invoices do not block.
- Before-delete trigger on `oportunidades`: drafts are deleted; if any other invoice remains
  (`pendiente`, `pagada`, `anulada`), raise an error (FK stays `restrict` as a last guard).
- The errors use a recognisable message (e.g. code `P0001`, message prefix `factura_emitida`) and the app
  shows a Spanish notice where opportunities are moved or deleted (kanban in `page.tsx`, detail in
  `src/app/oportunidades/[id]/page.tsx`): "Esta oportunidad tiene la factura F-2026-0007 emitida. Anúlala antes
  de cambiarla." This is the only change to the pipeline UI.

### Amounts (builder's call)

- Sold / invoiced comparisons and **Vendido**, **Sin facturar**, **Facturado este mes** use amounts **without IVA**
  (`precio`, `base`).
- **Pendiente de cobro** and **Vencido** use totals **with IVA** (what customers owe).
- **Facturado** = `pendiente` + `pagada` by `fecha_emision`; drafts and cancelled invoices never count.
- Numbering is done in the database (trigger on transition `borrador -> pendiente`) so two users cannot get
  the same number.
- RLS and realtime follow the existing project pattern (`for all to anon, authenticated`, add to
  `supabase_realtime`) — same as the RRHH tables.
- Migration file: `supabase/migrations/20261028120000_ventas_facturas.sql`, idempotent like the others.
  It is tried first inside `begin; … rollback;` before being applied.

## Screens

### Ventas tab

- KPIs (`crm-kpi-grid`): **Vendido este mes** (with % vs previous month), **Vendido este año**,
  **Sin facturar** (amount + number of sales).
- Chart card: sold vs invoiced per month, last 12 months, bar chart with the same Chart.js setup and theme
  colors as `CrmCharts`.
- Table (`crm-table`): Cliente, Proyecto, Fecha (ganada_en), Importe, Factura (status pill:
  *Sin facturar* / *Borrador* / invoice number). Search by client or project.
- Row action **Crear factura** when the sale has no invoice; otherwise a link that switches to the
  Facturas tab filtered to that invoice.
- Empty state (`EmptyState`) when there are no won opportunities, pointing to Oportunidades.

### Facturas tab (prototype 1)

- Header actions: **Nueva factura** (opens the same dialog with a picker of sales without invoice).
- KPIs: **Facturado este mes**, **Pendiente de cobro** (pending, incl. overdue; amount + count),
  **Vencido** (amount + count, danger color like `crm-kpi-lost`).
- Filter chips: Todas, Borrador, Pendiente, Vencida, Pagada, Anulada (with counts). Search by client or number.
- Table: Nº factura, Cliente, Emisión, Vencimiento, Base, Total (IVA 21 %), Estado, Acciones.
- Status pills reuse `rrhh-status` variants: Pagada = success, Vencida = danger, Pendiente/Borrador/Anulada = neutral.
- Row actions: Borrador → **Emitir**, **Editar** (dates only), **Eliminar** (confirm modal); Pendiente/Vencida →
  **Marcar como pagada**, **Anular** (confirm modal explaining the sale returns to Sin facturar);
  Pagada and Anulada → none.

### Invoice dialog

`Modal` + `FormField`: Venta * (only in "Nueva factura"; sales with price and no live invoice), Fecha de emisión *,
Vencimiento *, and read-only Base imponible, IVA 21 % and total. Buttons: **Guardar borrador** and **Emitir**.
Validation messages follow the existing form conventions.

## Code layout (decided by builder, following the project)

- `src/lib/crm/facturas.ts` — types, `mapFacturaRow`, `invoiceStatus` (adds `vencida`), `invoiceTotal`,
  monthly aggregation helpers.
- `src/components/ventas/VentasPanel.tsx`, `FacturasPanel.tsx`, `InvoiceDialog.tsx`, `SalesChart.tsx`.
- `page.tsx`: fetch `facturas` in `fetchData`, map `ganada_en` in `mapOpportunityRow`, add view `sales`,
  subscribe to realtime for `facturas`.
- `DashboardShell.tsx`: new `NavKey` `sales`, new nav section "Ventas".
- CSS only for what existing classes cannot cover, added to `globals.css` with existing tokens.

## Constraints

- Next 16 / React 19: read `node_modules/next/dist/docs/` before using any routing API.
- `npm run lint` and `npm run build` must pass. There is no test runner in the project.
- Spanish UI copy, English code. WCAG: labels, focus, keyboard, contrast as in the rest of the app.
- No git commits or branches until the user decides (pending decision).

## Left to the builder

Exact component split, Chart.js options, copy of empty states and notices.
