// Standalone, opt-in, READ ONLY. Never invoked by server boot or migrations.
// Uses the invoking environment's DATABASE_URL; deliberately does not load .env.
const { PrismaClient, Prisma } = require("@prisma/client");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const modelNames = ["Group", "Room", "GroupMember", "HouseInvite", "HouseActivity"];
const migrationNames = ["20260925115111_initial_postgres", "20260925115748_auth_color", "20260925120312_member_last_seen", "20260928110000_invite_code"];

async function inspect() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  const schema = url.searchParams.get("schema") || "public";
  const models = modelNames.map((name) => {
    const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
    if (!model) throw new Error("Generated client model missing");
    return { name, table: model.dbName || name, columns: model.fields.filter((field) => field.kind !== "object").map((field) => field.dbName || field.name) };
  });
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
      const [mode] = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS read_only`;
      if (mode.read_only !== "on") throw new Error("Read-only transaction required");
      const columns = await tx.$queryRaw`
        SELECT c.relname AS table_name, a.attname AS column_name
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = ${schema} AND c.relname IN (${Prisma.join(models.map((model) => model.table))})
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped`;
      const tables = await tx.$queryRaw`
        SELECT c.relname AS table_name FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema} AND c.relname IN (${Prisma.join([...models.map((model) => model.table), "_prisma_migrations"])})
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;
      const duplicates = await tx.$queryRaw`
        SELECT c.relname AS table_name, count(*)::int AS copies
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname IN (${Prisma.join(models.map((model) => model.table))})
          AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f') GROUP BY c.relname`;
      const present = new Set(tables.map((entry) => entry.table_name));
      const missingTables = models.filter((model) => !present.has(model.table)).map((model) => model.name);
      const missingColumns = models.filter((model) => present.has(model.table)).flatMap((model) => model.columns.filter((column) => !columns.some((entry) => entry.table_name === model.table && entry.column_name === column)).map((column) => `${model.name}.${column}`));
      let history = [];
      if (present.has("_prisma_migrations")) {
        const table = Prisma.raw(`"${schema.replace(/"/g, '""')}"."_prisma_migrations"`);
        history = await tx.$queryRaw(Prisma.sql`SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM ${table} WHERE migration_name IN (${Prisma.join(migrationNames)}) ORDER BY started_at`);
      }
      return {
        readOnly: true,
        targetSchema: schema === "public" ? "public" : "CUSTOM_SCHEMA",
        // Compare privately between environments. No host, credentials or URL output.
        targetFingerprint: crypto.createHash("sha256").update(JSON.stringify([url.hostname, url.port || "5432", decodeURIComponent(url.pathname), schema])).digest("hex").slice(0, 24),
        generatedClientExpectsCodeHash: models.find((model) => model.name === "HouseInvite").columns.includes("codeHash"),
        generatedExpectedColumns: models.map((model) => ({ model: model.name, columns: model.columns })),
        missingTables, missingColumns,
        tablesWithMultipleSchemaCopies: duplicates.filter((entry) => entry.copies > 1).map((entry) => entry.table_name),
        migrationHistoryPresent: present.has("_prisma_migrations"),
        migrations: migrationNames.map((name) => {
          const file = path.resolve(__dirname, "../prisma/migrations", name, "migration.sql");
          const local = fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
          // Prisma accepts checksums across LF/CRLF differences.
          const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
          const acceptable = text === null ? [] : [local, crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex"), crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")).digest("hex")];
          return { name, localFilePresent: local !== null, records: history.filter((row) => row.migration_name === name).map((row) => ({ finished: row.finished_at !== null, rolledBack: row.rolled_back_at !== null, appliedSteps: row.applied_steps_count, checksumMatchesLocal: acceptable.includes(row.checksum) })) };
        }),
      };
    }, { timeout: 15000 });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.missingTables.length || result.missingColumns.length) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
inspect().catch((error) => {
  // No raw exception: Prisma messages/meta may contain connection information.
  const code = /^P\d{4}$/.test(error?.code || error?.errorCode || "") ? error.code || error.errorCode : "UNKNOWN";
  process.stderr.write(JSON.stringify({ event: "house_schema_inspection_failed", errorCode: code, safeMessage: "Read-only inspection could not complete; no schema or data changes performed." }) + "\n");
  process.exitCode = 1;
});
