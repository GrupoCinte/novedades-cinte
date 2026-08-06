const { randomUUID } = require('crypto');

function metaEnv() {
    return {
        source: 'backend-express',
        env: process.env.NODE_ENV || 'development'
    };
}

/**
 * @param {{
 *   seguimientoId: string,
 *   tipo: 'consultor'|'cliente',
 *   recipients: Array<{ email: string, name?: string }>,
 *   acta: {
 *     fecha: string,
 *     cliente: string,
 *     modalidad?: string,
 *     temasTratados?: string,
 *     feedback?: string,
 *     compromisosResumen?: string
 *   }
 * }} input
 */
function buildSeguimientoCierreEvent(input) {
    return {
        eventType: 'seguimiento_cierre',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        seguimientoId: String(input.seguimientoId),
        tipo: input.tipo,
        recipients: (input.recipients || []).map((r) => ({
            email: String(r.email || '').trim().toLowerCase(),
            name: r.name ? String(r.name) : undefined
        })),
        acta: {
            fecha: String(input.acta?.fecha || ''),
            cliente: String(input.acta?.cliente || ''),
            modalidad: input.acta?.modalidad ? String(input.acta.modalidad) : '',
            temasTratados: input.acta?.temasTratados ? String(input.acta.temasTratados) : '',
            feedback: input.acta?.feedback ? String(input.acta.feedback) : '',
            compromisosResumen: input.acta?.compromisosResumen ? String(input.acta.compromisosResumen) : ''
        },
        meta: metaEnv()
    };
}

/**
 * @param {{
 *   seguimientoId: string,
 *   kind: 'T5'|'T1',
 *   recipients: Array<{ email: string, role?: string, name?: string }>,
 *   venceEl: string,
 *   tipo: 'consultor'|'cliente',
 *   sujetoLabel: string
 * }} input
 */
function buildSeguimientoVencimientoEvent(input) {
    return {
        eventType: 'seguimiento_vencimiento',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        seguimientoId: String(input.seguimientoId),
        kind: input.kind,
        recipients: (input.recipients || []).map((r) => ({
            email: String(r.email || '').trim().toLowerCase(),
            role: r.role ? String(r.role) : undefined,
            name: r.name ? String(r.name) : undefined
        })),
        venceEl: String(input.venceEl || ''),
        tipo: input.tipo,
        sujetoLabel: String(input.sujetoLabel || ''),
        meta: metaEnv()
    };
}

module.exports = {
    buildSeguimientoCierreEvent,
    buildSeguimientoVencimientoEvent
};
