/**
 * Normalización de valores provenientes de n8n / Agente Extractor Ficha.
 */

const SENTINEL_VALUES = new Set([
    'cargando',
    'pendiente',
    'pendiente_valor',
    'pendientevalor',
    'no_requerido',
    'no requerido',
    'norequerido',
    'n/a',
    'na',
    'null',
    'undefined',
    'nada',
    'sin dato',
    'sindato',
    ''
]);

const MESES_ES = {
    ene: 1, enero: 1,
    feb: 2, febrero: 2,
    mar: 3, marzo: 3,
    abr: 4, abril: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6,
    jul: 7, julio: 7,
    ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
    oct: 10, octubre: 10,
    nov: 11, noviembre: 11,
    dic: 12, diciembre: 12
};

function stripAccentsLower(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function isSentinel(value) {
    if (value == null) return true;
    const s = String(value).trim();
    if (!s) return true;
    return SENTINEL_VALUES.has(stripAccentsLower(s));
}

function parseDateOrNull(value) {
    if (value == null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function parseFechaInicioSmart(value) {
    if (value == null) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const norm = stripAccentsLower(raw);
    if (SENTINEL_VALUES.has(norm)) return null;

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        return raw.slice(0, 10);
    }

    const mEs = norm.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (mEs) {
        const mesKey = mEs[1];
        const dia = Number(mEs[2]);
        const anio = Number(mEs[3]);
        const mes = MESES_ES[mesKey];
        if (mes && dia >= 1 && dia <= 31 && anio >= 1900 && anio <= 2999) {
            const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
        }
    }

    const mEsLong = norm.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/);
    if (mEsLong) {
        const dia = Number(mEsLong[1]);
        const mes = MESES_ES[mEsLong[2]];
        const anio = Number(mEsLong[3]);
        if (mes && dia >= 1 && dia <= 31) {
            const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
        }
    }

    const fallback = parseDateOrNull(raw);
    if (fallback && /^\d{4}-\d{2}-\d{2}$/.test(fallback)) return fallback;
    return null;
}

function parseSalarioCop(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const raw = String(value).trim();
    if (!raw) return null;
    const norm = stripAccentsLower(raw);
    if (SENTINEL_VALUES.has(norm)) return null;
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parsea "Nombre-Parentesco-Tel" legacy de Excel/Dynamo. */
function parseLegacyContactConcat(value) {
    if (value == null || isSentinel(value)) return null;
    const parts = String(value).split('-').map((p) => p.trim());
    if (parts.length < 2) return null;
    return {
        nombre: parts[0] || '',
        parentesco: parts[1] || '',
        telefono: parts.slice(2).join('-') || '',
        email: ''
    };
}

function concatEmergencyContact(nombre, parentesco, telefono) {
    const n = [nombre, parentesco, telefono].map((x) => String(x || '').trim()).filter(Boolean);
    return n.length ? n.join('-') : '';
}

module.exports = {
    SENTINEL_VALUES,
    isSentinel,
    parseFechaInicioSmart,
    parseSalarioCop,
    parseLegacyContactConcat,
    concatEmergencyContact
};
