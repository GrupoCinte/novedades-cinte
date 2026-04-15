const {
    ListUsersInGroupCommand,
    AdminGetUserCommand,
    ListGroupsCommand
} = require('@aws-sdk/client-cognito-identity-provider');

function attrsToMap(attrs) {
    const byName = {};
    for (const a of attrs || []) {
        if (a && a.Name) byName[a.Name] = a.Value;
    }
    return byName;
}

/** Normaliza para emparejar RBAC (`team_ch`) con nombres en Cognito (`Team_CH`, `team-ch`). */
function normalizeGroupKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
}

/** ListUsersInGroup suele no traer `email_verified`; solo excluimos si viene explícitamente en false. */
function isEmailVerifiedForNotify(byName) {
    const raw = byName.email_verified;
    if (raw === undefined || raw === null || String(raw).trim() === '') return true;
    return String(raw).toLowerCase() === 'true';
}

/**
 * @param {import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient} cognitoClient
 * @param {string} userPoolId
 * @param {string} username
 */
async function resolveEmailViaAdminGetUser(cognitoClient, userPoolId, username) {
    const u = String(username || '').trim();
    if (!u) return null;
    const out = await cognitoClient.send(
        new AdminGetUserCommand({
            UserPoolId: userPoolId,
            Username: u
        })
    );
    const byName = attrsToMap(out.UserAttributes);
    const email = String(byName.email || '').trim().toLowerCase();
    if (!email.includes('@')) return null;
    if (!isEmailVerifiedForNotify(byName)) return null;
    return email;
}

/**
 * @param {object} opts
 * @param {import('@aws-sdk/client-cognito-identity-provider').CognitoIdentityProviderClient} opts.cognitoClient
 * @param {string} opts.userPoolId
 * @param {(typeName: string) => object|null} opts.getNovedadRuleByType
 * @param {{ error?: Function, warn?: Function }} [opts.logger]
 */
function createResolveApproverEmailsFromCognito({ cognitoClient, userPoolId, getNovedadRuleByType, logger = console }) {
    const pool = String(userPoolId || '').trim();
    const log = logger && typeof logger.error === 'function' ? logger : console;
    const warn = logger && typeof logger.warn === 'function' ? logger.warn.bind(logger) : console.warn.bind(console);

    /** Mapa clave normalizada → nombre exacto del grupo en Cognito (una vez por proceso). */
    let cachedGroupMapPromise = null;

    async function loadGroupNameMap() {
        if (!cognitoClient || !pool) return new Map();
        if (cachedGroupMapPromise) return cachedGroupMapPromise;
        cachedGroupMapPromise = (async () => {
            const map = new Map();
            try {
                let next;
                do {
                    const out = await cognitoClient.send(
                        new ListGroupsCommand({
                            UserPoolId: pool,
                            Limit: 60,
                            NextToken: next
                        })
                    );
                    for (const g of out.Groups || []) {
                        const raw = String(g.GroupName || '').trim();
                        if (!raw) continue;
                        map.set(normalizeGroupKey(raw), raw);
                    }
                    next = out.NextToken;
                } while (next);
            } catch (err) {
                warn('[approver-emails] ListGroups falló; se usarán nombres RBAC tal cual en ListUsersInGroup', {
                    code: err?.name,
                    message: err?.message || String(err)
                });
            }
            return map;
        })();
        return cachedGroupMapPromise;
    }

    /**
     * @param {string} tipoNovedad
     * @returns {Promise<{ emails: string[], reason: string, insights?: object[] }>}
     */
    async function resolveApproverEmailsForNovedad(tipoNovedad) {
        const emptyInsight = (reason, extra = {}) => ({ emails: [], reason, insights: [], ...extra });

        if (!cognitoClient || !pool) {
            return emptyInsight('cognito_not_configured');
        }
        const rule = getNovedadRuleByType(String(tipoNovedad || ''));
        if (!rule) {
            return emptyInsight('no_rule');
        }
        const approvers = Array.isArray(rule.approvers) ? rule.approvers : [];
        if (approvers.length === 0) {
            return emptyInsight('no_approvers');
        }

        const nameMap = await loadGroupNameMap();
        const seen = new Set();
        const emails = [];
        /** @type {object[]} */
        const insights = [];

        for (const groupName of approvers) {
            const gn = String(groupName || '').trim();
            if (!gn) continue;
            const actualGn = nameMap.get(normalizeGroupKey(gn)) || gn;
            let usersSeen = 0;
            let emailsFromGroup = 0;
            let listError = null;
            let nextToken;
            try {
                do {
                    const out = await cognitoClient.send(
                        new ListUsersInGroupCommand({
                            UserPoolId: pool,
                            GroupName: actualGn,
                            NextToken: nextToken
                        })
                    );
                    const batch = out.Users || [];
                    usersSeen += batch.length;
                    for (const user of batch) {
                        const byName = attrsToMap(user.Attributes);
                        let email = String(byName.email || '').trim().toLowerCase();
                        let verifiedOk = isEmailVerifiedForNotify(byName);

                        if (!email.includes('@') && user.Username && String(user.Username).includes('@')) {
                            email = String(user.Username).trim().toLowerCase();
                            verifiedOk = true;
                        }

                        if (!email.includes('@') && user.Username) {
                            try {
                                const fetched = await resolveEmailViaAdminGetUser(cognitoClient, pool, user.Username);
                                if (fetched) {
                                    email = fetched;
                                    verifiedOk = true;
                                }
                            } catch (e) {
                                warn('[approver-emails] AdminGetUser falló', {
                                    rbacGroup: gn,
                                    cognitoGroup: actualGn,
                                    username: user.Username,
                                    message: e?.message || String(e)
                                });
                            }
                        }

                        if (!email.includes('@')) continue;
                        if (!verifiedOk) continue;
                        if (seen.has(email)) continue;
                        seen.add(email);
                        emails.push(email);
                        emailsFromGroup += 1;
                    }
                    nextToken = out.NextToken;
                } while (nextToken);
            } catch (err) {
                listError = err?.message || String(err);
                log.error('[approver-emails] ListUsersInGroup failed', {
                    rbacGroup: gn,
                    cognitoGroup: actualGn,
                    code: err?.name,
                    message: listError
                });
            }
            insights.push({
                rbacGroup: gn,
                cognitoGroup: actualGn,
                groupResolved: actualGn !== gn,
                usersSeen,
                emailsFromGroup,
                listError
            });
        }

        return {
            emails,
            reason: emails.length > 0 ? 'ok' : 'no_emails_found',
            insights
        };
    }

    return { resolveApproverEmailsForNovedad };
}

module.exports = {
    createResolveApproverEmailsFromCognito
};
