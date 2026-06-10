import { getTrazabilidadStageKey } from './hooks/useMonitorData';

/** Etapa n8n → clases pill (light/dark). */
export function statusToneByStage(stageKey, isLight = false) {
    const stage = String(stageKey || '').toLowerCase();
    if (isLight) {
        if (stage === 'cargando') return 'border-sky-300 bg-sky-50 text-sky-900';
        if (stage === 'contactado') return 'border-cyan-300 bg-cyan-50 text-cyan-900';
        if (stage === 'whatsapp enviado') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
        if (stage === 'documentos recibidos') return 'border-slate-300 bg-slate-100 text-slate-800';
        if (stage === 'sagrilaft enviado') return 'border-violet-300 bg-violet-50 text-violet-900';
        return 'border-green-300 bg-green-50 text-green-900';
    }
    if (stage === 'cargando') return 'bg-[rgba(42,144,255,0.12)] text-[#bfe6ff] border-[rgba(42,144,255,0.28)]';
    if (stage === 'contactado') return 'bg-[rgba(8,189,198,0.12)] text-[#7af2ea] border-[rgba(8,189,198,0.25)]';
    if (stage === 'whatsapp enviado') return 'bg-[rgba(31,199,106,0.12)] text-[#b8f7cd] border-[rgba(31,199,106,0.28)]';
    if (stage === 'documentos recibidos') return 'bg-[rgba(109,129,155,0.16)] text-[rgba(231,238,247,0.95)] border-[rgba(109,129,155,0.25)]';
    if (stage === 'sagrilaft enviado') return 'bg-[rgba(73,66,148,0.18)] text-[#d8d1ff] border-[rgba(73,66,148,0.35)]';
    return 'bg-[rgba(79,136,49,0.14)] text-[#9ae38c] border-[rgba(79,136,49,0.35)]';
}

export function statusTone(status, statusId = null, isLight = false) {
    const stage = getTrazabilidadStageKey(status, statusId);
    return statusToneByStage(stage, isLight);
}

/** Color sólido para dot/ping en modales y leyendas. */
export function statusDotColor(status, statusId = null) {
    const stage = getTrazabilidadStageKey(status, statusId);
    if (stage === 'cargando') return '#2a90ff';
    if (stage === 'contactado') return '#08bdc6';
    if (stage === 'whatsapp enviado') return '#1fc76a';
    if (stage === 'documentos recibidos') return '#64748b';
    if (stage === 'sagrilaft enviado') return '#8b5cf6';
    return '#4f8831';
}

export const STAGE_CHART_COLORS = {
    cargando: '#2a90ff',
    contactado: '#ffb347',
    'whatsapp enviado': '#14ffec',
    'documentos recibidos': '#2F7BB8',
    'sagrilaft enviado': '#A259FF',
    finalizado: '#FF3366'
};

export const STAGE_LABELS = {
    cargando: 'Cargando',
    contactado: 'Contactado',
    'whatsapp enviado': 'WhatsApp enviado',
    'documentos recibidos': 'Documentos recibidos',
    'sagrilaft enviado': 'Sagrilaft enviado',
    finalizado: 'Finalizado'
};
