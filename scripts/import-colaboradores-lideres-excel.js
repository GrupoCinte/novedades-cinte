/**
 * Empalme colaborador -> lider_catalogo desde Excel.
 * Fuente esperada: hoja "MAESTRO COLABORADORES" con columnas DOCUMENTO, COLABORADOR, LIDER, ESTADO.
 *
 * Uso:
 *   node scripts/import-colaboradores-lideres-excel.js "C:/ruta/COLABORADORES.xlsx" --dry-run
 *   node scripts/import-colaboradores-lideres-excel.js "C:/ruta/COLABORADORES.xlsx" --apply
 *
 * Flags:
 *   --sheet <nombre-hoja>            (default: MAESTRO COLABORADORES)
 *   --only-activos yes|no            (default: yes)
 *   --report <ruta.csv>              (default: scripts/out/empalme_colaboradores_lideres_report.csv)
 *   --dry-run / --apply              (default: dry-run)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const { normalizeCedula, normalizeCatalogValue } = require('../src/utils');
const { foldForMatch } = require('../src/cotizador/clienteNombreMatch');

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    xlsxPath: '',
    sheet: 'MAESTRO COLABORADORES',
    onlyActivos: true,
    dryRun: true,
    reportPath: path.resolve('scripts', 'out', 'empalme_colaboradores_lideres_report.csv')
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--sheet') { out.sheet = String(args[i + 1] || out.sheet); i += 1; }
    else if (a === '--only-activos') { out.onlyActivos = String(args[i + 1] || 'yes').toLowerCase() !== 'no'; i += 1; }
    else if (a === '--report') { out.reportPath = path.resolve(String(args[i + 1] || out.reportPath)); i += 1; }
    else if (a === '--apply') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (!a.startsWith('-') && !out.xlsxPath) out.xlsxPath = path.resolve(a);
  }
  return out;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  const headers = [
    'line', 'status', 'reason', 'cedula', 'colaborador_excel', 'lider_excel',
    'colaborador_db', 'lider_anterior', 'lider_nuevo', 'cliente_db', 'lider_valido_para_cliente'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

function normName(v) {
  return foldForMatch(normalizeCatalogValue(v || ''));
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.xlsxPath || !fs.existsSync(opts.xlsxPath)) {
    console.error('Uso: node scripts/import-colaboradores-lideres-excel.js <archivo.xlsx> [--dry-run|--apply]');
    process.exit(1);
  }

  const wb = xlsx.readFile(opts.xlsxPath);
  if (!wb.SheetNames.includes(opts.sheet)) {
    console.error(`No se encontró hoja "${opts.sheet}". Hojas: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rawRows = xlsx.utils.sheet_to_json(wb.Sheets[opts.sheet], { defval: '', raw: false });
  const rows = opts.onlyActivos
    ? rawRows.filter((r) => String(r.ESTADO || '').trim().toUpperCase() === 'ACTIVO')
    : rawRows;

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  const report = [];
  const summary = {
    excelRows: rows.length,
    updated: 0,
    noChange: 0,
    missingCedula: 0,
    missingLider: 0,
    notFoundDb: 0,
    duplicateCedulaInExcel: 0,
    duplicateConflictLider: 0,
    liderClienteMismatch: 0
  };

  const byCed = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const line = i + 2;
    const cedula = normalizeCedula(r.DOCUMENTO || r.documento || '');
    const colabExcel = normalizeCatalogValue(r.COLABORADOR || r.Colaborador || '');
    const liderExcel = normalizeCatalogValue(r.LIDER || r.Lider || '');

    if (!cedula) {
      summary.missingCedula += 1;
      report.push({ line, status: 'skip', reason: 'cedula_invalida', cedula, colaborador_excel: colabExcel, lider_excel: liderExcel });
      continue;
    }
    if (!liderExcel) {
      summary.missingLider += 1;
      report.push({ line, status: 'skip', reason: 'lider_vacio_excel', cedula, colaborador_excel: colabExcel, lider_excel: liderExcel });
      continue;
    }

    if (!byCed.has(cedula)) {
      byCed.set(cedula, { line, cedula, colaborador_excel: colabExcel, lider_excel: liderExcel });
    } else {
      summary.duplicateCedulaInExcel += 1;
      const prev = byCed.get(cedula);
      if (normName(prev.lider_excel) !== normName(liderExcel)) {
        summary.duplicateConflictLider += 1;
        report.push({ line, status: 'skip', reason: 'duplicado_cedula_lider_conflictivo', cedula, colaborador_excel: colabExcel, lider_excel: liderExcel });
      }
    }
  }

  const toProcess = [...byCed.values()];
  let client = null;
  try {
    client = await pool.connect();
    if (!opts.dryRun) await client.query('BEGIN');

    for (const row of toProcess) {
      const q = await client.query(
        `SELECT cedula, nombre, cliente, lider_catalogo FROM colaboradores WHERE cedula = $1 LIMIT 1`,
        [row.cedula]
      );
      const db = q.rows[0];
      if (!db) {
        summary.notFoundDb += 1;
        report.push({ ...row, status: 'skip', reason: 'colaborador_no_existe_db' });
        continue;
      }

      const oldLider = normalizeCatalogValue(db.lider_catalogo || '');
      const newLider = row.lider_excel;
      const same = normName(oldLider) === normName(newLider);

      let liderValidoParaCliente = '';
      const clienteDb = normalizeCatalogValue(db.cliente || '');
      if (clienteDb) {
        const lq = await client.query('SELECT lider FROM clientes_lideres WHERE activo = TRUE AND cliente = $1', [clienteDb]);
        const valid = (lq.rows || []).some((x) => normName(x.lider) === normName(newLider));
        liderValidoParaCliente = valid ? 'yes' : 'no';
        if (!valid) summary.liderClienteMismatch += 1;
      }

      if (same) {
        summary.noChange += 1;
        report.push({
          ...row,
          status: 'ok',
          reason: 'sin_cambio',
          colaborador_db: db.nombre,
          lider_anterior: oldLider,
          lider_nuevo: newLider,
          cliente_db: clienteDb,
          lider_valido_para_cliente: liderValidoParaCliente
        });
        continue;
      }

      if (!opts.dryRun) {
        await client.query('UPDATE colaboradores SET lider_catalogo = $2, updated_at = NOW() WHERE cedula = $1', [row.cedula, newLider]);
      }
      summary.updated += 1;
      report.push({
        ...row,
        status: 'ok',
        reason: opts.dryRun ? 'actualizable' : 'actualizado',
        colaborador_db: db.nombre,
        lider_anterior: oldLider,
        lider_nuevo: newLider,
        cliente_db: clienteDb,
        lider_valido_para_cliente: liderValidoParaCliente
      });
    }

    if (!opts.dryRun) await client.query('COMMIT');
  } catch (e) {
    if (client && !opts.dryRun) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    throw e;
  } finally {
    if (client) client.release();
    await pool.end();
  }

  fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
  fs.writeFileSync(opts.reportPath, buildCsv(report), 'utf8');

  console.log('Modo:', opts.dryRun ? '--dry-run' : '--apply');
  console.log('Hoja:', opts.sheet);
  console.log('Archivo:', opts.xlsxPath);
  console.log('Reporte CSV:', opts.reportPath);
  console.log('Resumen:', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
