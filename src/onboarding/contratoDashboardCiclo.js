'use strict';

const { daysUntil, isoDay } = require('./contratoVencimiento');

/** Nacimiento de la ficha: reclutamiento → primera ficha en buzón → alta en maestro. */
function fichaNacioDate({ fechaReclutamiento, stagingCreated, personaCreated } = {}) {
    return isoDay(fechaReclutamiento) || isoDay(stagingCreated) || isoDay(personaCreated);
}

/** Días calendario Bogotá desde que nació la ficha hasta el ingreso. Negativos se descartan. */
function cicloFichaIngresoDias({
    fechaIngreso,
    fechaReclutamiento,
    stagingCreated,
    personaCreated
} = {}) {
    const ingreso = isoDay(fechaIngreso);
    const nacio = fichaNacioDate({ fechaReclutamiento, stagingCreated, personaCreated });
    if (!ingreso || !nacio) return null;
    const dias = daysUntil(ingreso, nacio);
    if (dias == null || dias < 0) return null;
    return dias;
}

function promedio(values) {
    const nums = (values || []).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    const sum = nums.reduce((acc, n) => acc + n, 0);
    return Number((sum / nums.length).toFixed(1));
}

const FICHA_NACIO_SQL = `
    COALESCE(
        c.fecha_reclutamiento,
        (
            SELECT MIN((s.created_at AT TIME ZONE 'America/Bogota')::date)
            FROM onboarding_staging s
            WHERE s.cedula_resultante = c.cedula
        ),
        (c.created_at AT TIME ZONE 'America/Bogota')::date
    )
`;

module.exports = {
    FICHA_NACIO_SQL,
    cicloFichaIngresoDias,
    fichaNacioDate,
    promedio
};
