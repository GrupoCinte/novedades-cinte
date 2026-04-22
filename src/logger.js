const pino = require('pino');

const level = String(process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();

const logger = pino({
    level,
    base: { service: 'novedades-cinte-backend' },
    timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = { logger };
