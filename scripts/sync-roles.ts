/*
 * Brings every seeded role's permission set up to the current role definitions in lib/seed.ts —
 * granting what new modules added, never taking anything away:
 *
 *   node --env-file=.env --conditions=react-server --experimental-transform-types scripts/sync-roles.ts
 *
 * Needed once on a database seeded before a module existed; a fresh seed already has it all.
 */
export {};
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace('-pooler.', '.');
const { one, run, tx } = await import('../lib/db.ts');
const { ROLES } = await import('../lib/seed.ts');
const { expandActionsToLines } = await import('../lib/permissions.ts');

const result = await tx(async () => {
  let roles = 0;
  let lines = 0;
  for (const r of ROLES) {
    let role = await one<{ id: number }>('SELECT id FROM role WHERE name = ?', r.name);
    if (!role) { role = { id: (await run('INSERT INTO role (name, description, is_system) VALUES (?,?,0)', r.name, r.description)).lastInsertRowid }; roles++; }
    const exp = expandActionsToLines(role.id, r.actions);
    const params: unknown[] = [];
    for (const l of exp) params.push(l.role_id, l.object_type, l.object_name, l.read ? 1 : 0, l.insert ? 1 : 0, l.modify ? 1 : 0, l.delete ? 1 : 0, l.execute ? 1 : 0);
    if (!exp.length) continue;
    await run(
      `INSERT INTO permission_set_line (role_id, object_type, object_name, read_perm, insert_perm, modify_perm, delete_perm, execute_perm)
       VALUES ${exp.map(() => '(?,?,?,?,?,?,?,?)').join(',')}
       ON CONFLICT (role_id, object_type, object_name) DO UPDATE SET
         read_perm = GREATEST(permission_set_line.read_perm, EXCLUDED.read_perm), insert_perm = GREATEST(permission_set_line.insert_perm, EXCLUDED.insert_perm),
         modify_perm = GREATEST(permission_set_line.modify_perm, EXCLUDED.modify_perm), delete_perm = GREATEST(permission_set_line.delete_perm, EXCLUDED.delete_perm),
         execute_perm = GREATEST(permission_set_line.execute_perm, EXCLUDED.execute_perm)`, ...params);
    lines += exp.length;
  }
  return { rolesAdded: roles, linesSynced: lines };
}, { timeout: 300_000 });
console.log(JSON.stringify(result));
process.exit(0);
