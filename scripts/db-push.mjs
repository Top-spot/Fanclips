import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.SUPABASE_DB_URL?.trim();

const args = ["supabase", "db", "push", "--yes"];
if (dryRun) args.push("--dry-run");
if (dbUrl) args.push("--db-url", dbUrl);
else args.push("--linked");

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (result.status !== 0) {
  console.error(`
db:push failed. Pick one path:

  A) CLI + linked project (no DB password in env)
     npx supabase login
     npx supabase link --project-ref <VITE_SUPABASE_PROJECT_ID from .env>
     npm run db:push

  B) Direct Postgres URL (applies pending migrations only)
     Set SUPABASE_DB_URL to the connection string from Supabase Dashboard
     → Project Settings → Database (URI mode; percent-encode special characters in the password)
     npm run db:push
`);
  process.exit(result.status ?? 1);
}
