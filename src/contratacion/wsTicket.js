const jwt = require('jsonwebtoken');

const CLAIM_TYP = 'contratacion_ws';

function signContratacionWsTicket(deps, userClaims) {
    const { wsSecret, ttlSec = 300 } = deps;
    const sub = String(userClaims?.sub || userClaims?.id || '');
    if (!sub) return null;
    return jwt.sign(
        {
            typ: CLAIM_TYP,
            sub
        },
        wsSecret,
        { expiresIn: Number(ttlSec) || 300 }
    );
}

function verifyContratacionWsTicket(wsSecret, token) {
    const payload = jwt.verify(token, wsSecret);
    if (payload.typ !== CLAIM_TYP || !payload.sub) {
        const err = new Error('Ticket inválido');
        err.name = 'JsonWebTokenError';
        throw err;
    }
    return payload;
}

module.exports = {
    signContratacionWsTicket,
    verifyContratacionWsTicket
};
