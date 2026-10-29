# Agente IA — design

Date: 2026-10-28. Status: draft for approval. Builds on `2026-10-28-ventas-facturacion-design.md` (implemented).

## Intent

The SGE assignment's third part: an AI agent inside **Ventas y facturación**. Two jobs:

1. **Invoice from a photo** — someone uploads a photo of an existing paper invoice and gets a prefilled
   invoice form instead of typing it.
2. **Chat** — ask questions about sales and invoices and ask for changes in plain Spanish.

Success: in front of the teacher, a photo of an invoice becomes a correct invoice in the CRM in a few clicks,
and the chat answers questions with real data and can carry out a change after the user confirms it.

## Goals (user decisions)

- **Photo upload lives in the Facturas tab**: a **Desde foto** button next to **Nueva factura**.
- Flow: choose image -> AI reads it -> **client step** -> **prefilled form** -> user reviews/edits -> **confirm**.
  Nothing is saved before the user confirms.
- An invoice **no longer needs an opportunity** (sale). Photo invoices are linked to a client only.
- **Client is mandatory.** If the photo has no name, the client must be chosen before the form.
  If the name read matches one or more existing clients, the user **must choose which one** (or "cliente nuevo")
  before anything is linked, so an invoice is never silently attached to the wrong existing client.
- **Date and amounts come from the photo.** **Invoice number = the number printed on the photo** (not the
  F-YYYY-NNNN series).
- **IVA is selectable** (21 %, 10 %, 4 %, 0 %), prefilled with what the AI read.
- Checkbox **Ya está pagada**: checked -> saved as Pagada; unchecked -> Pendiente.
- **The photo is stored** and can be opened later from the Facturas table (**Ver foto**).
- Photo invoices look like any other invoice (same table, same pills, same actions).
- **Agente IA** is a third tab next to Ventas and Facturas, containing only the chat.
- The chat can **make changes**, but **every change requires a Confirmar button** the user presses; the agent
  never writes by itself. Changes respect every existing rule (DB triggers, blocked opportunities, etc.).
- Model: **OpenRouter**, model `nvidia/nemotron-3.5-super-vl:free` (user choice; verified 2026-10-28 to accept
  images, tools and structured outputs; a real tool call returned correctly).
- Key and model in `.env.local`: `OPENROUTER_API_KEY` (the user adds it; agents never read or write `.env*`)
  and optional `OPENROUTER_MODEL` (default the model above).

## Non-goals

- Multi-line invoices (still base + IVA + total), credit notes, PDF upload (images only), OCR libraries.
- Persisting chat history (builder's call: the conversation resets on reload).
- Purchase/supplier invoices as a separate concept: photo invoices are customer invoices like the rest.

## Anti-goals

- The AI writing to the database without a user click.
- Linking an invoice to an existing client without the user choosing it.
- Exposing `OPENROUTER_API_KEY` to the browser, or letting anyone without a CRM session spend it.
- New visual language: reuse `Modal`, `FormField`, `EmptyState`, `crm-*`, `filter-chip`, `btn*`, `notice`.

## Data model changes (decided)

New migration (idempotent, tested on PGlite like `20261028120000_ventas_facturas.sql`):

- `facturas.oportunidad_id` becomes **nullable**. Keep the partial unique index (one live invoice per sale)
  for rows that have a sale.
- Check: an invoice has an opportunity **or** an `empresa_id` (never neither).
- New column `origen text not null default 'venta'` check in (`venta`, `foto`).
- New column `foto_path text null` (object path in the storage bucket).
- `iva_pct` check in (21, 10, 4, 0).
- Trigger `facturas_before_write` gets a second path for `origen = 'foto'` inserts:
  insert directly as `pendiente` or `pagada` (pagada sets `pagada_en = current_date`), **with the provided
  `numero`** (required, trimmed, unique — a duplicate raises `factura_numero_duplicado:<numero>`), and the
  provided `fecha_emision`, `fecha_vencimiento`, `base`, `iva_pct`. After insert, photo invoices follow the
  same immutability and transitions as issued invoices (pendiente -> pagada | anulada). `origen = 'venta'`
  keeps today's behaviour unchanged (draft first, F-YYYY-NNNN on issue).
- The F-YYYY-NNNN counter only considers numbers matching `^F-\d{4}-\d+$`, so photo numbers never break it.
- Storage bucket `facturas-fotos` (public read, 10 MB, `image/png`, `image/jpeg`, `image/webp`), policies like
  `rrhh-archivos`. Path `<factura id>/<timestamp>.<ext>`.

Domain (`src/lib/crm/facturas.ts`): `Invoice` gains `origen`, `foto_path`, nullable `oportunidad_id`;
everything that resolves a client for an invoice uses `empresa_id` first, then the opportunity.
Sales logic is unaffected (photo invoices have no sale, so they never change "Sin facturar"); invoice KPIs
include photo invoices like any other issued invoice.

## Server (decided)

- Route handlers under `src/app/api/agente/` (Next 16 App Router — read `node_modules/next/dist/docs/` first):
  - `POST /api/agente/factura-foto`: receives the image, asks the model for a **structured result**
    `{ cliente_nombre | null, cliente_nif | null, numero | null, fecha_emision | null, fecha_vencimiento | null,
    base | null, iva_pct | null, total | null }` and returns it. It does **not** write to the DB.
  - `POST /api/agente/chat`: streams the chat. Read tools (list/search invoices, sales summary, clients) run on
    the server with the Supabase server client. **Change tools are proposals only**: they return the change to
    the browser, which shows a card with **Confirmar** / **Cancelar**; on Confirmar the browser runs the same
    Supabase update the existing UI uses and reports the result back to the chat.
  - Change tools: mark invoice paid, cancel (anular) invoice, issue a draft, create a draft invoice from a sale.
- Every route requires the user's Supabase session (access token sent by the client, verified with
  `auth.getUser`); otherwise 401. The key is only read from `process.env` on the server.
- Library (builder's call, following "use maintained libraries"): Vercel **AI SDK** with the
  **OpenRouter provider** (`ai`, `@ai-sdk/react`, `@openrouter/ai-sdk-provider`, `zod`): `generateObject` for the
  photo, `streamText` + `useChat` with client-side confirmation for the chat. Builder checks the current
  major versions and their docs before coding.
- Errors: OpenRouter rate limit (free tier, ~50 free requests/day under 10 $ credit) and model errors become a
  clear Spanish message in the UI ("El agente ha alcanzado el límite diario gratuito. Inténtalo mañana."),
  never a blank failure. Missing key -> "Falta configurar OPENROUTER_API_KEY." shown to the user.

## Screens

### Facturas tab — Desde foto

1. **Desde foto** (btn) opens a `Modal` with an image input (camera allowed on mobile via `accept="image/*"`),
   preview, and **Leer factura**. While reading: busy state "Leyendo la factura...".
2. **Client step**: shows the name/NIF read. Lists existing clients whose name or NIF match (case- and
   accent-insensitive contains/similarity); the user picks one or **Cliente nuevo** (creates the empresa with the
   name/NIF on confirm). With no name read, a required client picker (existing clients + Cliente nuevo with a
   name field).
3. **Form** (`FormField`): Cliente (read-only, from step 2, with "Cambiar"), Nº factura *, Fecha de emisión *,
   Vencimiento * (default emission + 30 if not read), Base imponible *, IVA (select 21/10/4/0) *, Total
   (computed, and a warning if it differs from the total read by more than 0,05 €), checkbox Ya está pagada,
   the photo thumbnail. **Guardar factura** saves (upload photo -> insert invoice -> notice
   "Factura <numero> guardada."). Fields the AI could not read are empty and marked for the user.
4. The table shows **Ver foto** (opens the stored image) for `origen = 'foto'`.

### Nueva factura dialog

IVA becomes the same select (default 21 %). Everything else unchanged.

### Agente IA tab

Layout of prototype 6 (`prototipos/ventas-facturacion-ia.html`, "Agente primero"): heading, suggestion chips
("¿Qué facturas están vencidas?", "Resume este mes", "¿Qué ventas faltan por facturar?"), message list, composer.
Agent messages may contain simple tables (rendered from markdown or structured parts — builder's call) and
**proposal cards** (description of the change + Confirmar/Cancelar). After Confirmar, the card shows the
result (done / error message from the DB, e.g. the `factura_emitida` block message).

## Constraints

- Next 16, React 19, TS; Spanish UI, English code; WCAG (labels, focus, keyboard, live region for streamed
  replies, `aria-busy`).
- `npm test`, `npx tsc --noEmit`, lint (no new errors) must pass. Domain logic and the migration get tests;
  model calls are not hit in tests (mock the provider boundary or test the pure parts: schema parsing, client
  matching, totals).
- No git commits or branches (user: the teacher must approve first).
- Agents never read `.env*` nor print keys.

## Builder's calls (after the design review)

- **Runs locally** (`npm run dev`) for the demo; route handlers still set `maxDuration = 60` because the free
  model can take tens of seconds.
- **Amounts:** stored values are what the user confirms in the form: `base` and `iva_pct`; total is derived as
  everywhere else. Prefill: base read from the photo; if only the total is read, base = total / (1 + IVA)
  rounded to 2 decimals. If the photo total differs from the computed total by more than 0,05 €, the form shows a
  warning next to Total and still lets the user save.
- **Numbers stay globally unique** (photo invoices are this company's own invoices to its clients). A clash is
  a hard error shown on the Nº factura field: "Ya existe una factura con el número <numero>."
- **Past dates are allowed** for photo invoices, including a past due date and saving directly as Pagada.
  Only `fecha_vencimiento >= fecha_emision` is enforced.
- **Client matching:** an exact NIF match (normalised: uppercase, no spaces/dashes) is listed first and
  preselected but not forced; then name matches (case- and accent-insensitive). **Cliente nuevo** creates the
  empresa with name (required) and NIF (optional).
- **Auth:** routes receive the user's access token, verify it with `auth.getUser`, and run read tools with a
  Supabase client that forwards that token. There is no service-role key and no per-user roles: any logged-in
  user may propose and confirm any change, as in the rest of the CRM.
- **Photo storage order:** the browser generates the invoice `id` (UUID), uploads the photo to
  `<id>/<timestamp>.<ext>`, then inserts the invoice with that `id` and `foto_path` in one insert (issued photo
  invoices are immutable, so `foto_path` cannot be added later). If the insert fails, the uploaded file is
  removed.

## Left to the builder

Component split, prompt wording (Spanish, short, tells the model today's date and the data shape), client
matching algorithm details, chat markdown rendering, exact copy of secondary messages.
