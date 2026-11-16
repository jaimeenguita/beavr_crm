@AGENTS.md

# beavr-table (CRM beavr)

Project rules for Claude / Cursor. Keep this file under ~200 lines. Update when the stack or conventions change.

## Qué es

CRM **beavr** (Salesianos SGE+DDI): oportunidades, empresas, contactos/empleados, módulo RRHH (plantilla, fichajes, vacaciones, nóminas), Ventas y facturación (`/?vista=ventas`) y módulo Web (`/?vista=web`: plantillas `animacion`/`moderna`; vista pública `/sitio/[slug]`). Lo usan comerciales y personal interno. App Next.js en esta carpeta; la landing vive en `../beavr-landing`.

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
src/app/           # rutas: /, empresas, empleados, oportunidades, rrhh, sitio/[slug], api/leads, api/agente
src/components/    # UI CRM + rrhh/ + ventas/ + web/ (sitios) + FormField, Modal, DashboardShell
src/lib/crm/       # dominio y formato (incl. facturas.ts, sitios.ts)
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

- Tokens y tipografía: **`src/app/globals.css`** (`:root` claro + `[data-theme="dark"]`).
- Componentes de interacción: `src/components/` (evitar cards decorativas innecesarias).
- Tema: `ThemeProvider`.
- Skill **ui-web** (artefacto Salesianos «20 consejos UI»): tipografía, contraste, paleta, retícula.
- Contraste texto ≥ 4,5:1; color de marca/acción ~10 % de la UI; estados siempre con texto, no solo color.

### Paleta (usar variables, no hex sueltos)

Fuente de verdad: `src/app/globals.css`. Tabla al estilo del artefacto (color → código claro → uso):

| Token | Claro | Uso |
|---|---|---|
| `--beavr-blue` / `--beavr-blue-deep` | `#111111` | Texto principal / FG |
| `--beavr-blue-soft` | `#3f3f46` | Texto secundario suave |
| `--beavr-muted` / `--subtle` | `#52525b` | Texto atenuado, ayudas |
| `--beavr-surface` | `#ffffff` | Superficies, cards, paneles |
| `--beavr-paper` | `#fafafa` | Fondo papel / capas altas |
| `--beavr-mist` | `#f4f4f5` | Fondo de página (body) |
| `--beavr-line` | `#e4e4e7` | Bordes, divisores |
| `--beavr-accent` | `#111111` | Acciones primarias, foco (solo lo pulsable) |
| `--beavr-accent-hover` | `#27272a` | Hover de acción primaria |
| `--beavr-inverse` | `#ffffff` | Texto sobre accent / sidebar activa |
| `--sidebar-bg` | `#111111` | Fondo menú lateral |
| `--sidebar-fg` | `#fafafa` | Texto menú lateral |
| `--success-fg` (+ bg/border) | `#166534` | Éxito (siempre con texto/icono) |
| `--danger-fg` / `--danger-solid` | `#991b1b` / `#b91c1c` | Error / destructivo |
| `--focus-ring` | `#111111` | Anillo de foco teclado |

Modo oscuro: mismos nombres de token; valores en `[data-theme="dark"]` (fondos ~`#161616`/`#1a1a1a`, no blanco/negro puros en todas las capas).  
Estados semánticos del artefacto: hay **éxito** y **error**; si hace falta aviso/info, añadir tokens (`--warning-*`, `--info-*`) en `globals.css` y reutilizarlos — no inventar hex en componentes.

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
- `ui-web` → `~/.cursor/skills/ui-web/` (tipografía, **paleta**, spacing, carga)
- `pautasWCAG` → `~/.cursor/skills/pautasWCAG/`
- `design-review` → `~/.cursor/skills/design-review/`
- `metodo-trabajo` → `~/.cursor/skills/metodo-trabajo/` (reparto principal/subagentes)
