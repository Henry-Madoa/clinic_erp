/*
 * Seed an empty database from the command line instead of on the first request:
 *
 *   node --env-file=.env --conditions=react-server --experimental-transform-types scripts/seed.ts
 *
 * The seed is one long transaction, so it goes to the direct endpoint rather than a pooler that
 * may recycle the connection under it.
 */
export {};
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace('-pooler.', '.');
const { seedIfEmpty } = await import('../lib/seed.ts');
const started = Date.now();
const result = await seedIfEmpty();
console.log(JSON.stringify(result), `${Math.round((Date.now() - started) / 1000)}s`);
process.exit(0);
