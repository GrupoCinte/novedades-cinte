'use strict';

const LABEL = { T30: '30 días', T15: '15 días', T5: '5 días' };

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function subjectForKind(kind, asOfDate, count) {
    const label = LABEL[kind] || kind;
    const n = Number(count) || 0;
    const noun = n === 1 ? '1 contrato' : `${n} contratos`;
    return `Contratos que vencen en ${label} — ${noun} — ${asOfDate}`;
}

function buildHtml({ kind, asOfDate, items }) {
    const label = LABEL[kind] || kind;
    const rows = (items || [])
        .map(
            (it) => `<tr>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.nombre)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.cedula)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.cliente)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.tipo_contrato)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(it.fecha_termino)}</td>
</tr>`
        )
        .join('');
    return `<!doctype html>
<html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <p>Capital Humano — contratos OPS, fijo, obra o labor e indefinido que vencen en <strong>${escapeHtml(label)}</strong> (día exacto ${escapeHtml(asOfDate)}).</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <thead>
      <tr style="background:#e8f3fb;text-align:left;">
        <th style="padding:8px 10px;">Nombre</th>
        <th style="padding:8px 10px;">Cédula</th>
        <th style="padding:8px 10px;">Cliente</th>
        <th style="padding:8px 10px;">Tipo</th>
        <th style="padding:8px 10px;">Vence</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}

module.exports = { LABEL, buildHtml, escapeHtml, subjectForKind };
