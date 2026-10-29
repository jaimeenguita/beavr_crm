# Ventas y facturación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Ventas y facturación" view to the beavr CRM with a Ventas tab (won opportunities) and a Facturas tab (new `facturas` table), following prototype 1.

**Architecture:** One SQL migration adds `oportunidades.ganada_en`, the `facturas` table and the integrity/numbering triggers. Pure domain logic lives in `src/lib/crm/facturas.ts`. `page.tsx` loads `facturas` next to the other tables and renders a new `sales` view made of `VentasPanel` / `FacturasPanel` in `src/components/ventas/`.

**Tech Stack:** Next.js 16.3 (App Router, client page), React 19.2, TypeScript 5, Supabase JS 2, Chart.js 4 + react-chartjs-2, Tailwind 4 + `globals.css`. New dev-only: `vitest`, `@electric-sql/pglite` (in-process Postgres to test the migration).

**Spec:** `docs/superpowers/specs/2026-10-28-ventas-facturacion-design.md`

## Global Constraints

- UI copy in Spanish (Spain); code, comments, identifiers and docs in English. No emoji.
- Only existing tokens/classes/components: `crm-kpi-grid`, `crm-kpi`, `crm-kpi-lost`, `crm-table`, `crm-table-wrap`, `crm-toolbar`, `filter-chip`, `rrhh-tabs`, `rrhh-status*`, `btn*`, `search-box`, `notice`, `Modal`, `FormField`, `EmptyState`. New CSS only if no class fits, using existing variables.
- Next 16: read the relevant guide in `node_modules/next/dist/docs/` before using any routing API.
- `npm run lint`, `npm test` and `npm run build` must pass at the end of every task (build only if `next dev` is not running).
- IVA is fixed at 21 %. Invoice number format `F-YYYY-NNNN` (year of `fecha_emision`, 4-digit counter per year).
- Won = `estado in ('won', 'ganada')`.
- Never read `.env*`. **No git commits or branches** (the user deferred git); each task ends by listing changed files instead.
- The migration is never applied to the remote Supabase by an agent. The main session gives it to the user.

## Review Focus

1. Two invoices issued at the same moment must never get the same number (advisory lock + unique index) — Task 1 test `numbers are correlative per year`.
2. Moving an invoiced opportunity out of Ganada from the kanban must show a notice, not silently revert — Task 3 manual check + `invoiceBlockMessage` test in Task 2.
3. Invoice due today is not overdue; due yesterday is — Task 2 test `isOverdue boundary`.
4. A won sale with `precio` null is listed as *Sin precio* and never counted in amounts or offered in the dialog — Task 2 test `salesSummary ignores null price` and Task 4.
5. A cancelled invoice frees its sale for a new invoice but keeps its number — Task 1 test `anulada frees the sale`.

---

### Task 1: Migration and its tests

**Files:**
- Modify: `package.json` (devDependencies `vitest`, `@electric-sql/pglite`; script `"test": "vitest run"`)
- Create: `vitest.config.mts` (alias `@` → `./src`, `environment: "node"`)
- Create: `supabase/migrations/20261028120000_ventas_facturas.sql`
- Test: `supabase/tests/ventas-facturas.test.ts`

**Interfaces:**
- Produces (DB): column `oportunidades.ganada_en timestamptz`; table `facturas(id, numero, oportunidad_id, empresa_id, fecha_emision, fecha_vencimiento, base, iva_pct, estado, pagada_en, anulada_en, created_at, updated_at)` exactly as in the spec; errors raised with message prefix `factura_emitida:` followed by the invoice number (e.g. `factura_emitida:F-2026-0007`).

- [ ] **Step 1: Install dev tools** — `npm install -D vitest @electric-sql/pglite`; add the `test` script and `vitest.config.mts`.
- [ ] **Step 2: Write the failing tests** in `supabase/tests/ventas-facturas.test.ts`. `beforeEach` creates a fresh `PGlite`, runs `create role anon; create role authenticated; create publication supabase_realtime;`, then every file in `supabase/migrations/` in name order **skipping files that contain `storage.`**. Tests (each inserts an empresa + an opportunity with `estado='won'`, `precio=1000`):
  - `ganada_en is set on win and cleared on leaving won` — insert as `new`, update to `won` → `ganada_en` not null; update to `lost` (no invoice) → null.
  - `backfill uses creado_en` — covered by asserting the migration's `update` sets `ganada_en = creado_en` for rows already won when the migration ran (insert the won row *before* running the new migration file).
  - `draft has no number; issuing assigns F-YYYY-0001 then 0002` — named `numbers are correlative per year`; also a draft with `fecha_emision='2027-01-02'` issued afterwards gets `F-2027-0001`.
  - `second live invoice for the same sale fails` (unique violation).
  - `anulada frees the sale` — issue, set `estado='anulada'` → keeps `numero`, `anulada_en` set; a new draft for the same opportunity inserts fine.
  - `issued invoice blocks leaving won` — update opportunity to `lost` rejects with message starting `factura_emitida:F-`.
  - `draft is deleted when leaving won` — opportunity moves to `lost`, draft row is gone.
  - `delete opportunity: drafts go, issued blocks` — with only a draft: delete succeeds and draft is gone; with an issued or anulada invoice: delete rejects with `factura_emitida:`.
  - `issued invoices are immutable` — updating `base` or `fecha_vencimiento` of a `pendiente` invoice rejects; `pagada -> pendiente` rejects; `borrador -> pagada` rejects.
  - `fecha_vencimiento before fecha_emision fails` (check constraint).
- [ ] **Step 3: Run** `npm test -- supabase` → FAIL (table `facturas` does not exist).
- [ ] **Step 4: Write the migration**, idempotent like existing ones (`if not exists`, `drop trigger if exists`, `do $$` guard for the publication):
  - column + backfill (`where estado in ('won','ganada') and ganada_en is null`);
  - `facturas` table, checks, partial unique index `facturas_oportunidad_live_idx on (oportunidad_id) where estado <> 'anulada'`, unique `numero`, indexes on `estado` and `fecha_emision`;
  - `set_updated_at` trigger, RLS + policy `facturas_all for all to anon, authenticated using (true) with check (true)`, add to `supabase_realtime`;
  - `facturas_before_write` (before insert or update): allowed transitions only `borrador→borrador` (dates/base), `borrador→pendiente`, `pendiente→pagada` (sets `pagada_en = current_date`), `pendiente→anulada` (sets `anulada_en = current_date`); any other change to a non-draft row raises. On `borrador→pendiente`: `perform pg_advisory_xact_lock(hashtext('facturas_numero'))`, then `numero = format('F-%s-%s', year, lpad((max counter for that year + 1)::text, 4, '0'))`.
  - `oportunidades_ganada_en` (before update of `estado`): set/clear `ganada_en`; when leaving won: raise `factura_emitida:<numero>` if a `pendiente`/`pagada` invoice exists, else delete `borrador` rows.
  - `oportunidades_before_delete`: delete `borrador` rows; raise `factura_emitida:<numero>` if any invoice remains. FK stays `on delete restrict`.
- [ ] **Step 5: Run** `npm test -- supabase` → all PASS. Then `npm run lint`.
- [ ] **Step 6: Report** changed files (no commit).

### Task 2: Domain logic `src/lib/crm/facturas.ts`

**Files:**
- Create: `src/lib/crm/facturas.ts`
- Modify: `src/lib/crm/mapRows.ts` (add `ganada_en: string | null` to `MappedOpportunity` and its mapper)
- Test: `src/lib/crm/facturas.test.ts`

**Interfaces:**
- Consumes: `MappedOpportunity` (with new `ganada_en`), `formatPrice` from `money.ts`.
- Produces:
  - `type InvoiceState = "borrador" | "pendiente" | "pagada" | "anulada"`; `type InvoiceStatus = InvoiceState | "vencida"`
  - `type Invoice = { id; numero: string | null; oportunidad_id: string; empresa_id: string | null; fecha_emision: string; fecha_vencimiento: string; base: number; iva_pct: number; estado: InvoiceState; pagada_en: string | null; anulada_en: string | null }`
  - `mapFacturaRow(row: Record<string, unknown>): Invoice`
  - `IVA_PCT = 21`, `DEFAULT_DUE_DAYS = 30`
  - `invoiceTotal(inv: Pick<Invoice,"base"|"iva_pct">): number` (2-decimal rounding)
  - `isOverdue(inv: Invoice, today: Date): boolean`; `invoiceStatus(inv: Invoice, today: Date): InvoiceStatus`
  - `INVOICE_STATUS_LABELS: Record<InvoiceStatus, string>` (`Borrador`, `Pendiente`, `Vencida`, `Pagada`, `Anulada`)
  - `isWon(opp: MappedOpportunity): boolean`
  - `type Sale = { opportunity: MappedOpportunity; invoice: Invoice | null }` — live (non-anulada) invoice only
  - `buildSales(opps: MappedOpportunity[], invoices: Invoice[]): Sale[]` sorted by `ganada_en` desc
  - `salesSummary(sales: Sale[], today: Date): { monthTotal: number; prevMonthTotal: number; yearTotal: number; uninvoicedTotal: number; uninvoicedCount: number; noPriceCount: number }`
  - `invoiceSummary(invoices: Invoice[], today: Date): { invoicedMonth: number; pendingTotal: number; pendingCount: number; overdueTotal: number; overdueCount: number }`
  - `monthlySoldVsInvoiced(sales: Sale[], invoices: Invoice[], today: Date): { labels: string[]; sold: number[]; invoiced: number[] }` — last 12 months ending in `today`'s month, labels `"oct 26"` style via `toLocaleDateString("es-ES", { month: "short", year: "2-digit" })`
  - `invoiceBlockMessage(error: { message?: string } | null): string | null` — returns `Esta oportunidad tiene la factura <numero> emitida. Anúlala antes de cambiarla.` when the message contains `factura_emitida:`, else `null`
  - `addDays(isoDate: string, days: number): string` (YYYY-MM-DD)

- [ ] **Step 1: Write failing tests** with `today = new Date(2026, 9, 28)`:
  - `invoiceTotal({base:1000, iva_pct:21}) === 1210`; `invoiceTotal({base:2980, iva_pct:21}) === 3605.8`.
  - `isOverdue boundary`: pendiente due `2026-10-28` → false; due `2026-10-27` → true; pagada due `2026-01-01` → false.
  - `invoiceStatus` returns `vencida` only for overdue pendiente.
  - `buildSales` excludes non-won and ignores anulada invoices (sale with only an anulada invoice has `invoice: null`).
  - `salesSummary ignores null price`: a won sale with `precio: null` adds 1 to `noPriceCount` and 0 to every amount; `uninvoicedTotal` counts sales with price and no live invoice.
  - `salesSummary` month totals use `ganada_en` (Oct vs Sep).
  - `invoiceSummary`: drafts and anulada excluded everywhere; `invoicedMonth` uses `base` of pendiente+pagada emitted this month; `pendingTotal` uses totals with IVA of pendiente (incl. overdue); overdue subset.
  - `monthlySoldVsInvoiced` returns 12 labels, last one is October 2026, values in the right buckets.
  - `invoiceBlockMessage({message:"factura_emitida:F-2026-0007"})` contains `F-2026-0007`; unrelated message → `null`.
  - `addDays("2026-10-28", 30) === "2026-11-27"`.
- [ ] **Step 2: Run** `npm test -- facturas` → FAIL.
- [ ] **Step 3: Implement** the module and the `ganada_en` mapping (`strOrNull(row.ganada_en)`). Date math in local time on `YYYY-MM-DD` strings, no new date library.
- [ ] **Step 4: Run** `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Report** changed files.

### Task 3: Wiring — nav, view, data loading, pipeline notices

**Files:**
- Modify: `src/components/DashboardShell.tsx` (NavKey `"sales"`, new `NavSection` label `Ventas` between CRM and RRHH with item `Ventas y facturación` → `/?vista=ventas`, icon = rising line; `resolveActive` handles `ventas`)
- Modify: `src/app/page.tsx` (`HomeView` `"sales"`, `resolveView("ventas")`, title `Ventas y facturación` / subtitle `Ventas ganadas y facturas a clientes`; fetch `facturas` in `fetchData` ordered by `fecha_emision` desc into `invoiceRecords: Invoice[]`; add a second `postgres_changes` listener on `facturas` to the existing channel; kanban `handleDrop` shows `notice` with `invoiceBlockMessage(error) ?? "No se ha podido mover la oportunidad. Inténtalo de nuevo."` on error)
- Modify: `src/app/oportunidades/[id]/page.tsx:126-135,170-178` (status change and delete use `invoiceBlockMessage(error) ??` the existing message)
- Create: `src/components/ventas/VentasModule.tsx` (rendered by `page.tsx` for the `sales` view)

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `VentasModule({ opportunities, invoices, onChanged, onNotice }: { opportunities: MappedOpportunity[]; invoices: Invoice[]; onChanged: () => Promise<void>; onNotice: (n: { type: "success" | "error"; text: string }) => void })`. It reads `tab` from `useSearchParams()` (`facturas` → Facturas, anything else → Ventas), renders the tabs as `rrhh-tabs` + `filter-chip` `Link`s (`/?vista=ventas`, `/?vista=ventas&tab=facturas`) with `aria-current="page"` on the active one, and renders `VentasPanel` / `FacturasPanel` (Tasks 4–5). Until those exist it renders the tabs only.

- [ ] **Step 1:** Implement the changes above. No new tests (UI wiring); behaviour is covered by Tasks 1–2.
- [ ] **Step 2: Run** `npm run lint` and `npm test` → PASS.
- [ ] **Step 3: Report** changed files.

### Task 4: Ventas tab

**Files:**
- Create: `src/components/ventas/VentasPanel.tsx`
- Modify: `src/components/CrmCharts.tsx` (export `SalesVsInvoicedChart({ labels, sold, invoiced })`, a grouped `Bar` reusing the private `useChartPalette`, `tooltipDefaults`, `CHART_ANIMATION`; sold = `palette.text`, invoiced = `palette.muted`; y-axis ticks via `formatPrice`)
- Modify: `src/components/ventas/VentasModule.tsx` (render `VentasPanel`)

**Interfaces:**
- Consumes: `buildSales`, `salesSummary`, `monthlySoldVsInvoiced`, `INVOICE_STATUS_LABELS`, `formatPrice`, `formatDateEs`, `EmptyState`.
- Produces: `VentasPanel({ sales, invoices, onCreateInvoice }: { sales: Sale[]; invoices: Invoice[]; onCreateInvoice: (sale: Sale) => void })`.

- [ ] **Step 1:** Build the panel per spec "Ventas tab": 3 KPIs (`Vendido este mes` with `+x,x % frente a <mes anterior>` or `Sin ventas el mes anterior`; `Vendido este año`; `Sin facturar` with `<n> ventas`), chart card, `crm-toolbar` with `search-box` (`Buscar por cliente o proyecto`), table columns Cliente (link to `/empresas/<id>` when `empresa_id`), Proyecto, Fecha, Importe, Factura, Acciones. Factura cell: no price → neutral pill `Sin precio` + link `Poner precio` to `/oportunidades/<id>`; no invoice → `rrhh-status-pendiente` style pill `Sin facturar` + `btn btn-compact` `Crear factura`; otherwise status pill + number linking to `/?vista=ventas&tab=facturas&factura=<id>`. Empty state: title `Todavía no hay ventas`, description `Las oportunidades que marques como Ganada aparecerán aquí.`, action link `Ir a Oportunidades`.
- [ ] **Step 2: Run** `npm run lint`, `npm test` → PASS.
- [ ] **Step 3: Report** changed files.

### Task 5: Facturas tab and invoice dialog

**Files:**
- Create: `src/components/ventas/FacturasPanel.tsx`
- Create: `src/components/ventas/InvoiceDialog.tsx`
- Modify: `src/components/ventas/VentasModule.tsx` (render `FacturasPanel`; own the dialog state so Ventas' `Crear factura` and Facturas' `Nueva factura` open the same dialog; switching tab after creating from Ventas is not required)

**Interfaces:**
- Consumes: Task 2 exports, `Modal`, `CloseButton`, `FormField`, `RequiredMark`, `EmptyState`, `createSupabaseBrowserClient`.
- Produces:
  - `InvoiceDialog({ mode, sales, invoice, onClose, onSaved }: { mode: "create" | "edit"; sales: Sale[]; invoice?: Invoice; onClose: () => void; onSaved: (text: string) => void })` — `sales` are the selectable ones (with price, no live invoice); in `create` with one preselected sale the select is still shown with that value.
  - `FacturasPanel({ invoices, opportunities, highlightId, onNew, onEdit, onChanged, onNotice })`.

- [ ] **Step 1: Dialog.** Fields: `Venta *` (select, `<cliente> · <proyecto> · <importe>`; create only), `Fecha de emisión *` (date, default today), `Vencimiento *` (date, default `addDays(emision, DEFAULT_DUE_DAYS)`, help `Por defecto, 30 días después de la emisión`), read-only summary Base / IVA 21 % / Total. Validation: venta required; vencimiento ≥ emisión (`El vencimiento no puede ser anterior a la emisión.`). Buttons `Guardar borrador` (btn) and `Emitir factura` (btn-primary). Insert copies `empresa_id` and `base = precio` from the opportunity; edit/issue refreshes `base` from the current `precio`. Issuing a new invoice = insert as borrador then update to `pendiente` (the DB assigns the number); success text `Factura <numero> emitida.` / `Borrador guardado.`. DB errors → `No se ha podido guardar la factura. Inténtalo de nuevo.` shown in the dialog (`form-error`).
- [ ] **Step 2: Panel.** Header row: `Nueva factura` (btn-primary). KPIs: `Facturado este mes` (sin IVA), `Pendiente de cobro` (`<n> facturas`), `Vencido` (`crm-kpi-lost`, `<n> facturas`). Chips `Todas, Borrador, Pendiente, Vencida, Pagada, Anulada` with counts, `aria-pressed`. Search `Buscar por cliente o número`. Columns per spec; numbers right-aligned with `tabular-nums`; draft number cell `—`. Row from `highlightId` (query param `factura`) gets the selected style and is scrolled into view. Actions per spec; `Eliminar` and `Anular` confirm with `Modal` (`¿Anular la factura <numero>? Conservará su número y la venta volverá a Sin facturar.`). Updates: `estado: 'pendiente'` (Emitir, with refreshed base), `'pagada'`, `'anulada'`; delete only drafts. After each action call `onChanged()` and `onNotice`. Empty state: `Todavía no hay facturas` / `Crea la primera desde una venta ganada.`
- [ ] **Step 3: Run** `npm run lint`, `npm test`, `npm run build` → PASS.
- [ ] **Step 4: Report** changed files.

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md` (Comandos: `npm test  # vitest: domain logic + migration on PGlite`; remove the line saying there is no test script; Qué es / Mapa: mention module Ventas y facturación and `src/components/ventas/`)

- [ ] **Step 1:** Update the file. **Step 2:** Report.

---

## After the tasks (main session)

1. Whole-change code review (superpowers:requesting-code-review).
2. Give the user `supabase/migrations/20261028120000_ventas_facturas.sql` to run first wrapped in `begin; … rollback;` in the Supabase SQL editor, then for real.
3. Verify in one browser: `npm run dev`, Ventas tab, create/issue/pay/cancel an invoice, try to move the invoiced opportunity out of Ganada, light and dark theme.
4. Git: ask the user (pending decision).
