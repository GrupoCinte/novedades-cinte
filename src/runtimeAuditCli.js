/**
 * Resume `logs/http-audit.jsonl` y `logs/client-trace.jsonl` (RUNTIME_AUDIT).
 * Uso: node src/runtimeAuditCli.js [--http N] [--client N]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function parseArgs() {
    const out = { httpTail: 40, clientTail: 25 };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--http' && argv[i + 1]) {
            out.httpTail = Math.max(1, Math.min(5000, Number(argv[i + 1]) || 40));
            i++;
        } else if (argv[i] === '--client' && argv[i + 1]) {
            out.clientTail = Math.max(1, Math.min(5000, Number(argv[i + 1]) || 25));
            i++;
        }
    }
    return out;
}

function readJsonlTail(filePath, n) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\n/).filter((l) => l.trim());
    const slice = lines.slice(-n);
    return slice
        .map((l) => {
            try {
                return JSON.parse(l);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function countByPath(rows) {
    const m = new Map();
    for (const r of rows) {
        const p = String(r.path || r.route || '?');
        m.set(p, (m.get(p) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizeHttp(rows) {
    const byStatus = new Map();
    const slow = [];
    const errors5xx = [];
    for (const r of rows) {
        const st = Number(r.status) || 0;
        byStatus.set(st, (byStatus.get(st) || 0) + 1);
        if (Number(r.ms) > 2000) slow.push(r);
        if (st >= 500) errors5xx.push(r);
    }
    return { byStatus, slow, errors5xx };
}

function main() {
    const { httpTail, clientTail } = parseArgs();
    const httpPath = path.join(root, 'logs', 'http-audit.jsonl');
    const clientPath = path.join(root, 'logs', 'client-trace.jsonl');

    console.log('=== Runtime audit (local) ===\n');
    console.log(`Raíz: ${root}\n`);

    const httpAll = readJsonlTail(httpPath, 50000);
    const httpRecent = httpAll.slice(-httpTail);
    if (!httpAll.length) {
        console.log('(Sin logs/http-audit.jsonl o vacío. ¿Backend con RUNTIME_AUDIT distinto de 0?)');
    } else {
        const { byStatus, slow, errors5xx } = summarizeHttp(httpAll);
        console.log(`HTTP: ${httpAll.length} líneas en archivo (últimas ${httpTail} abajo).`);
        console.log('Conteo por status:', Object.fromEntries([...byStatus.entries()].sort((a, b) => a[0] - b[0])));
        if (errors5xx.length) {
            console.log(`\nÚltimos ${Math.min(15, errors5xx.length)} con status >= 500:`);
            for (const r of errors5xx.slice(-15)) {
                console.log(
                    `  ${r.ts} ${r.method} ${r.path} ${r.status} ${r.ms}ms reqId=${r.reqId} user=${r.userEmail || '-'}`
                );
            }
        }
        const slowLast = slow.slice(-10);
        if (slowLast.length) {
            console.log('\nÚltimas peticiones > 2000 ms:');
            for (const r of slowLast) {
                console.log(`  ${r.ts} ${r.method} ${r.path} ${r.status} ${r.ms}ms reqId=${r.reqId}`);
            }
        }
        console.log('\nTop rutas (todo el archivo leído):');
        for (const [p, c] of countByPath(httpAll).slice(0, 20)) {
            console.log(`  ${c}\t${p}`);
        }
        console.log(`\n--- Últimas ${httpRecent.length} líneas HTTP ---`);
        for (const r of httpRecent) {
            const u = r.userEmail ? ` ${r.userEmail}` : '';
            console.log(`${r.ts} ${r.method} ${r.path} ${r.status} ${r.ms}ms${u} reqId=${r.reqId}`);
        }
    }

    const clientRows = readJsonlTail(clientPath, clientTail);
    console.log(`\n--- Últimas ${clientRows.length} trazas de cliente (max ${clientTail}) ---`);
    if (!clientRows.length) {
        console.log('(Sin logs/client-trace.jsonl o vacío.)');
    } else {
        for (const r of clientRows) {
            console.log(`${r.ts} [${r.clientKind}] ${r.message || ''} route=${r.route || ''} reqId=${r.reqId || ''}`);
            if (r.url) console.log(`  url: ${r.url}`);
            if (r.detail) console.log(`  detail: ${String(r.detail).slice(0, 240)}${String(r.detail).length > 240 ? '…' : ''}`);
            if (r.stack) console.log(`  stack: ${String(r.stack).split('\n').slice(0, 4).join(' | ')}`);
        }
    }
    console.log('');
}

main();
