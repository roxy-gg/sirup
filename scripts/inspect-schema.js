/** Prints the live schema so migrations can be verified against real Postgres. */
import pg from "pg";

const client = new pg.Client(
  process.env.DATABASE_URL || "postgres://sirup:sirup@localhost:55432/sirup",
);
await client.connect();

const cols = await client.query(`
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
    row.column_default || "(none)",
  );
}

const fks = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE column_name LIKE '%\\_id' AND table_schema = 'public'
  ORDER BY table_name, column_name
`);

console.log("\n=== FOREIGN KEY COLUMNS ===");
for (const row of fks.rows) {
  console.log(row.table_name.padEnd(14), row.column_name.padEnd(12), row.data_type);
}

const idx = await client.query(`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename <> 'knex_migrations'
    AND tablename <> 'knex_migrations_lock'
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

const jsonb = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE data_type IN ('jsonb', 'json') AND table_schema = 'public'
`);
console.log("\n=== JSON COLUMNS ===");
for (const row of jsonb.rows) {
  console.log(`  ${row.table_name}.${row.column_name} -> ${row.data_type}`);
}

await client.end();
