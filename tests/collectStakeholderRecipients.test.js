'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    collectStakeholderRecipients,
    STAKEHOLDER_COGNITO_GROUPS
} = require('../src/conciliaciones/conciliacionServicioNotify');

function attr(name, value) {
    return { Name: name, Value: value };
}

function cmdName(cmd) {
    return cmd?.constructor?.name || '';
}

test('STAKEHOLDER_COGNITO_GROUPS incluye gp, cac y super_admin', () => {
    assert.deepEqual(STAKEHOLDER_COGNITO_GROUPS, ['gp', 'cac', 'super_admin']);
});

test('collectStakeholderRecipients usa Cognito y no consulta users BD', async () => {
    const pool = {
        query: async () => {
            throw new Error('no debe consultar users');
        }
    };
    const cognitoClient = {
        send(cmd) {
            if (cmdName(cmd) === 'ListGroupsCommand') {
                return Promise.resolve({
                    Groups: [
                        { GroupName: 'gp' },
                        { GroupName: 'cac' },
                        { GroupName: 'super_admin' }
                    ]
                });
            }
            const g = cmd.input.GroupName;
            if (g === 'gp') {
                return Promise.resolve({
                    Users: [
                        {
                            Attributes: [
                                attr('email', 'gp@example.com'),
                                attr('name', 'GP User'),
                                attr('email_verified', 'true')
                            ]
                        }
                    ]
                });
            }
            if (g === 'cac') {
                return Promise.resolve({
                    Users: [
                        {
                            Attributes: [
                                attr('email', 'cac@example.com'),
                                attr('email_verified', 'true')
                            ]
                        }
                    ]
                });
            }
            if (g === 'super_admin') {
                return Promise.resolve({
                    Users: [
                        {
                            Attributes: [
                                attr('email', 'admin@example.com'),
                                attr('email_verified', 'true')
                            ]
                        },
                        {
                            Attributes: [
                                attr('email', 'gp@example.com'),
                                attr('email_verified', 'true')
                            ]
                        }
                    ]
                });
            }
            return Promise.resolve({ Users: [] });
        }
    };

    const recipients = await collectStakeholderRecipients({
        pool,
        cognitoClient,
        cognitoUserPoolId: 'us-east-1_test'
    });
    const emails = recipients.map((r) => r.email).sort();
    assert.deepEqual(emails, ['admin@example.com', 'cac@example.com', 'gp@example.com']);
});

test('collectStakeholderRecipients respeta inyección listStakeholderEmailsFromCognito', async () => {
    const recipients = await collectStakeholderRecipients({
        listStakeholderEmailsFromCognito: async () => ({
            recipients: [{ email: 'x@y.com', name: 'X' }]
        })
    });
    assert.deepEqual(recipients, [{ email: 'x@y.com', name: 'X' }]);
});
