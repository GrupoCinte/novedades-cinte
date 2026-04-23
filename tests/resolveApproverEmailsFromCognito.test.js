const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createResolveApproverEmailsFromCognito } = require('../src/notifications/resolveApproverEmailsFromCognito');
const { getNovedadRuleByType } = require('../src/rbac');

function attr(name, value) {
    return { Name: name, Value: value };
}

function mockListGroupsCmd() {
    return Promise.resolve({
        Groups: [
            { GroupName: 'admin_ch' },
            { GroupName: 'team_ch' },
            { GroupName: 'cac' },
            { GroupName: 'gp' }
        ]
    });
}

function cmdName(cmd) {
    return cmd?.constructor?.name || '';
}

describe('createResolveApproverEmailsFromCognito', () => {
    it('devuelve vacío si no hay cliente', async () => {
        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient: null,
            userPoolId: 'pool',
            getNovedadRuleByType
        });
        const out = await resolveApproverEmailsForNovedad('Incapacidad');
        assert.deepEqual(out.emails, []);
        assert.equal(out.reason, 'cognito_not_configured');
    });

    it('deduplica emails entre grupos y solo incluye verificados', async () => {
        const calls = [];
        const cognitoClient = {
            send(cmd) {
                calls.push(cmd.input);
                if (cmdName(cmd) === 'ListGroupsCommand') {
                    return mockListGroupsCmd();
                }
                const g = cmd.input.GroupName;
                const nt = cmd.input.NextToken;
                if (g === 'admin_ch' && !nt) {
                    return Promise.resolve({
                        Users: [
                            {
                                Attributes: [
                                    attr('email', 'a@example.com'),
                                    attr('email_verified', 'true')
                                ]
                            },
                            {
                                Attributes: [
                                    attr('email', 'b@example.com'),
                                    attr('email_verified', 'false')
                                ]
                            }
                        ],
                        NextToken: 't1'
                    });
                }
                if (g === 'admin_ch' && nt === 't1') {
                    return Promise.resolve({
                        Users: [
                            {
                                Attributes: [
                                    attr('email', 'a@example.com'),
                                    attr('email_verified', 'true')
                                ]
                            }
                        ]
                    });
                }
                if (g === 'team_ch') {
                    return Promise.resolve({
                        Users: [
                            {
                                Attributes: [
                                    attr('email', 'c@example.com'),
                                    attr('email_verified', 'true')
                                ]
                            },
                            {
                                Attributes: [
                                    attr('email', 'a@example.com'),
                                    attr('email_verified', 'true')
                                ]
                            }
                        ]
                    });
                }
                if (g === 'cac') {
                    return Promise.resolve({ Users: [] });
                }
                return Promise.resolve({ Users: [] });
            }
        };

        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient,
            userPoolId: 'us-east-1_test',
            getNovedadRuleByType,
            logger: { error() {} }
        });

        const out = await resolveApproverEmailsForNovedad('Incapacidad');
        assert.deepEqual(out.emails.sort(), ['a@example.com', 'c@example.com'].sort());
        assert.equal(out.reason, 'ok');
        assert.ok(calls.some((c) => c.GroupName === 'admin_ch' && !c.NextToken));
        assert.ok(calls.some((c) => c.GroupName === 'admin_ch' && c.NextToken === 't1'));
    });

    it('incluye email cuando falta email_verified en ListUsersInGroup (Cognito habitual)', async () => {
        const cognitoClient = {
            send(cmd) {
                if (cmdName(cmd) === 'ListGroupsCommand') {
                    return mockListGroupsCmd();
                }
                if (cmdName(cmd) === 'AdminGetUserCommand') {
                    return Promise.reject(new Error('no AdminGetUser en este test'));
                }
                if (cmd.input.GroupName === 'gp') {
                    return Promise.resolve({
                        Users: [
                            {
                                Username: 'sub-123',
                                Attributes: [attr('email', 'sin-verified-attr@example.com')]
                            }
                        ]
                    });
                }
                return Promise.resolve({ Users: [] });
            }
        };
        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient,
            userPoolId: 'pool',
            getNovedadRuleByType,
            logger: { error() {}, warn() {} }
        });
        const out = await resolveApproverEmailsForNovedad('Hora Extra');
        assert.deepEqual(out.emails, ['sin-verified-attr@example.com']);
        assert.equal(out.reason, 'ok');
    });

    it('usa AdminGetUser cuando ListUsersInGroup no trae email', async () => {
        const cognitoClient = {
            send(cmd) {
                if (cmdName(cmd) === 'ListGroupsCommand') {
                    return mockListGroupsCmd();
                }
                if (cmdName(cmd) === 'AdminGetUserCommand') {
                    return Promise.resolve({
                        UserAttributes: [
                            attr('email', 'from-admin-get@example.com'),
                            attr('email_verified', 'true')
                        ]
                    });
                }
                if (cmd.input.GroupName === 'gp') {
                    return Promise.resolve({
                        Users: [{ Username: 'uuid-user', Attributes: [] }]
                    });
                }
                return Promise.resolve({ Users: [] });
            }
        };
        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient,
            userPoolId: 'pool',
            getNovedadRuleByType,
            logger: { error() {}, warn() {} }
        });
        const out = await resolveApproverEmailsForNovedad('Hora Extra');
        assert.deepEqual(out.emails, ['from-admin-get@example.com']);
    });

    it('usa el nombre exacto del grupo en Cognito si difiere en mayúsculas (p. ej. Team_CH)', async () => {
        const cognitoClient = {
            send(cmd) {
                if (cmdName(cmd) === 'ListGroupsCommand') {
                    return Promise.resolve({
                        Groups: [
                            { GroupName: 'Admin_CH' },
                            { GroupName: 'Team_CH' },
                            { GroupName: 'CAC' }
                        ]
                    });
                }
                const g = cmd.input.GroupName;
                if (g === 'Admin_CH' || g === 'CAC') {
                    return Promise.resolve({ Users: [] });
                }
                if (g === 'Team_CH') {
                    return Promise.resolve({
                        Users: [{ Attributes: [attr('email', 'teamcap@example.com')] }]
                    });
                }
                return Promise.resolve({ Users: [] });
            }
        };
        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient,
            userPoolId: 'pool',
            getNovedadRuleByType,
            logger: { error() {}, warn() {} }
        });
        const out = await resolveApproverEmailsForNovedad('Incapacidad');
        assert.deepEqual(out.emails, ['teamcap@example.com']);
    });

    it('continúa si un grupo falla', async () => {
        const cognitoClient = {
            send(cmd) {
                if (cmdName(cmd) === 'ListGroupsCommand') {
                    return mockListGroupsCmd();
                }
                if (cmd.input.GroupName === 'admin_ch') {
                    return Promise.reject(new Error('ResourceNotFoundException'));
                }
                if (cmd.input.GroupName === 'team_ch') {
                    return Promise.resolve({
                        Users: [
                            {
                                Attributes: [attr('email', 'ok@example.com'), attr('email_verified', 'true')]
                            }
                        ]
                    });
                }
                return Promise.resolve({ Users: [] });
            }
        };
        const errors = [];
        const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
            cognitoClient,
            userPoolId: 'pool',
            getNovedadRuleByType,
            logger: { error(...args) { errors.push(args); } }
        });
        const out = await resolveApproverEmailsForNovedad('Incapacidad');
        assert.equal(out.emails.includes('ok@example.com'), true);
        assert.equal(errors.length >= 1, true);
    });
});
