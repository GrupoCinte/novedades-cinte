'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const {
    computeHoraExtraGroupSplitBogota,
    RECARGO_DOMINGO_MAX_HORAS_PRE_42
} = require('../src/heBogotaSplit');
const {
    mapSplitToPersistedFields,
    recomputeAndPersistDomingoRecargoGroup
} = require('../src/heDomingoRecargoGroup');

describe('heDomingoRecargoGroup', () => {
    it('mapSplitToPersistedFields manual conserva horas HE y recargo', () => {
        const fields = mapSplitToPersistedFields(
            {
                total: 8,
                horasRecargoDomingo: 4,
                horasRecargoDomingoDiurnas: 4,
                horasRecargoDomingoNocturnas: 0,
                diurnas: 2,
                nocturnas: 2
            },
            false
        );
        assert.equal(fields.horasDiurnas, 2);
        assert.equal(fields.horasNocturnas, 2);
        assert.equal(fields.horasRecargoDomingo, 4);
        assert.equal(fields.horasRecargoNocturno, 0);
        assert.equal(fields.tipoHoraExtra, 'Mixta');
    });

    it('mapSplitToPersistedFields malla en domingo mueve exceso diurno a recargo dom.', () => {
        const fields = mapSplitToPersistedFields(
            {
                total: 8,
                horasRecargoDomingo: 3.33,
                horasRecargoDomingoDiurnas: 3.33,
                horasRecargoDomingoNocturnas: 0,
                diurnas: 2,
                nocturnas: 2.67
            },
            true
        );
        assert.equal(fields.horasDiurnas, 0);
        assert.equal(fields.horasNocturnas, 0);
        assert.ok(Math.abs(fields.horasRecargoDomingoDiurnas - 5.33) < 0.02);
        assert.ok(Math.abs(fields.horasRecargoNocturno - 2.67) < 0.02);
    });

    it('grupo malla + manual mismo domingo comparten tope 7.33', () => {
        const manualStart = toUtcMsFromDateAndTime('2025-04-06', '06:00:00');
        const manualEnd = toUtcMsFromDateAndTime('2025-04-06', '10:00:00');
        const mallaStart = toUtcMsFromDateAndTime('2025-04-06', '14:00:00');
        const mallaEnd = toUtcMsFromDateAndTime('2025-04-06', '22:00:00');
        const splits = computeHoraExtraGroupSplitBogota(
            [
                { rowKey: 'manual', startMs: manualStart, endMs: manualEnd },
                { rowKey: 'malla', startMs: mallaStart, endMs: mallaEnd }
            ],
            new Set()
        );
        const manual = splits.get('manual');
        const malla = splits.get('malla');
        assert.ok(manual && malla);
        const totalRec = manual.horasRecargoDomingo + malla.horasRecargoDomingo;
        assert.ok(Math.abs(totalRec - RECARGO_DOMINGO_MAX_HORAS_PRE_42) < 0.02);
        const manualFields = mapSplitToPersistedFields(manual, false);
        const mallaFields = mapSplitToPersistedFields(malla, true);
        assert.equal(manualFields.horasRecargoDomingo, 4);
        assert.ok(mallaFields.horasRecargoDomingo > 0);
        assert.ok(mallaFields.horasDiurnas + mallaFields.horasNocturnas === 0);
    });

    it('tercera franja tras agotar 7.33 va toda a HE', () => {
        const d = '2025-04-06';
        const splits = computeHoraExtraGroupSplitBogota(
            [
                {
                    rowKey: 'a',
                    startMs: toUtcMsFromDateAndTime(d, '06:00:00'),
                    endMs: toUtcMsFromDateAndTime(d, '10:00:00')
                },
                {
                    rowKey: 'b',
                    startMs: toUtcMsFromDateAndTime(d, '11:00:00'),
                    endMs: toUtcMsFromDateAndTime(d, '15:00:00')
                },
                {
                    rowKey: 'c',
                    startMs: toUtcMsFromDateAndTime(d, '16:00:00'),
                    endMs: toUtcMsFromDateAndTime(d, '20:00:00')
                }
            ],
            new Set()
        );
        const a = splits.get('a');
        const b = splits.get('b');
        const c = splits.get('c');
        assert.equal(a.horasRecargoDomingo, 4);
        assert.ok(Math.abs(b.horasRecargoDomingo - 3.33) < 0.02);
        assert.equal(c.horasRecargoDomingo, 0);
        assert.ok(c.diurnas + c.nocturnas > 3.9);
    });

    it('recomputeAndPersistDomingoRecargoGroup actualiza filas del grupo', async () => {
        const id1 = '11111111-1111-4111-8111-111111111111';
        const id2 = '22222222-2222-4222-8222-222222222222';
        const rows = [
            {
                id: id1,
                cedula: '123',
                fecha_inicio: '2025-04-06',
                fecha_fin: '2025-04-06',
                hora_inicio: '06:00:00',
                hora_fin: '10:00:00',
                malla_origen_ref: null
            },
            {
                id: id2,
                cedula: '123',
                fecha_inicio: '2025-04-06',
                fecha_fin: '2025-04-06',
                hora_inicio: '14:00:00',
                hora_fin: '22:00:00',
                malla_origen_ref: null
            }
        ];
        const updates = [];
        const pool = {
            query: async (sql, params) => {
                if (/SELECT id, cedula/i.test(sql)) return { rows };
                if (/UPDATE novedades SET/i.test(sql)) {
                    updates.push({ id: params[0], cantidad: params[1], recargo: params[4] });
                    return { rows: [] };
                }
                return { rows: [] };
            }
        };
        const result = await recomputeAndPersistDomingoRecargoGroup(pool, '123', ['2025-04-06'], new Set());
        assert.equal(result.updated, 2);
        assert.equal(updates.length, 2);
        const totalRec = updates.reduce((s, u) => s + Number(u.recargo), 0);
        assert.ok(Math.abs(totalRec - RECARGO_DOMINGO_MAX_HORAS_PRE_42) < 0.02);
    });
});
