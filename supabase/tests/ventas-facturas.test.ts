import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");
const NEW_MIGRATION = "20261028120000_ventas_facturas.sql";

let db: PGlite;

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }))
    .filter((f) => !f.sql.includes("storage."));
}

// Earlier migrations are not replayable on an empty database: 20260923083000 and 20260924000000 both
// create the same policy. Make every "create policy" idempotent here instead of editing them.
function withIdempotentPolicies(sql: string) {
  return sql.replace(
    /create policy ("[^"]+")\s+on\s+(\S+)/gi,
    (match, name: string, table: string) => `drop policy if exists ${name} on ${table};
${match}`,
  );
}

// 20260923083000 creates a legacy oportunidades table that 20260924000000 ("create table if not exists")
// then skips, so later migrations miss persona_id. The normalized table is what the real project has: drop
// the legacy one before 20260924000000.
const STUBS_BEFORE: Record<string, string> = {
  "20260924000000_normalize_crm_tables.sql": "drop table public.oportunidades cascade;",
};

async function runMigrations(filter: (name: string) => boolean) {
  for (const file of migrationFiles().filter((f) => filter(f.name))) {
    if (STUBS_BEFORE[file.name]) await db.exec(STUBS_BEFORE[file.name]);
    await db.exec(withIdempotentPolicies(file.sql));
  }
}

async function freshDb() {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create publication supabase_realtime;");
}

async function insertSale(estado = "won"): Promise<{ empresa: string; opp: string }> {
  const empresa = (
    await db.query<{ id: string }>("insert into public.empresas (nombre) values ('Acme') returning id")
  ).rows[0].id;
  const opp = (
    await db.query<{ id: string }>(
      `insert into public.oportunidades (nombre, correo, empresa_id, proyecto, detalles, estado, precio)
       values ('Ana', 'ana@acme.test', $1, 'website', 'x', $2, 1000) returning id`,
      [empresa, estado],
    )
  ).rows[0].id;
  return { empresa, opp };
}

async function insertDraft(opp: string, empresa: string, fechaEmision = "2026-10-28") {
  return (
    await db.query<{ id: string }>(
      `insert into public.facturas (oportunidad_id, empresa_id, fecha_emision, fecha_vencimiento, base)
       values ($1, $2, $3::date, $3::date + 30, 1000) returning id`,
      [opp, empresa, fechaEmision],
    )
  ).rows[0].id;
}

async function issue(id: string) {
  await db.query("update public.facturas set estado = 'pendiente' where id = $1", [id]);
}

async function facturaRow(id: string) {
  return (await db.query<Record<string, unknown>>("select * from public.facturas where id = $1", [id])).rows[0];
}

async function ganadaEn(opp: string) {
  return (
    await db.query<{ ganada_en: string | null }>("select ganada_en from public.oportunidades where id = $1", [opp])
  ).rows[0].ganada_en;
}

describe("ventas y facturas migration", () => {
  beforeEach(async () => {
    await freshDb();
    await runMigrations(() => true);
  });

  it("ganada_en is set on win and cleared on leaving won", async () => {
    const { opp } = await insertSale("new");
    expect(await ganadaEn(opp)).toBeNull();
    await db.query("update public.oportunidades set estado = 'won' where id = $1", [opp]);
    expect(await ganadaEn(opp)).not.toBeNull();
    await db.query("update public.oportunidades set estado = 'lost' where id = $1", [opp]);
    expect(await ganadaEn(opp)).toBeNull();
  });

  it("migration can be re-run", async () => {
    await expect(runMigrations((name) => name === NEW_MIGRATION)).resolves.toBeUndefined();
  });

  it("inserts must be drafts", async () => {
    const { opp, empresa } = await insertSale();
    await expect(
      db.query(
        "insert into public.facturas (oportunidad_id, empresa_id, base, estado) values ($1, $2, 10, 'pendiente')",
        [opp, empresa],
      ),
    ).rejects.toThrow(/^factura_insert_no_borrador:/);
  });

  it("fecha_vencimiento before fecha_emision fails", async () => {
    const { opp, empresa } = await insertSale();
    await expect(
      db.query(
        `insert into public.facturas (oportunidad_id, empresa_id, fecha_emision, fecha_vencimiento, base)
         values ($1, $2, '2026-10-28', '2026-10-01', 10)`,
        [opp, empresa],
      ),
    ).rejects.toThrow(/check/i);
  });

  it("numbers are correlative per year", async () => {
    const a = await insertSale();
    const b = await insertSale();
    const c = await insertSale();
    const d1 = await insertDraft(a.opp, a.empresa);
    expect((await facturaRow(d1)).numero).toBeNull();
    const d2 = await insertDraft(b.opp, b.empresa);
    const d3 = await insertDraft(c.opp, c.empresa, "2027-01-02");
    await issue(d1);
    await issue(d2);
    await issue(d3);
    expect((await facturaRow(d1)).numero).toBe("F-2026-0001");
    expect((await facturaRow(d2)).numero).toBe("F-2026-0002");
    expect((await facturaRow(d3)).numero).toBe("F-2027-0001");
  });

  it("second live invoice for the same sale fails", async () => {
    const { opp, empresa } = await insertSale();
    await insertDraft(opp, empresa);
    await expect(insertDraft(opp, empresa)).rejects.toThrow(/unique|duplicate/i);
  });

  it("anulada frees the sale", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    await db.query("update public.facturas set estado = 'anulada' where id = $1", [id]);
    const row = await facturaRow(id);
    expect(row.numero).toBe("F-2026-0001");
    expect(row.anulada_en).not.toBeNull();
    await expect(insertDraft(opp, empresa)).resolves.toBeTruthy();
  });

  it("pagada sets pagada_en", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    await db.query("update public.facturas set estado = 'pagada' where id = $1", [id]);
    expect((await facturaRow(id)).pagada_en).not.toBeNull();
  });

  it("issued invoice blocks leaving won", async () => {
    const { opp, empresa } = await insertSale();
    await issue(await insertDraft(opp, empresa));
    await expect(
      db.query("update public.oportunidades set estado = 'lost' where id = $1", [opp]),
    ).rejects.toThrow(/^factura_emitida:F-/);
  });

  it("draft is deleted when leaving won", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await db.query("update public.oportunidades set estado = 'lost' where id = $1", [opp]);
    expect(await facturaRow(id)).toBeUndefined();
  });

  it("delete opportunity: drafts go, issued blocks", async () => {
    const draftOnly = await insertSale();
    const draftId = await insertDraft(draftOnly.opp, draftOnly.empresa);
    await db.query("delete from public.oportunidades where id = $1", [draftOnly.opp]);
    expect(await facturaRow(draftId)).toBeUndefined();

    const issued = await insertSale();
    await issue(await insertDraft(issued.opp, issued.empresa));
    await expect(
      db.query("delete from public.oportunidades where id = $1", [issued.opp]),
    ).rejects.toThrow(/^factura_emitida:/);

    const cancelled = await insertSale();
    const id = await insertDraft(cancelled.opp, cancelled.empresa);
    await issue(id);
    await db.query("update public.facturas set estado = 'anulada' where id = $1", [id]);
    await expect(
      db.query("delete from public.oportunidades where id = $1", [cancelled.opp]),
    ).rejects.toThrow(/^factura_emitida:/);
  });

  it("issued invoices are immutable", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    const inmutable = /^factura_inmutable:/;
    await expect(db.query("update public.facturas set base = 5 where id = $1", [id])).rejects.toThrow(inmutable);
    await expect(
      db.query("update public.facturas set fecha_vencimiento = fecha_vencimiento + 1 where id = $1", [id]),
    ).rejects.toThrow(inmutable);
    await expect(
      db.query("update public.facturas set pagada_en = current_date where id = $1", [id]),
    ).rejects.toThrow(inmutable);
    await db.query("update public.facturas set estado = 'pagada' where id = $1", [id]);
    await expect(db.query("update public.facturas set estado = 'pendiente' where id = $1", [id])).rejects.toThrow(
      /^factura_transicion_invalida:/,
    );
    await expect(
      db.query("update public.facturas set pagada_en = '2020-01-01' where id = $1", [id]),
    ).rejects.toThrow(inmutable);
  });

  it("anulada invoices are immutable", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    await db.query("update public.facturas set estado = 'anulada' where id = $1", [id]);
    await expect(db.query("update public.facturas set base = 5 where id = $1", [id])).rejects.toThrow(
      /^factura_inmutable:/,
    );
    await expect(
      db.query("update public.facturas set anulada_en = '2020-01-01' where id = $1", [id]),
    ).rejects.toThrow(/^factura_inmutable:/);
    await expect(db.query("update public.facturas set estado = 'pendiente' where id = $1", [id])).rejects.toThrow(
      /^factura_transicion_invalida:/,
    );
  });

  it("a transition ignores client-supplied values for the other date column", async () => {
    const a = await insertSale();
    const paid = await insertDraft(a.opp, a.empresa);
    await issue(paid);
    await db.query("update public.facturas set estado = 'pagada', anulada_en = '2020-01-01' where id = $1", [paid]);
    expect((await facturaRow(paid)).anulada_en).toBeNull();

    const b = await insertSale();
    const cancelled = await insertDraft(b.opp, b.empresa);
    await issue(cancelled);
    await db.query("update public.facturas set estado = 'anulada', pagada_en = '2020-01-01' where id = $1", [
      cancelled,
    ]);
    expect((await facturaRow(cancelled)).pagada_en).toBeNull();
  });

  it("a transition cannot change other columns", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    await expect(
      db.query("update public.facturas set estado = 'pagada', base = 1 where id = $1", [id]),
    ).rejects.toThrow(/^factura_inmutable:/);
  });

  it("deleting an empresa keeps its issued invoice with empresa_id null", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await issue(id);
    await db.query("delete from public.empresas where id = $1", [empresa]);
    const row = await facturaRow(id);
    expect(row.numero).toBe("F-2026-0001");
    expect(row.empresa_id).toBeNull();
  });

  it("an opportunity inserted as won gets ganada_en", async () => {
    const { opp } = await insertSale("won");
    expect(await ganadaEn(opp)).not.toBeNull();
  });

  it("counters above 9999 are not truncated", async () => {
    const first = await insertSale();
    const firstId = await insertDraft(first.opp, first.empresa);
    await issue(firstId);
    // The trigger forbids editing issued invoices, so bypass it only to seed the counter.
    await db.exec("alter table public.facturas disable trigger facturas_before_write");
    await db.query("update public.facturas set numero = 'F-2026-9999' where id = $1", [firstId]);
    await db.exec("alter table public.facturas enable trigger facturas_before_write");
    const second = await insertSale();
    const secondId = await insertDraft(second.opp, second.empresa);
    await issue(secondId);
    expect((await facturaRow(secondId)).numero).toBe("F-2026-10000");
  });

  it("borrador -> pagada is rejected", async () => {
    const { opp, empresa } = await insertSale();
    const id = await insertDraft(opp, empresa);
    await expect(db.query("update public.facturas set estado = 'pagada' where id = $1", [id])).rejects.toThrow(
      /^factura_transicion_invalida:/,
    );
  });
});

describe("ganada_en backfill", () => {
  it("backfill uses creado_en", async () => {
    await freshDb();
    await runMigrations((name) => name < NEW_MIGRATION);
    const won = await insertSale("won");
    const legacy = await insertSale("ganada");
    const open = await insertSale("new");
    await db.query("update public.oportunidades set creado_en = '2026-03-04T10:00:00Z'");
    await runMigrations((name) => name === NEW_MIGRATION);
    for (const { opp } of [won, legacy]) {
      expect(new Date((await ganadaEn(opp)) as string).toISOString()).toBe("2026-03-04T10:00:00.000Z");
    }
    expect(await ganadaEn(open.opp)).toBeNull();
  });
});

describe("photo invoices migration", () => {
  const PHOTO_MIGRATION = "20261029120000_facturas_foto.sql";

  async function insertPhoto(
    empresa: string | null,
    numero: string | null,
    estado = "pendiente",
  ) {
    return (
      await db.query<{ id: string }>(
        `insert into public.facturas
           (origen, oportunidad_id, empresa_id, numero, estado, fecha_emision, fecha_vencimiento, base, iva_pct, foto_path)
         values ('foto', null, $1, $2, $3, '2026-09-01', '2026-09-30', 100, 10, 'a/b.jpg') returning id`,
        [empresa, numero, estado],
      )
    ).rows[0].id;
  }

  beforeEach(async () => {
    await freshDb();
    await runMigrations(() => true);
  });

  it("migration can be re-run", async () => {
    await expect(runMigrations((name) => name === PHOTO_MIGRATION)).resolves.toBeUndefined();
  });

  it("photo insert as pendiente keeps its number", async () => {
    const { empresa } = await insertSale();
    const row = await facturaRow(await insertPhoto(empresa, "2026/045"));
    expect(row.numero).toBe("2026/045");
    expect(row.estado).toBe("pendiente");
    expect(row.origen).toBe("foto");
    expect(row.pagada_en).toBeNull();
  });

  it("photo insert as pagada sets pagada_en", async () => {
    const { empresa } = await insertSale();
    const row = await facturaRow(await insertPhoto(empresa, "2026/046", "pagada"));
    expect(row.estado).toBe("pagada");
    expect(row.pagada_en).not.toBeNull();
  });

  it("photo insert requires numero and empresa", async () => {
    const { empresa } = await insertSale();
    await expect(insertPhoto(empresa, null)).rejects.toThrow(/^factura_foto_incompleta:/);
    await expect(insertPhoto(empresa, "  ")).rejects.toThrow(/^factura_foto_incompleta:/);
    await expect(insertPhoto(null, "2026/047")).rejects.toThrow(/^factura_foto_incompleta:/);
  });

  it("duplicate photo number raises factura_numero_duplicado", async () => {
    const { empresa, opp } = await insertSale();
    await insertPhoto(empresa, "2026/048");
    await expect(insertPhoto(empresa, "2026/048")).rejects.toThrow(/^factura_numero_duplicado:2026\/048/);
    const draft = await insertDraft(opp, empresa, "2026-10-28");
    await issue(draft);
    await expect(insertPhoto(empresa, "F-2026-0001")).rejects.toThrow(/^factura_numero_duplicado:F-2026-0001/);
  });

  it("photo invoice is immutable and can be paid or cancelled", async () => {
    const { empresa } = await insertSale();
    const id = await insertPhoto(empresa, "2026/049");
    await expect(db.query("update public.facturas set base = 5 where id = $1", [id])).rejects.toThrow(
      /^factura_inmutable:/,
    );
    await db.query("update public.facturas set estado = 'pagada' where id = $1", [id]);
    expect((await facturaRow(id)).pagada_en).not.toBeNull();
    const id2 = await insertPhoto(empresa, "2026/050");
    await db.query("update public.facturas set estado = 'anulada' where id = $1", [id2]);
    expect((await facturaRow(id2)).anulada_en).not.toBeNull();
  });

  it("venta invoice still requires draft insert", async () => {
    const { opp, empresa } = await insertSale();
    await expect(
      db.query(
        "insert into public.facturas (oportunidad_id, empresa_id, base, estado) values ($1, $2, 10, 'pendiente')",
        [opp, empresa],
      ),
    ).rejects.toThrow(/^factura_insert_no_borrador:/);
  });

  it("counter ignores non-numeric F numbers", async () => {
    const { empresa, opp } = await insertSale();
    await insertPhoto(empresa, "F-2026-ABC");
    const draft = await insertDraft(opp, empresa, "2026-10-28");
    await issue(draft);
    expect((await facturaRow(draft)).numero).toBe("F-2026-0001");
  });

  it("counter ignores photo numbers too long to be a correlative", async () => {
    const { empresa, opp } = await insertSale();
    await insertPhoto(empresa, "F-2026-99999999999");
    const draft = await insertDraft(opp, empresa, "2026-10-28");
    await issue(draft);
    expect((await facturaRow(draft)).numero).toBe("F-2026-0001");
  });

  it("venta invoice requires a sale", async () => {
    const { empresa } = await insertSale();
    await expect(
      db.query("insert into public.facturas (oportunidad_id, empresa_id, base) values (null, $1, 10)", [empresa]),
    ).rejects.toThrow(/^factura_insert_no_borrador:/);
    await expect(db.query("insert into public.facturas (base) values (10)")).rejects.toThrow(
      /^factura_insert_no_borrador:/,
    );
  });

  it("iva_pct 7 is rejected", async () => {
    const { opp, empresa } = await insertSale();
    await expect(
      db.query("insert into public.facturas (oportunidad_id, empresa_id, base, iva_pct) values ($1, $2, 10, 7)", [
        opp,
        empresa,
      ]),
    ).rejects.toThrow(/facturas_iva_pct_check/);
  });

  it("photo invoice cannot lose its client", async () => {
    const { empresa } = await insertSale();
    const id = await insertPhoto(empresa, "2026/054");
    await expect(db.query("update public.facturas set empresa_id = null where id = $1", [id])).rejects.toThrow(
      /facturas_venta_o_cliente_check/,
    );
  });

  it("photo invoices never block a sale", async () => {
    const { opp, empresa } = await insertSale();
    await insertPhoto(empresa, "2026/051");
    await db.query("update public.oportunidades set estado = 'lost' where id = $1", [opp]);
    await db.query("delete from public.oportunidades where id = $1", [opp]);
  });

  it("photo invoice cannot be linked to a sale", async () => {
    const { empresa, opp } = await insertSale();
    await expect(
      db.query(
        `insert into public.facturas (origen, oportunidad_id, empresa_id, numero, estado, base)
         values ('foto', $1, $2, '2026/052', 'pendiente', 10)`,
        [opp, empresa],
      ),
    ).rejects.toThrow(/^factura_foto_incompleta:/);
  });

  it("draft cannot change origen or oportunidad_id", async () => {
    const { empresa, opp } = await insertSale();
    const other = await insertSale();
    const draft = await insertDraft(opp, empresa);
    await expect(
      db.query("update public.facturas set origen = 'foto' where id = $1", [draft]),
    ).rejects.toThrow(/^factura_inmutable:/);
    await expect(
      db.query("update public.facturas set oportunidad_id = $2 where id = $1", [draft, other.opp]),
    ).rejects.toThrow(/^factura_inmutable:/);
  });

  it("deleting an empresa with photo invoices is blocked", async () => {
    const { empresa } = await insertSale();
    await insertPhoto(empresa, "2026/053");
    await expect(db.query("delete from public.empresas where id = $1", [empresa])).rejects.toThrow(
      /^empresa_con_facturas:Acme/,
    );
  });

  it("deleting an empresa with only venta invoices still works", async () => {
    const { empresa, opp } = await insertSale();
    const draft = await insertDraft(opp, empresa);
    await db.query("delete from public.empresas where id = $1", [empresa]);
    expect((await facturaRow(draft)).empresa_id).toBeNull();
  });
});
