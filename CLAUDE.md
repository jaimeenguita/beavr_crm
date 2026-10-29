@AGENTS.md

# beavr-table (CRM beavr)

Project rules for Claude / Cursor. Keep this file under ~200 lines. Update when the stack or conventions change.

## Qué es

CRM **beavr** (Salesianos SGE+DDI): oportunidades, empresas, contactos/empleados, módulo RRHH (plantilla, fichajes, vacaciones, nóminas) y módulo Ventas y facturación (`/?vista=ventas`, pestañas Ventas, Facturas y Agente IA). Lo usan comerciales y personal interno. App Next.js en esta carpeta; la landing vive en `../beavr-landing`.

## Datos

- Persistencia: **Supabase** (cliente browser + server en `src/lib/supabase/`).
- Dominio CRM/RRHH: `src/lib/crm/` (`stages`, `rrhh`, `format`, mapas de filas).
- **No tocar** datos de producción ni pegar secretos. No leer ni mostrar `.env` / `.env.local` con claves.

## Stack

| Tecnología | Versión / nota |
|---|---|
| Next.js | 16.3.x (App Router) — leer `AGENTS.md` y docs en `node_modules/next/dist/docs/` |
| React | 19.2.x |
| TypeScript | 5.x |
| Tailwind CSS | 4.x |
| Supabase JS | 2.x |
| Chart.js / react-chartjs-2 | dashboards |
| pdf-lib | PDFs (p. ej. nóminas) |
| AI SDK (`ai`, `@ai-sdk/react`) + OpenRouter | agente IA: chat (`useChat`) y lectura de facturas desde foto |
| Vitest | dev: tests de dominio y de migraciones |
| PGlite | dev: Postgres en memoria para probar migraciones |

## Mapa

```
src/app/           # rutas: /, empresas, empleados, oportunidades, rrhh, api/leads, api/agente (chat, factura-foto)
src/components/    # UI CRM + rrhh/ + ventas/ (Ventas y facturación) + FormField, Modal, DashboardShell
src/lib/crm/       # dominio y formato (incl. facturas.ts)
src/lib/agente/    # agente IA: modelo y auth (server.ts), herramientas (tools.ts), vista del chat (chat.ts)
src/lib/supabase/  # clientes Supabase
supabase/          # SQL / migraciones del proyecto
```

## Comandos

```bash
npm install          # dependencias (no hay npm ci estricto en el repo)
npm run dev          # Next dev → http://localhost:3000
npm run lint         # eslint
npm run build        # producción; evitar con `dev` ya en marcha
npm run start        # sirve el build
npm test             # vitest: domain logic + migration on PGlite
```

No hay script `typecheck` en `package.json`; para comprobar tipos usar `npx tsc --noEmit`. Si se añade, documentarlo aquí.

## Convenciones

- Respuestas al usuario en **castellano**. Código, comentarios, commits y docs técnicas en **inglés**.
- Reutilizar componentes existentes (`FormField`, dialogs, `EmptyState`, shells).
- Formularios: etiqueta visible encima; placeholder solo como ejemplo (`Ej.: …`); obligatorios con `*`; ayuda con `form-help`. Skill **erp** + `ux-checklist.md`.
- Accesibilidad: skill **pautasWCAG** al tocar UI.
- Jerarquía ERP/CRM: skill **erp** (CRM ⊂ ERP; menú lateral; lista/ficha/formulario/dashboard).
- No inventar módulos fuera de la jerarquía SGE+DDI sin ubicarlos.

## Diseño

- Tokens y tipografía: `src/app/globals.css` (variables CSS del producto).
- Componentes de interacción: `src/components/` (evitar cards decorativas innecesarias).
- Tema: `ThemeProvider`.

## Entorno

Nombres (nunca valores en este fichero):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENROUTER_API_KEY` (solo servidor; la añade el usuario, los agentes no la leen ni la escriben)
- `OPENROUTER_MODEL` (opcional; por defecto el modelo de `src/lib/agente/server.ts`)

Copiar/ajustar en `.env.local` (gitignored).

## Git

- Conventional Commits cuando el usuario pida commit: `feat(crm): …`, `fix(rrhh): …`.
- Ramas sugeridas: `feature/…`, `fix/…`.
- No hacer push ni force-push salvo petición explícita.
- No commitear `.env*`, claves ni tokens.

## Errores conocidos

- El `package.json` puede mostrar `"name": "beavr-landing"` aunque la carpeta sea `beavr-table` — no renombrar sin pedirlo.
- `AGENTS.md` lo regenera `next dev`; conservar el bloque Next.js agent rules.
- Next 16 ≠ Next “clásico”: consultar docs locales antes de APIs deprecadas.
- Computer-use / automatizar el escritorio solo si el usuario lo autoriza; no abrir apps al azar.

## Skills Cursor (este equipo)

- `erp` → `~/.cursor/skills/erp/` (jerarquía + UX FormField)
- `pautasWCAG` → `~/.cursor/skills/pautasWCAG/`
- `metodo-trabajo` → `~/.cursor/skills/metodo-trabajo/` (reparto principal/subagentes)
