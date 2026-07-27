import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SendRawEmailCommand } from '@aws-sdk/client-ses';
const LOGO_CID = 'cinte-logo';
const LOGO_FILENAME = 'logo-cinte-header-light.png';
function encodeSubjectUtf8(subject) {
    const s = String(subject || '').trim() || '(sin asunto)';
    // Encoded-word (RFC 2047) para asuntos con acentos
    if (/^[\x20-\x7E]*$/.test(s))
        return s;
    return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
function chunkBase64(b64, lineLen = 76) {
    const parts = [];
    for (let i = 0; i < b64.length; i += lineLen) {
        parts.push(b64.slice(i, i + lineLen));
    }
    return parts.join('\r\n');
}
function loadLogoPng() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.join(here, 'assets', LOGO_FILENAME),
        path.join(here, '..', 'assets', LOGO_FILENAME),
        path.join(process.cwd(), 'assets', LOGO_FILENAME)
    ];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return fs.readFileSync(p);
    }
    throw new Error(`Logo no encontrado (${LOGO_FILENAME}). Empaquete assets/ en el zip de Lambda.`);
}
/**
 * Envía HTML con logo embebido (CID). Evita depender de URL remota bloqueada por CORP/CSP.
 */
export async function sendHtmlEmailWithInlineLogo(sesClient, opts) {
    const toList = (Array.isArray(opts.to) ? opts.to : [opts.to])
        .map((e) => String(e || '').trim())
        .filter((e) => e.includes('@'));
    if (!toList.length)
        throw new Error('destinatario inválido');
    const boundary = `cinte_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const logoBuf = loadLogoPng();
    const htmlB64 = chunkBase64(Buffer.from(opts.html, 'utf8').toString('base64'));
    const logoB64 = chunkBase64(logoBuf.toString('base64'));
    const raw = [
        `From: ${opts.from}`,
        `To: ${toList.join(', ')}`,
        `Subject: ${encodeSubjectUtf8(opts.subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/related; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        htmlB64,
        '',
        `--${boundary}`,
        'Content-Type: image/png',
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${LOGO_CID}>`,
        `Content-Disposition: inline; filename="${LOGO_FILENAME}"`,
        '',
        logoB64,
        '',
        `--${boundary}--`,
        ''
    ].join('\r\n');
    return sesClient.send(new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(raw, 'utf8') }
    }));
}
export { LOGO_CID, LOGO_FILENAME };
