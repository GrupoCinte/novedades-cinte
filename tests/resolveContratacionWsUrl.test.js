/**
 * @file resolveContratacionWsUrl.test.js
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    resolveContratacionWsUrl,
    buildContratacionWsConnectUrl
} = require('../src/contratacion/resolveContratacionWsUrl');

describe('resolveContratacionWsUrl()', () => {
    it('prioriza VITE sobre monitor-config y host', () => {
        const url = resolveContratacionWsUrl({
            viteUrl: 'wss://api.example.com/prod/',
            configUrl: 'wss://config.example.com/prod',
            host: 'novedades.grupocinte.com',
            proto: 'https:'
        });
        assert.equal(url, 'wss://api.example.com/prod');
    });

    it('usa monitor-config si no hay VITE', () => {
        const url = resolveContratacionWsUrl({
            viteUrl: '',
            configUrl: 'wss://xxxx.execute-api.us-east-1.amazonaws.com/prod/',
            host: 'novedades.grupocinte.com',
            proto: 'https:'
        });
        assert.equal(url, 'wss://xxxx.execute-api.us-east-1.amazonaws.com/prod');
    });

    it('fallback al WS embebido del host en https', () => {
        const url = resolveContratacionWsUrl({
            host: 'novedades.grupocinte.com',
            proto: 'https:'
        });
        assert.equal(url, 'wss://novedades.grupocinte.com/api/contratacion/ws');
    });

    it('fallback ws: en http local', () => {
        const url = resolveContratacionWsUrl({
            host: 'localhost:5175',
            proto: 'http:'
        });
        assert.equal(url, 'ws://localhost:5175/api/contratacion/ws');
    });

    it('retorna vacío sin host ni urls', () => {
        assert.equal(resolveContratacionWsUrl({}), '');
    });
});

describe('buildContratacionWsConnectUrl()', () => {
    it('agrega ticket como query', () => {
        const url = buildContratacionWsConnectUrl(
            'wss://xxxx.execute-api.us-east-1.amazonaws.com/prod',
            'abc.def.ghi'
        );
        assert.equal(
            url,
            'wss://xxxx.execute-api.us-east-1.amazonaws.com/prod?ticket=abc.def.ghi'
        );
    });

    it('usa & si la base ya tiene query', () => {
        const url = buildContratacionWsConnectUrl('wss://x.example/prod?stage=1', 't1');
        assert.equal(url, 'wss://x.example/prod?stage=1&ticket=t1');
    });

    it('retorna vacío sin ticket o base', () => {
        assert.equal(buildContratacionWsConnectUrl('', 't'), '');
        assert.equal(buildContratacionWsConnectUrl('wss://x', ''), '');
    });
});
