import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

let db: PGlite;

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }))
    .filter((f) => !f.sql.includes("storage."));
}

function withIdempotentPolicies(sql: string) {
  return sql.replace(
    /create policy ("[^"]+"|[^\s]+)\s+on\s+(\S+)/gi,
    (match, name: string, table: string) => `drop policy if exists ${name} on ${table};
${match}`,
  );
}

const STUBS_BEFORE: Record<string, string> = {
  "20260924000000_normalize_crm_tables.sql": "drop table public.oportunidades cascade;",
};

async function runMigrations() {
  for (const file of migrationFiles()) {
    if (STUBS_BEFORE[file.name]) await db.exec(STUBS_BEFORE[file.name]);
    await db.exec(withIdempotentPolicies(file.sql));
  }
}

async function freshDb() {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create publication supabase_realtime;");
}

describe("sitios_web migration", () => {
  beforeEach(async () => {
    await freshDb();
    await runMigrations();
  });

  it("creates one site per empresa and unique slug", async () => {
    const empresa = (
      await db.query<{ id: string }>("insert into public.empresas (nombre) values ('Acme') returning id")
    ).rows[0].id;

    await db.query(
      `insert into public.sitios_web (empresa_id, slug, plantilla, paleta, contenido)
       values ($1, 'acme', 'animacion', 'clara', '{"hero":{"titulo":"Acme"}}'::jsonb)`,
      [empresa],
    );

    await expect(
      db.query(
        `insert into public.sitios_web (empresa_id, slug, plantilla, paleta, contenido)
         values ($1, 'acme-2', 'moderna', 'oscura', '{}'::jsonb)`,
        [empresa],
      ),
    ).rejects.toThrow();

    const other = (
      await db.query<{ id: string }>("insert into public.empresas (nombre) values ('Beta') returning id")
    ).rows[0].id;

    await expect(
      db.query(
        `insert into public.sitios_web (empresa_id, slug, plantilla, paleta, contenido)
         values ($1, 'acme', 'animacion', 'clara', '{}'::jsonb)`,
        [other],
      ),
    ).rejects.toThrow();
  });

  it("rejects invalid slug format", async () => {
    const empresa = (
      await db.query<{ id: string }>("insert into public.empresas (nombre) values ('Gamma') returning id")
    ).rows[0].id;

    await expect(
      db.query(
        `insert into public.sitios_web (empresa_id, slug, plantilla, paleta, contenido)
         values ($1, 'Bad_Slug', 'animacion', 'clara', '{}'::jsonb)`,
        [empresa],
      ),
    ).rejects.toThrow();
  });
});
