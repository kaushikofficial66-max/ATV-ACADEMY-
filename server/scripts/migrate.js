/**
 * Database setup / migrations.
 *
 *   npm run db:migrate          -> applies database/migrations/*.sql (idempotent)
 *   npm run db:setup -- --fresh -> DROPS and recreates every table from database/schema.sql,
 *                                  then applies migrations. Destroys all data.
 *
 * Uses DB_* variables from .env. The schema file's `CREATE DATABASE lms_db` / `USE lms_db`
 * lines are rewritten to DB_NAME so a differently named database can be used.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'database');
const { DB_HOST = 'localhost', DB_PORT = 3306, DB_USER, DB_PASSWORD, DB_NAME = 'lms_db' } = process.env;

const fresh = process.argv.includes('--fresh');

const run = async () => {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error('DB_NAME may only contain letters, numbers and underscores.');
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  try {
    if (fresh) {
      console.log(`[db] --fresh: recreating all tables in "${DB_NAME}" (existing data will be lost)`);
      const schema = fs
        .readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8')
        .replace(/CREATE DATABASE IF NOT EXISTS lms_db/i, `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
        .replace(/USE lms_db;/i, `USE \`${DB_NAME}\`;`);
      // Drop every table (base schema + tables added by migrations) so nothing stale survives.
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await connection.query(`USE \`${DB_NAME}\``);
      const [tables] = await connection.query(
        "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
        [DB_NAME]
      );
      if (tables.length) {
        const list = tables.map((t) => `\`${t.name}\``).join(', ');
        await connection.query(`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS ${list}; SET FOREIGN_KEY_CHECKS = 1;`);
      }
      await connection.query(schema);
      console.log('[db] base schema created (45 tables + roles)');
    }

    await connection.query(`USE \`${DB_NAME}\``);
    const migrationsDir = path.join(DB_DIR, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      await connection.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      console.log(`[db] applied ${file}`);
    }
    console.log('[db] done');
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('[db] failed:', error.sqlMessage || error.message || error.code || error, error.sql ? `\n[db] statement: ${String(error.sql).slice(0, 300)}` : '');
  process.exit(1);
});
