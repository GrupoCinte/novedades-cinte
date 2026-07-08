'use strict';

/**
 * Resuelve users.id del actor de sesión (JWT/Cognito o login local).
 * Evita violar FK novedades_aprobado_por_user_id_fkey cuando sub no es users.id.
 *
 * @param {import('pg').Pool} pool
 * @param {{ sub?: string, email?: string }} session
 * @returns {Promise<string|null>}
 */
async function resolveActorUserIdForSession(pool, session = {}) {
    const sub = String(session.sub || '').trim();
    const email = String(session.email || '').trim();
    const subAsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sub)
        ? sub
        : null;

    if (!subAsUuid && !email && !sub) return null;

    try {
        const uq = await pool.query(
            `SELECT id::text AS id FROM users
              WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
                 OR ($2 <> '' AND lower(btrim(email)) = lower(btrim($2)))
                 OR ($3 <> '' AND cognito_sub = $3)
              LIMIT 1`,
            [subAsUuid, email, sub]
        );
        return uq.rows[0]?.id ? String(uq.rows[0].id) : null;
    } catch (error) {
        if (String(error?.code || '') === '42703') {
            try {
                const uq2 = await pool.query(
                    `SELECT id::text AS id FROM users
                      WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
                         OR ($2 <> '' AND lower(btrim(email)) = lower(btrim($2)))
                      LIMIT 1`,
                    [subAsUuid, email]
                );
                return uq2.rows[0]?.id ? String(uq2.rows[0].id) : null;
            } catch {
                return null;
            }
        }
        return null;
    }
}

module.exports = { resolveActorUserIdForSession };
