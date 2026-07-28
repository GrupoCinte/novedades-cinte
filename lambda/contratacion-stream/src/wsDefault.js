'use strict';

/**
 * $default — ACK mínimo; el realtime va stream → postToConnection.
 */
async function handler() {
    return { statusCode: 200, body: 'ok' };
}

module.exports = { handler };
