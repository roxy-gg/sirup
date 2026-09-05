/** Prints the live schema so migrations can be verified against real Postgres. */
import pg from "pg";

const client = new pg.Client(
  process.env.DATABASE_URL ?? "postgres://sirup:sirup@localhost:55432/sirup",
);
await client.connect();

const cols = await client.query<{
  table_name: string;
  data_type: string;
  column_default: string | null;
}>(`
  SELECT table_name, data_type, column_default
  FROM information_schema.columns
  WHERE column_name = 'id' AND table_schema = 'public'
  ORDER BY table_name
`);

console.log("=== PRIMARY KEYS ===");
for (const row of cols.rows) {
  console.log(
    row.table_name.padEnd(14),
    row.data_type.padEnd(10),
    row.column_default ?? "(none)",
  );
}

const idx = await client.query<{ tablename: string; indexname: string; indexdef: string }>(`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename NOT LIKE 'knex_%'
  ORDER BY tablename, indexname
`);

console.log("\n=== INDEXES ===");
let current = "";
for (const row of idx.rows) {
  if (row.tablename !== current) {
    current = row.tablename;
    console.log(`\n  ${current}`);
  }
  const def = row.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING \w+ /, "");
  console.log(
    `    ${row.indexdef.includes("UNIQUE") ? "U" : " "} ${row.indexname.padEnd(42)} ${def}`,
  );
}

await client.end();
