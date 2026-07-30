'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseFechaInicioSmart,
    mapDynamoItemForPromotion
} = require('../src/onboarding/onboardingPromotionService');

describe('parseFechaInicioSmart — formatos de ingreso n8n/Dynamo', () => {
    it('ISO YYYY-MM-DD', () => {
        assert.equal(parseFechaInicioSmart('2026-07-27'), '2026-07-27');
        assert.equal(parseFechaInicioSmart('2026-07-27T15:00:00.000Z'), '2026-07-27');
    });

    it('DD/MM/YYYY Colombia: no interpreta como MM/DD (regresión Danny/Sara/Marlon/Christiane)', () => {
        // En V8, new Date('11/03/2026') → noviembre; aquí debe ser marzo.
        assert.equal(parseFechaInicioSmart('11/03/2026'), '2026-03-11');
        assert.equal(parseFechaInicioSmart('09/04/2026'), '2026-04-09');
        assert.equal(parseFechaInicioSmart('27/07/2026'), '2026-07-27');
        assert.equal(parseFechaInicioSmart('01/12/2026'), '2026-12-01');
        // Día > 12 deja claro que no es MM/DD
        assert.equal(parseFechaInicioSmart('28/07/2026'), '2026-07-28');
    });

    it('acepta separadores - y . en DD-MM-YYYY', () => {
        assert.equal(parseFechaInicioSmart('11-03-2026'), '2026-03-11');
        assert.equal(parseFechaInicioSmart('11.03.2026'), '2026-03-11');
        assert.equal(parseFechaInicioSmart('9/4/2026'), '2026-04-09');
    });

    it('formato largo español n8n', () => {
        assert.equal(parseFechaInicioSmart('27 de julio de 2026'), '2026-07-27');
        assert.equal(parseFechaInicioSmart('28 de julio del 2026'), '2026-07-28');
        assert.equal(parseFechaInicioSmart('3 de noviembre de 2026'), '2026-11-03');
    });

    it('formato abreviado agente extractor', () => {
        assert.equal(parseFechaInicioSmart('may 22, 2026'), '2026-05-22');
        assert.equal(parseFechaInicioSmart('dic 31, 2026'), '2026-12-31');
        assert.equal(parseFechaInicioSmart('Mar 11, 2026'), '2026-03-11');
    });

    it('rechaza centinelas y fechas imposibles', () => {
        assert.equal(parseFechaInicioSmart('PENDIENTE'), null);
        assert.equal(parseFechaInicioSmart('CARGANDO'), null);
        assert.equal(parseFechaInicioSmart('nada'), null);
        assert.equal(parseFechaInicioSmart('31/02/2026'), null);
        assert.equal(parseFechaInicioSmart(''), null);
        assert.equal(parseFechaInicioSmart(null), null);
    });

    it('nunca usa new Date slash: casos ambiguos día/mes <= 12 quedan DD/MM', () => {
        // Si se usara MM/DD, estos quedarían invertidos.
        assert.notEqual(parseFechaInicioSmart('03/11/2026'), '2026-03-11'); // sería nov si DD/MM → 3 nov
        assert.equal(parseFechaInicioSmart('03/11/2026'), '2026-11-03');
        assert.equal(parseFechaInicioSmart('04/09/2026'), '2026-09-04');
        // Los casos del incidente real:
        assert.notEqual(parseFechaInicioSmart('11/03/2026'), '2026-11-03');
        assert.notEqual(parseFechaInicioSmart('09/04/2026'), '2026-09-04');
    });
});

describe('mapDynamoItemForPromotion — fecha_inicio con barras', () => {
    it('Sara/Christiane/Marlon: 11/03/2026 → 2026-03-11 (pasados, fuera de Próximos)', () => {
        for (const [cedula, nombre] of [
            ['1000236540', 'Sara Valentina Quiroz Ramirez'],
            ['1031151912', 'Christiane Alejandro Galindo Montaña'],
            ['1031134927', 'Marlon David Molina Cubillos']
        ]) {
            const p = mapDynamoItemForPromotion({
                cedula,
                'nombre y apellido': nombre,
                status: 'finalizado',
                fecha_inicio: '11/03/2026'
            });
            assert.equal(p.fecha_ingreso, '2026-03-11', nombre);
        }
    });

    it('Danny: 09/04/2026 → 2026-04-09 (no 2026-09-04)', () => {
        const p = mapDynamoItemForPromotion({
            cedula: '1022389616',
            'nombre y apellido': 'Danny Giovanni Romero Lozano',
            status: 'Finalizado',
            fecha_inicio: '09/04/2026'
        });
        assert.equal(p.fecha_ingreso, '2026-04-09');
    });

    it('Velilla con formato largo sigue OK', () => {
        const p = mapDynamoItemForPromotion({
            cedula: '1128052332',
            'nombre y apellido': 'Pablo Gabriel Velilla Goenaga',
            status: 'Finalizado',
            fecha_inicio: '27 de julio de 2026'
        });
        assert.equal(p.fecha_ingreso, '2026-07-27');
    });
});
