import { useEffect, useMemo, useRef, useState } from 'react';
import { NOVEDAD_TYPES, getNovedadRule, countBusinessDaysInclusive, countCalendarDaysInclusive } from './novedadRules';
import { parseMontoCOPInput, formatMontoCOPLocale } from './copMoneyFormat';
import { toUtcMsFromDateAndTime } from './heNovedadBogotaClient.js';

function normalizeHoraHePayload(timeRaw) {
    const t = String(timeRaw || '').trim();
    if (!t) return '';
    if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t.slice(0, 8);
    if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
    return t.slice(0, 8);
}

const ALLOWED_ATTACHMENT_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.xls', '.xlsx']);
const ALLOWED_EXCEL_EXT = new Set(['.xls', '.xlsx']);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const MSG_EXCEL_PLANTILLA_GENERICO =
    '❌ Este tipo de novedad requiere al menos un archivo Excel (.xls o .xlsx) con el formato diligenciado.';

const URL_POLITICA_DATOS_PERSONALES =
    'https://grupocinte.com/politica-de-tratamiento-y-proteccion-de-datos-personales/';

/** El navegador suele exponer "Failed to fetch" cuando no hay red o el backend no responde en /api. */
function mensajeErrorVerificacionCedula(err) {
    const raw = String(err?.message || '').trim();
    const pareceFalloRed =
        err instanceof TypeError
        || /failed to fetch|networkerror|load failed|network request failed/i.test(raw);
    if (pareceFalloRed) {
        return 'Error en red';
    }
    return raw || 'No se pudo verificar la cédula.';
}

const FORMULARIO_THEME_STORAGE_KEY = 'formularioNovedadTheme';

/** Tokens de UI para el panel del formulario (oscuro = actual; claro = White). */
const FORM_THEMES = {
    dark: {
        pageOverlay: 'absolute inset-0 bg-[#04141E]/40 backdrop-blur-[2px]',
        formCard:
            'flex-1 lg:rounded-r-3xl lg:rounded-l-none rounded-none bg-[#04141E]/85 backdrop-blur-xl border border-[#1a3a56]/50 lg:border-l-0 overflow-y-auto max-h-screen lg:max-h-[92vh]',
        mobileHeaderTitle: 'font-heading text-lg font-bold text-white tracking-wide',
        input:
            'w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl font-body text-sm focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a] [color-scheme:dark]',
        label: 'text-sm font-medium text-[#9fb3c8] font-body',
        reqStar: 'text-[#65BCF7]',
        sectionTitle: 'font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-4 flex items-center gap-2',
        sectionTitleNoMb: 'font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-0 flex items-center gap-2',
        sectionBar: 'w-1.5 h-5 bg-[#65BCF7] rounded-full inline-block',
        sectionBarDetalle: 'w-1.5 h-5 bg-[#088DC6] rounded-full inline-block',
        sectionBarFechas: 'w-1.5 h-5 bg-[#2F7BB8] rounded-full inline-block',
        helperMuted: 'text-xs text-[#4a6f8f] mb-1.5 font-body',
        helperMutedPlain: 'text-xs text-[#4a6f8f] font-body',
        docErrorBox: 'rounded-xl border border-rose-500/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-100 font-body',
        avatarRow: 'flex items-center gap-4 p-4 rounded-xl bg-[#0b1e30]/60 border border-[#1a3a56]',
        avatarName: 'text-white font-body font-semibold text-sm',
        avatarSub: 'text-[#9fb3c8] font-body text-xs',
        badgeVerificado: 'ml-auto text-xs font-body font-semibold text-[#1fc76a] bg-[#1fc76a]/10 px-2 py-1 rounded-lg',
        correoReadonly: 'disabled:opacity-70 read-only:bg-[#04141E]/60 read-only:cursor-not-allowed',
        inputReadonly: 'read-only:bg-[#04141E]/60 read-only:text-[#9fb3c8]',
        heBlock: 'md:col-span-2 rounded-lg border border-violet-500/40 bg-[#0a1f2e] px-3 py-3 space-y-3',
        heText: 'text-sm text-[#9fb3c8] font-body',
        heStrong: 'text-[#e8f1ff]',
        radioLabel: 'flex items-center gap-2 text-sm text-[#9fb3c8] cursor-pointer font-body',
        hintStrong: 'text-[#9fb3c8]',
        hintLine: 'md:col-span-2 text-xs text-[#4a6f8f] font-body',
        fileDropDisabled: 'opacity-50 cursor-not-allowed pointer-events-none border-[#1a3a56] bg-[#0b1e30]/20',
        fileDropIdle: 'border-[#1a3a56] hover:border-[#2F7BB8] bg-[#0b1e30]/40',
        fileDropDrag: 'border-[#65BCF7] bg-[#65BCF7]/10',
        fileDropBase: 'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all',
        uploadIcon: 'w-10 h-10 text-[#4a6f8f]',
        uploadHint: 'text-sm text-[#9fb3c8] font-body',
        uploadHintAccent: 'text-[#65BCF7] font-semibold',
        chipExt: 'px-2 py-0.5 rounded text-[10px] font-bold font-body bg-[#1a3a56]/60 text-[#65BCF7]',
        fileRow: 'flex items-center gap-3 p-2.5 rounded-lg bg-[#0b1e30]/50 border border-[#1a3a56]',
        fileIconBg: 'w-9 h-9 flex items-center justify-center rounded-lg bg-[#2F7BB8]/20 text-[#65BCF7] text-[10px] font-bold font-body shrink-0',
        fileName: 'text-xs text-white font-body truncate',
        fileSize: 'text-[10px] text-[#4a6f8f] font-body',
        formatLink:
            'inline-flex items-center px-3 py-1.5 text-xs font-semibold font-body rounded-lg border border-[#2F7BB8]/40 text-[#65BCF7] hover:bg-[#2F7BB8]/10 transition-all',
        excelNote: 'text-xs text-[#65BCF7]/90 mt-2 font-body',
        consentBox: 'rounded-xl border border-[#1a3a56] bg-[#0b1e30]/40 px-4 py-4 space-y-3',
        consentLabel: 'text-sm text-[#9fb3c8] font-body leading-relaxed cursor-pointer',
        consentLink: 'text-[#65BCF7] underline underline-offset-2 hover:text-[#88cffc]',
        politicaMuted: 'text-xs text-[#4a6f8f] font-body pl-7',
        switchLabelActive: 'text-xs font-semibold font-body text-[#65BCF7]',
        switchLabelIdle: 'text-xs font-semibold font-body text-[#4a6f8f]',
        switchTrack: 'relative h-8 w-14 shrink-0 rounded-full border border-[#1a3a56] bg-[#0b1e30] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65BCF7]/50',
        switchTrackOn: 'border-[#2F7BB8] bg-[#2F7BB8]/40',
        switchThumb: 'pointer-events-none absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200',
        switchThumbOn: 'translate-x-6'
    },
    light: {
        pageOverlay: 'absolute inset-0 bg-slate-200/55 backdrop-blur-[2px]',
        formCard:
            'flex-1 lg:rounded-r-3xl lg:rounded-l-none rounded-none bg-white/95 backdrop-blur-xl border border-slate-200 shadow-sm lg:border-l-0 overflow-y-auto max-h-screen lg:max-h-[92vh]',
        mobileHeaderTitle: 'font-heading text-lg font-bold text-slate-900 tracking-wide',
        input:
            'w-full bg-white border border-slate-300 text-slate-900 p-3 rounded-xl font-body text-sm focus:outline-none focus:border-[#2F7BB8] focus:ring-2 focus:ring-[#2F7BB8]/25 transition-all placeholder-slate-400 [color-scheme:light]',
        label: 'text-sm font-medium text-slate-700 font-body',
        reqStar: 'text-[#2F7BB8]',
        sectionTitle: 'font-subtitle text-lg font-extralight text-[#004D87] tracking-wide mb-4 flex items-center gap-2',
        sectionTitleNoMb: 'font-subtitle text-lg font-extralight text-[#004D87] tracking-wide mb-0 flex items-center gap-2',
        sectionBar: 'w-1.5 h-5 bg-[#2F7BB8] rounded-full inline-block',
        sectionBarDetalle: 'w-1.5 h-5 bg-[#088DC6] rounded-full inline-block',
        sectionBarFechas: 'w-1.5 h-5 bg-[#004D87] rounded-full inline-block',
        helperMuted: 'text-xs text-slate-500 mb-1.5 font-body',
        helperMutedPlain: 'text-xs text-slate-500 font-body',
        docErrorBox: 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 font-body',
        avatarRow: 'flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200',
        avatarName: 'text-slate-900 font-body font-semibold text-sm',
        avatarSub: 'text-slate-600 font-body text-xs',
        badgeVerificado: 'ml-auto text-xs font-body font-semibold text-emerald-800 bg-emerald-100 px-2 py-1 rounded-lg',
        correoReadonly: 'disabled:opacity-70 read-only:bg-slate-100 read-only:cursor-not-allowed',
        inputReadonly: 'read-only:bg-slate-100 read-only:text-slate-600',
        heBlock: 'md:col-span-2 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-3 space-y-3',
        heText: 'text-sm text-slate-700 font-body',
        heStrong: 'text-slate-900',
        radioLabel: 'flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-body',
        hintStrong: 'text-slate-800',
        hintLine: 'md:col-span-2 text-xs text-slate-500 font-body',
        fileDropDisabled: 'opacity-50 cursor-not-allowed pointer-events-none border-slate-200 bg-slate-50',
        fileDropIdle: 'border-slate-300 hover:border-[#2F7BB8] bg-slate-50',
        fileDropDrag: 'border-[#2F7BB8] bg-sky-50',
        fileDropBase: 'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all',
        uploadIcon: 'w-10 h-10 text-slate-400',
        uploadHint: 'text-sm text-slate-600 font-body',
        uploadHintAccent: 'text-[#004D87] font-semibold',
        chipExt: 'px-2 py-0.5 rounded text-[10px] font-bold font-body bg-sky-100 text-[#004D87]',
        fileRow: 'flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200',
        fileIconBg: 'w-9 h-9 flex items-center justify-center rounded-lg bg-sky-100 text-[#004D87] text-[10px] font-bold font-body shrink-0',
        fileName: 'text-xs text-slate-900 font-body truncate',
        fileSize: 'text-[10px] text-slate-500 font-body',
        formatLink:
            'inline-flex items-center px-3 py-1.5 text-xs font-semibold font-body rounded-lg border border-[#2F7BB8]/50 text-[#004D87] hover:bg-sky-50 transition-all',
        excelNote: 'text-xs text-[#004D87] mt-2 font-body',
        consentBox: 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3',
        consentLabel: 'text-sm text-slate-700 font-body leading-relaxed cursor-pointer',
        consentLink: 'text-[#004D87] underline underline-offset-2 hover:text-[#2F7BB8]',
        politicaMuted: 'text-xs text-slate-500 font-body pl-7',
        switchLabelActive: 'text-xs font-semibold font-body text-[#004D87]',
        switchLabelIdle: 'text-xs font-semibold font-body text-slate-400',
        switchTrack: 'relative h-8 w-14 shrink-0 rounded-full border border-slate-300 bg-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7BB8]/40',
        switchTrackOn: 'border-[#2F7BB8] bg-sky-100',
        switchThumb: 'pointer-events-none absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ring-1 ring-slate-300/60',
        switchThumbOn: 'translate-x-6'
    }
};

/** Estado inicial del detalle (todo salvo cédula al resetear o fallar verificación). */
const EMPTY_DETALLE_FORM = {
    nombre: '',
    correo: '',
    cliente: '',
    lider: '',
    tipo: '',
    fecha: '',
    horaInicio: '',
    horaFin: '',
    cantidadHoras: '',
    fechaInicio: '',
    fechaFin: '',
    diasSolicitados: '',
    montoBono: '$ '
};

function isExcelAttachment(file) {
    const lowerName = String(file?.name || '').toLowerCase();
    const dotIndex = lowerName.lastIndexOf('.');
    const extension = dotIndex >= 0 ? lowerName.slice(dotIndex) : '';
    return ALLOWED_EXCEL_EXT.has(extension);
}

export default function FormularioNovedad() {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [formData, setFormData] = useState({
        nombre: '',
        cedula: '',
        correo: '',
        cliente: '',
        lider: '',
        tipo: '',
        fecha: '',
        horaInicio: '',
        horaFin: '',
        cantidadHoras: '',
        fechaInicio: '',
        fechaFin: '',
        diasSolicitados: '',
        montoBono: '$ '
    });

    const [status, setStatus] = useState({ type: '', text: '' });
    /** Mensajes de verificación de cédula (arriba, junto al solicitante). El envío sigue usando `status` abajo. */
    const [documentoMensaje, setDocumentoMensaje] = useState({ tipo: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [lideres, setLideres] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(false);
    const [colaboradorVerificado, setColaboradorVerificado] = useState(false);
    const [verificandoCedula, setVerificandoCedula] = useState(false);
    /** Solo líder precargado desde directorio (correo/cliente se bloquean con otra regla). */
    const [catalogLocks, setCatalogLocks] = useState({ lider: false });
    const [aceptaPoliticaDatos, setAceptaPoliticaDatos] = useState(false);
    const [themeMode, setThemeMode] = useState(() => {
        try {
            return localStorage.getItem(FORMULARIO_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
        } catch {
            return 'dark';
        }
    });

    const [heDomingoPreview, setHeDomingoPreview] = useState(null);
    const [heDomingoPreviewLoading, setHeDomingoPreviewLoading] = useState(false);
    const [heDomingoCompensacion, setHeDomingoCompensacion] = useState('');
    const [diaCompensatorioYmd, setDiaCompensatorioYmd] = useState('');
    const [festivosSet, setFestivosSet] = useState(new Set());
    const heDomingoPreviewTimerRef = useRef(null);

    useEffect(() => {
        fetch('/api/festivos')
            .then(res => res.json())
            .then(data => {
                if (data.ok && Array.isArray(data.festivos)) {
                    setFestivosSet(new Set(data.festivos));
                }
            })
            .catch(err => console.error('Error cargando festivos:', err));
    }, []);

    /** Tras comprobar cédula, el correo no se edita (valor viene del directorio o queda vacío hasta que lo carguen). */
    const bloquearCorreo = colaboradorVerificado;
    /** Cliente bloqueado si ya hay valor (API o selección previa); si el directorio viene vacío se permite elegir una vez. */
    const bloquearCliente = colaboradorVerificado && Boolean(String(formData.cliente || '').trim());
    const puedeDiligenciarDetalle = colaboradorVerificado;
    const tipoSeleccionado = Boolean(String(formData.tipo || '').trim());
    const detalleFormularioActivo = puedeDiligenciarDetalle && tipoSeleccionado;

    const normalizeCedulaInput = (value) => String(value || '').replace(/\D/g, '');

    const isHoraExtra = formData.tipo === 'Hora Extra';
    const rule = useMemo(() => getNovedadRule(formData.tipo), [formData.tipo]);
    const requiredDocuments = rule.requiredDocuments || [];
    const requiredDocsCount = requiredDocuments.length;
    const requiereAdjunto = requiredDocsCount > 0;
    const requierePlantillaExcel = Array.isArray(rule.formatLinks) && rule.formatLinks.length > 0;
    const requiereDias = Boolean(rule.requiresDayCount);
    const autocalculaDiasHabiles = Boolean(rule.autoBusinessDays);
    const autocalculaDiasCalendario = Boolean(rule.autoCalendarDays);
    const autocalculaDiasDesdeRango = autocalculaDiasHabiles || autocalculaDiasCalendario;
    const requiereMontoCop = Boolean(rule.requiresMonetaryAmount);
    const esDisponibilidad = formData.tipo === 'Disponibilidad';
    const esSinAdjuntosPublicos = esDisponibilidad;
    const esIncapacidad = formData.tipo === 'Incapacidad';
    const requiereLapsoHora = Boolean(rule.requiresTimeRange);
    const usaBloqueHoras = isHoraExtra || requiereLapsoHora;
    /** Disponibilidad: días hábiles del rango solo informativos (el backend no persiste días en cantidad_horas). */
    const diasInformativosDisponibilidad = useMemo(() => {
        if (!esDisponibilidad || !formData.fechaInicio || !formData.fechaFin) return 0;
        if (formData.fechaFin < formData.fechaInicio) return 0;
        return countBusinessDaysInclusive(formData.fechaInicio, formData.fechaFin, festivosSet);
    }, [esDisponibilidad, formData.fechaInicio, formData.fechaFin, festivosSet]);

    const parseMilitaryTimeToMinutes = (value) => {
        if (!value) return null;
        const clean = String(value).trim();
        const match = clean.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return (hours * 60) + minutes;
    };

    const isValidMilitaryTime = (value) => parseMilitaryTimeToMinutes(value) !== null;

    const formatTimeDigitsInput = (rawValue) => {
        const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
        if (!digits) return '';
        if (digits.length <= 2) return digits;
        return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    };

    const buildDateTimeMs = (dateValue, timeValue) => {
        if (!dateValue || !timeValue) return null;
        const d = new Date(`${dateValue}T${timeValue}:00`);
        if (Number.isNaN(d.getTime())) return null;
        return d.getTime();
    };

    useEffect(() => {
        if (!isHoraExtra || !colaboradorVerificado) {
            setHeDomingoPreview(null);
            setHeDomingoCompensacion('');
            setDiaCompensatorioYmd('');
            return undefined;
        }
        const c = normalizeCedulaInput(formData.cedula);
        const hi = normalizeHoraHePayload(formData.horaInicio);
        const hf = normalizeHoraHePayload(formData.horaFin);
        if (!c || !formData.fechaInicio || !formData.fechaFin || !hi || !hf) {
            setHeDomingoPreview(null);
            return undefined;
        }
        const a = toUtcMsFromDateAndTime(formData.fechaInicio, hi);
        const b = toUtcMsFromDateAndTime(formData.fechaFin, hf);
        if (a == null || b == null || b <= a) {
            setHeDomingoPreview(null);
            return undefined;
        }
        if (heDomingoPreviewTimerRef.current) clearTimeout(heDomingoPreviewTimerRef.current);
        heDomingoPreviewTimerRef.current = setTimeout(async () => {
            setHeDomingoPreviewLoading(true);
            try {
                const res = await fetch('/api/hora-extra-domingo-preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cedula: c,
                        nombre: formData.nombre,
                        fechaInicio: formData.fechaInicio,
                        fechaFin: formData.fechaFin,
                        horaInicio: hi,
                        horaFin: hf
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setHeDomingoPreview({
                        ok: false,
                        error: data?.error || 'No se pudo validar la política de domingo.'
                    });
                    setHeDomingoCompensacion('');
                    setDiaCompensatorioYmd('');
                    return;
                }
                setHeDomingoPreview(data);
                setHeDomingoCompensacion('');
                setDiaCompensatorioYmd('');
            } catch {
                setHeDomingoPreview({ ok: false, error: 'Error de red al consultar domingo.' });
            } finally {
                setHeDomingoPreviewLoading(false);
            }
        }, 450);
        return () => {
            if (heDomingoPreviewTimerRef.current) clearTimeout(heDomingoPreviewTimerRef.current);
        };
    }, [
        isHoraExtra,
        colaboradorVerificado,
        formData.cedula,
        formData.nombre,
        formData.fechaInicio,
        formData.fechaFin,
        formData.horaInicio,
        formData.horaFin
    ]);

    const bloqueHeDomingoComp = useMemo(() => {
        if (!isHoraExtra) return false;
        const c = normalizeCedulaInput(formData.cedula);
        const hi = normalizeHoraHePayload(formData.horaInicio);
        const hf = normalizeHoraHePayload(formData.horaFin);
        const a = toUtcMsFromDateAndTime(formData.fechaInicio, hi);
        const b = toUtcMsFromDateAndTime(formData.fechaFin, hf);
        const lapsoOk =
            Boolean(c && formData.fechaInicio && formData.fechaFin && hi && hf) &&
            a != null &&
            b != null &&
            b > a;
        if (lapsoOk && heDomingoPreviewLoading) return true;
        if (heDomingoPreview?.error) return true;
        if (!heDomingoPreview?.ok) return false;
        if (heDomingoPreview.requiereEleccionCompensacion) {
            if (!heDomingoCompensacion) return true;
            if (heDomingoCompensacion === 'tiempo' && !diaCompensatorioYmd) return true;
        }
        return false;
    }, [
        isHoraExtra,
        formData.cedula,
        formData.fechaInicio,
        formData.fechaFin,
        formData.horaInicio,
        formData.horaFin,
        heDomingoPreview,
        heDomingoPreviewLoading,
        heDomingoCompensacion,
        diaCompensatorioYmd
    ]);

    const horasCalculadas = useMemo(() => {
        if (!usaBloqueHoras) return 0;
        if (isHoraExtra) {
            const hi = normalizeHoraHePayload(formData.horaInicio);
            const hf = normalizeHoraHePayload(formData.horaFin);
            const a = toUtcMsFromDateAndTime(formData.fechaInicio, hi);
            const b = toUtcMsFromDateAndTime(formData.fechaFin, hf);
            if (a == null || b == null || b <= a) return 0;
            return Number(((b - a) / (1000 * 60 * 60)).toFixed(2));
        }
        const inicioMs = buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
        const finMs = buildDateTimeMs(formData.fechaFin, formData.horaFin);
        if (inicioMs === null || finMs === null || finMs <= inicioMs) return 0;
        return Number(((finMs - inicioMs) / (1000 * 60 * 60)).toFixed(2));
    }, [usaBloqueHoras, isHoraExtra, formData.fechaInicio, formData.fechaFin, formData.horaInicio, formData.horaFin]);

    const diasAutoCalculados = useMemo(() => {
        if (autocalculaDiasCalendario) {
            return countCalendarDaysInclusive(formData.fechaInicio, formData.fechaFin);
        }
        if (autocalculaDiasHabiles) {
            return countBusinessDaysInclusive(formData.fechaInicio, formData.fechaFin, festivosSet);
        }
        return 0;
    }, [autocalculaDiasCalendario, autocalculaDiasHabiles, formData.fechaInicio, formData.fechaFin, festivosSet]);

    /** Incluye el cliente del directorio aunque no coincida literalmente con la lista del catálogo (evita <select> en blanco). */
    const clientesParaSelect = useMemo(() => {
        const base = clientes.map((x) => String(x));
        const v = String(formData.cliente || '').trim();
        if (!v) return base;
        if (!base.some((x) => x === v)) return [...base, v].sort((a, b) => a.localeCompare(b, 'es'));
        return base;
    }, [clientes, formData.cliente]);

    /** Incluye el líder del directorio si el API de líderes no lo devolvió (mismo problema que cliente). */
    const lideresParaSelect = useMemo(() => {
        const base = lideres.map((x) => String(x));
        const v = String(formData.lider || '').trim();
        if (!v) return base;
        if (!base.some((x) => x === v)) return [...base, v].sort((a, b) => a.localeCompare(b, 'es'));
        return base;
    }, [lideres, formData.lider]);

    const horaFinInvalida = usaBloqueHoras
        && formData.fechaInicio
        && formData.fechaFin
        && formData.horaInicio
        && formData.horaFin
        && (
            isHoraExtra
                ? (() => {
                    const a = toUtcMsFromDateAndTime(formData.fechaInicio, normalizeHoraHePayload(formData.horaInicio));
                    const b = toUtcMsFromDateAndTime(formData.fechaFin, normalizeHoraHePayload(formData.horaFin));
                    return a == null || b == null || b <= a;
                })()
                : buildDateTimeMs(formData.fechaFin, formData.horaFin) <= buildDateTimeMs(formData.fechaInicio, formData.horaInicio)
        );

    const horaInicioFormatoInvalido = usaBloqueHoras
        && Boolean(formData.horaInicio)
        && !isValidMilitaryTime(formData.horaInicio);

    const horaFinFormatoInvalido = usaBloqueHoras
        && Boolean(formData.horaFin)
        && !isValidMilitaryTime(formData.horaFin);

    const fechaFinInvalida = !usaBloqueHoras
        && formData.fechaInicio
        && formData.fechaFin
        && formData.fechaFin < formData.fechaInicio;

    const bloqueoEnvioHoraExtra = usaBloqueHoras
        && (
            !formData.fechaInicio
            || !formData.fechaFin
            || !formData.horaInicio
            || !formData.horaFin
            || horaInicioFormatoInvalido
            || horaFinFormatoInvalido
            || horaFinInvalida
        );

    const bloqueoEnvioFechas = !usaBloqueHoras
        && (
            !formData.fechaInicio
            || fechaFinInvalida
            || (autocalculaDiasDesdeRango && !String(formData.fechaFin || '').trim())
        );

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'cedula') {
            const digits = normalizeCedulaInput(value);
            setColaboradorVerificado(false);
            setCatalogLocks({ lider: false });
            setDocumentoMensaje({ tipo: '', text: '' });
            setStatus({ type: '', text: '' });
            setSelectedFiles([]);
            setLideres([]);
            setHeDomingoPreview(null);
            setHeDomingoCompensacion('');
            setDiaCompensatorioYmd('');
            setAceptaPoliticaDatos(false);
            setFormData({ ...EMPTY_DETALLE_FORM, cedula: digits });
            return;
        }
        if (!colaboradorVerificado) return;
        if (bloquearCorreo && name === 'correo') return;
        if (bloquearCliente && name === 'cliente') return;
        if (catalogLocks.lider && colaboradorVerificado && name === 'lider') return;
        if (name === 'cliente') {
            setFormData({ ...formData, cliente: value, lider: '' });
            return;
        }
        if (name === 'horaInicio') {
            const formattedHoraInicio = formatTimeDigitsInput(value);
            const nuevaHoraInicio = parseMilitaryTimeToMinutes(formattedHoraInicio);
            const horaFinActual = parseMilitaryTimeToMinutes(formData.horaFin);
            const mismoDia = String(formData.fechaInicio || '') === String(formData.fechaFin || '');
            const resetHoraFin = mismoDia && horaFinActual !== null && nuevaHoraInicio !== null && horaFinActual <= nuevaHoraInicio;
            setFormData({ ...formData, horaInicio: formattedHoraInicio, horaFin: resetHoraFin ? '' : formData.horaFin });
            return;
        }
        if (name === 'horaFin') {
            const formattedHoraFin = formatTimeDigitsInput(value);
            setFormData({ ...formData, horaFin: formattedHoraFin });
            return;
        }
        if (name === 'fechaInicio') {
            const resetFechaFin = formData.fechaFin && formData.fechaFin < value;
            const nextFechaFin = resetFechaFin ? '' : formData.fechaFin;
            const nextDias = autocalculaDiasCalendario
                ? String(countCalendarDaysInclusive(value, nextFechaFin))
                : autocalculaDiasHabiles
                    ? String(countBusinessDaysInclusive(value, nextFechaFin, festivosSet))
                    : formData.diasSolicitados;
            setFormData({ ...formData, fechaInicio: value, fechaFin: nextFechaFin, diasSolicitados: nextDias });
            return;
        }
        if (name === 'fechaFin') {
            const nextDias = autocalculaDiasCalendario
                ? String(countCalendarDaysInclusive(formData.fechaInicio, value))
                : autocalculaDiasHabiles
                    ? String(countBusinessDaysInclusive(formData.fechaInicio, value, festivosSet))
                    : formData.diasSolicitados;
            setFormData({ ...formData, fechaFin: value, diasSolicitados: nextDias });
            return;
        }
        if (name === 'tipo') {
            const nextRule = getNovedadRule(value);
            const nextRequiereDias = Boolean(nextRule.requiresDayCount);
            const nextAutoHabiles = Boolean(nextRule.autoBusinessDays);
            const nextAutoCalendario = Boolean(nextRule.autoCalendarDays);
            const tipoVacio = !String(value || '').trim();
            let nextDias = '';
            if (nextAutoCalendario) {
                nextDias = String(countCalendarDaysInclusive(formData.fechaInicio, formData.fechaFin));
            } else if (nextAutoHabiles) {
                nextDias = String(countBusinessDaysInclusive(formData.fechaInicio, formData.fechaFin, festivosSet));
            } else if (nextRequiereDias) {
                nextDias = formData.diasSolicitados;
            }
            setFormData({
                ...formData,
                tipo: value,
                cliente: tipoVacio ? '' : formData.cliente,
                lider: tipoVacio ? '' : formData.lider,
                diasSolicitados: nextDias,
                montoBono: nextRule.requiresMonetaryAmount ? '$ ' : '$ '
            });
            if (tipoVacio) setLideres([]);
            if (value === 'Disponibilidad') {
                setSelectedFiles([]);
            }
            return;
        }
        if (name === 'montoBono') {
            setFormData({ ...formData, montoBono: value });
            return;
        }
        setFormData({ ...formData, [name]: value });
    };

    const handleComprobarCedula = async () => {
        const c = normalizeCedulaInput(formData.cedula);
        if (!c) {
            setDocumentoMensaje({
                tipo: 'error',
                text: '❌ Ingresa una cédula (solo números, sin puntos ni comas).'
            });
            return;
        }
        setVerificandoCedula(true);
        setDocumentoMensaje({ tipo: '', text: '' });
        setStatus({ type: '', text: '' });
        try {
            const res = await fetch(`/api/catalogos/colaborador?cedula=${encodeURIComponent(c)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Cédula no registrada');
            }
            setFormData((prev) => ({
                ...prev,
                cedula: data.cedula || c,
                nombre: data.nombre || '',
                correo: String(data.correo ?? '').trim(),
                cliente: String(data.cliente ?? '').trim(),
                lider: String(data.lider ?? '').trim()
            }));
            setCatalogLocks({
                lider: Boolean(data.lockLider)
            });
            setColaboradorVerificado(true);
            setDocumentoMensaje({ tipo: '', text: '' });
        } catch (err) {
            setColaboradorVerificado(false);
            setCatalogLocks({ lider: false });
            setSelectedFiles([]);
            setLideres([]);
            setHeDomingoPreview(null);
            setHeDomingoCompensacion('');
            setDiaCompensatorioYmd('');
            setAceptaPoliticaDatos(false);
            setFormData((prev) => ({ ...EMPTY_DETALLE_FORM, cedula: prev.cedula }));
            setDocumentoMensaje({
                tipo: 'error',
                text: `❌ ${mensajeErrorVerificacionCedula(err)}`
            });
        } finally {
            setVerificandoCedula(false);
        }
    };

    useEffect(() => {
        try {
            localStorage.setItem(FORMULARIO_THEME_STORAGE_KEY, themeMode);
        } catch {
            /* ignore */
        }
    }, [themeMode]);

    useEffect(() => {
        const loadClientes = async () => {
            setLoadingCatalogos(true);
            try {
                const res = await fetch('/api/catalogos/clientes');
                const json = await res.json();
                if (res.ok && Array.isArray(json.items)) {
                    setClientes(json.items);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoadingCatalogos(false);
            }
        };
        loadClientes();
    }, []);

    useEffect(() => {
        const loadLideres = async () => {
            if (!formData.cliente) {
                setLideres([]);
                return;
            }
            setLoadingCatalogos(true);
            try {
                const res = await fetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(formData.cliente)}`);
                const json = await res.json();
                if (res.ok && Array.isArray(json.items)) {
                    setLideres(json.items);
                } else {
                    setLideres([]);
                }
            } catch (error) {
                console.error(error);
                setLideres([]);
            } finally {
                setLoadingCatalogos(false);
            }
        };
        loadLideres();
    }, [formData.cliente]);

    useEffect(() => {
        if (!autocalculaDiasDesdeRango) return;
        const next = String(diasAutoCalculados);
        if (formData.diasSolicitados !== next) {
            setFormData((prev) => ({ ...prev, diasSolicitados: next }));
        }
    }, [autocalculaDiasDesdeRango, diasAutoCalculados, formData.diasSolicitados]);

    const getAttachmentError = (file) => {
        if (!file) return null;
        if (file.size > MAX_ATTACHMENT_BYTES) {
            return '❌ El archivo supera 5MB. Adjunta un archivo de máximo 5MB.';
        }
        const lowerName = file.name.toLowerCase();
        const dotIndex = lowerName.lastIndexOf('.');
        const extension = dotIndex >= 0 ? lowerName.slice(dotIndex) : '';
        const extOk = ALLOWED_ATTACHMENT_EXT.has(extension);
        const mimeOk = !file.type || ALLOWED_ATTACHMENT_MIME.has(file.type);
        if (!extOk || !mimeOk) {
            return '❌ Tipo de archivo no permitido. Solo PDF, JPG, PNG, XLS o XLSX.';
        }
        return null;
    };

    const mergeUniqueFiles = (currentFiles, incomingFiles) => {
        const keyOf = (f) => `${f.name}__${f.size}__${f.lastModified}`;
        const byKey = new Map((currentFiles || []).map((f) => [keyOf(f), f]));
        for (const f of incomingFiles || []) {
            byKey.set(keyOf(f), f);
        }
        return Array.from(byKey.values());
    };

    const handleFileChange = (e) => {
        if (!detalleFormularioActivo) {
            e.target.value = '';
            return;
        }
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            const error = getAttachmentError(file);
            if (error) {
                setStatus({ type: 'error', text: error });
                e.target.value = '';
                return;
            }
        }
        setSelectedFiles((prev) => mergeUniqueFiles(prev, files));
        e.target.value = '';
        if (status.type === 'error') {
            setStatus({ type: '', text: '' });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!aceptaPoliticaDatos) {
            setStatus({
                type: 'error',
                text: '❌ Debes aceptar la política de tratamiento y protección de datos personales para enviar la solicitud.'
            });
            return;
        }

        if (!colaboradorVerificado) {
            setStatus({
                type: 'error',
                text: '❌ Debes comprobar la cédula y tener un colaborador registrado antes de enviar.'
            });
            return;
        }

        if (bloqueHeDomingoComp) {
            const msg = heDomingoPreview?.error
                ? `❌ ${heDomingoPreview.error}`
                : '❌ Completa la compensación dominical (tiempo o dinero; si es tiempo, elige el domingo compensatorio).';
            setStatus({ type: 'error', text: msg });
            return;
        }
        if (bloqueoEnvioHoraExtra || bloqueoEnvioFechas) {
            const mensaje = isHoraExtra
                ? '❌ Corrige fecha/horas de Hora Extra antes de enviar.'
                : autocalculaDiasDesdeRango && !String(formData.fechaFin || '').trim()
                    ? '❌ Indica Fecha Inicio y Fecha Fin para calcular los días.'
                    : '❌ Corrige las fechas (Fecha Fin no puede ser menor a Fecha Inicio o falta Fecha Inicio).';
            setStatus({ type: 'error', text: mensaje });
            return;
        }
        if (!formData.cliente || !formData.lider) {
            setStatus({ type: 'error', text: '❌ Debes seleccionar cliente y lider.' });
            return;
        }
        if (!colaboradorVerificado || !normalizeCedulaInput(formData.cedula) || !String(formData.nombre || '').trim()) {
            setStatus({ type: 'error', text: '❌ Debes comprobar la cédula y tener un colaborador válido antes de enviar.' });
            return;
        }
        if (esIncapacidad && formData.fechaInicio && formData.fechaInicio > todayIso) {
            setStatus({ type: 'error', text: '❌ Incapacidad no puede tener Fecha Inicio futura.' });
            return;
        }


        if (!esSinAdjuntosPublicos) {
            if (requiereAdjunto && selectedFiles.length < requiredDocsCount) {
                setStatus({
                    type: 'error',
                    text: `❌ Debes adjuntar todos los documentos requeridos: ${requiredDocuments.join(', ')}.`
                });
                return;
            }

            if (requierePlantillaExcel) {
                if (selectedFiles.length === 0) {
                    setStatus({ type: 'error', text: MSG_EXCEL_PLANTILLA_GENERICO });
                    return;
                }
                if (!selectedFiles.some(isExcelAttachment)) {
                    setStatus({ type: 'error', text: MSG_EXCEL_PLANTILLA_GENERICO });
                    return;
                }
            }
            for (const file of selectedFiles) {
                const attachmentError = getAttachmentError(file);
                if (attachmentError) {
                    setStatus({ type: 'error', text: attachmentError });
                    return;
                }
            }
        }

        if (autocalculaDiasDesdeRango && !(diasAutoCalculados > 0)) {
            const msgDias = autocalculaDiasCalendario
                ? '❌ El rango de fechas no genera días de calendario válidos (revisa inicio y fin).'
                : '❌ El rango seleccionado no contiene dias hábiles (lunes a viernes).';
            setStatus({ type: 'error', text: msgDias });
            return;
        }

        if (requiereDias && !autocalculaDiasDesdeRango && !(Number(formData.diasSolicitados) > 0)) {
            setStatus({ type: 'error', text: '❌ Debes diligenciar una cantidad de dias valida.' });
            return;
        }

        if (usaBloqueHoras) {
            const inicio = isHoraExtra
                ? toUtcMsFromDateAndTime(formData.fechaInicio, normalizeHoraHePayload(formData.horaInicio))
                : buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
            const fin = isHoraExtra
                ? toUtcMsFromDateAndTime(formData.fechaFin, normalizeHoraHePayload(formData.horaFin))
                : buildDateTimeMs(formData.fechaFin, formData.horaFin);

            if (!formData.fechaInicio || !formData.fechaFin || inicio === null || fin === null) {
                setStatus({ type: 'error', text: '❌ Este tipo requiere fecha inicio, fecha fin y lapso horario.' });
                return;
            }
            if (fin <= inicio) {
                setStatus({ type: 'error', text: '❌ La fecha/hora fin debe ser mayor que la fecha/hora inicio.' });
                return;
            }
        }

        if (requiereMontoCop) {
            const monto = parseMontoCOPInput(formData.montoBono);
            if (monto == null || monto <= 0) {
                setStatus({ type: 'error', text: '❌ Indica un valor en pesos mayor a cero (ej. $ 1.500.000 o 1500000,50).' });
                return;
            }
        }

        setIsSubmitting(true);
        setStatus({ type: 'wait', text: 'Procesando envío...' });

        try {
            const payload = new FormData();
            payload.append('nombre', formData.nombre);
            payload.append('cedula', formData.cedula);
            payload.append('correoSolicitante', formData.correo);
            payload.append('cliente', formData.cliente || '');
            payload.append('lider', formData.lider || '');
            payload.append('tipoNovedad', formData.tipo);
            payload.append('aceptaPoliticaDatos', aceptaPoliticaDatos ? 'true' : 'false');

            if (usaBloqueHoras) {
                payload.append('fecha', formData.fechaInicio);
                payload.append('horaInicio', formData.horaInicio);
                payload.append('horaFin', formData.horaFin);
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin);
                payload.append('cantidadHoras', String(horasCalculadas));
                if (!isHoraExtra) {
                    payload.append('horasDiurnas', '0');
                    payload.append('horasNocturnas', '0');
                    payload.append('tipoHoraExtra', '');
                }
                if (isHoraExtra && heDomingoPreview?.ok && heDomingoPreview.requiereEleccionCompensacion && heDomingoCompensacion) {
                    payload.append('heDomingoCompensacion', heDomingoCompensacion);
                    if (heDomingoCompensacion === 'tiempo' && diaCompensatorioYmd) {
                        payload.append('diaCompensatorioYmd', diaCompensatorioYmd);
                    }
                }
            } else {
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin || 'N/A');
                const diasValuePayload = autocalculaDiasDesdeRango
                    ? diasAutoCalculados
                    : (requiereDias ? Number(formData.diasSolicitados || 0) : Number(formData.cantidadHoras || 0));
                payload.append(
                    'cantidadHoras',
                    (requiereDias || autocalculaDiasDesdeRango) ? diasValuePayload : (formData.cantidadHoras || 0)
                );
            }
            if (requiereMontoCop) {
                const monto = parseMontoCOPInput(formData.montoBono);
                payload.append('montoCop', String(monto != null ? monto : 0));
            }

            if (!esSinAdjuntosPublicos) {
                for (const file of selectedFiles) {
                    payload.append('soportes', file);
                }
            }

            const res = await fetch('/api/enviar-novedad', {
                method: 'POST',
                body: payload
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                setStatus({ type: 'success', text: '✅ ¡Guardado con éxito!' });
                setFormData({
                    nombre: '',
                    cedula: '',
                    correo: '',
                    cliente: '',
                    lider: '',
                    tipo: '',
                    fecha: '',
                    horaInicio: '',
                    horaFin: '',
                    cantidadHoras: '',
                    fechaInicio: '',
                    fechaFin: '',
                    diasSolicitados: '',
                    montoBono: '$ '
                });
                setColaboradorVerificado(false);
                setCatalogLocks({ lider: false });
                setDocumentoMensaje({ tipo: '', text: '' });
                setSelectedFiles([]);
                setLideres([]);
                setAceptaPoliticaDatos(false);
                // Limpiar mensaje de éxito después de unos segundos
                setTimeout(() => setStatus({ type: '', text: '' }), 4000);
            } else {
                throw new Error(data?.error || data?.message || 'Error al enviar la solicitud');
            }
        } catch (error) {
            console.error(error);
            let errMsg = error?.message || 'Error al enviar la solicitud';
            if (/failed to fetch|networkerror|load failed/i.test(errMsg)) {
                errMsg = 'Error en red';
            }
            setStatus({ type: 'error', text: `❌ ${errMsg}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const [dragOver, setDragOver] = useState(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (!detalleFormularioActivo) return;
        const files = Array.from(e.dataTransfer?.files || []);
        for (const file of files) {
            const error = getAttachmentError(file);
            if (error) { setStatus({ type: 'error', text: error }); return; }
        }
        setSelectedFiles((prev) => mergeUniqueFiles(prev, files));
    };

    const removeFile = (idx) => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));

    const handleMontoBonoBlur = () => {
        const n = parseMontoCOPInput(formData.montoBono);
        if (n == null) {
            setFormData((prev) => ({ ...prev, montoBono: '$ ' }));
            return;
        }
        setFormData((prev) => ({ ...prev, montoBono: formatMontoCOPLocale(n) }));
    };

    const fileIcon = (name) => {
        const ext = (name || '').split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'PDF';
        if (ext === 'jpg' || ext === 'jpeg') return 'JPG';
        if (ext === 'png') return 'PNG';
        if (ext === 'xls' || ext === 'xlsx') return 'XLS';
        return 'FILE';
    };

    const theme = FORM_THEMES[themeMode];
    const inputCls = theme.input;
    const labelCls = theme.label;
    const reqStar = <span className={theme.reqStar}>*</span>;

    return (
        <div
            className="relative min-h-screen w-full flex items-center justify-center overflow-hidden font-body"
            style={{ backgroundImage: `linear-gradient(135deg, rgba(4,20,30,0.92) 0%, rgba(0,77,135,0.7) 100%), url('/img/bg-portal.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' }}
        >
            <div className={theme.pageOverlay} />

            <div className="relative z-10 flex flex-col lg:flex-row w-full max-w-7xl mx-auto min-h-screen lg:min-h-0 lg:my-8">

                {/* ── Panel izquierdo: branding ── */}
                <div
                    className="hidden lg:flex lg:w-[32%] flex-col items-center justify-center p-10 rounded-l-3xl relative overflow-hidden"
                    style={{ backgroundImage: `url('/img/bg-branding.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-[#004D87]/50 via-[#04141E]/30 to-[#04141E]/70" />
                    <div className="relative z-10 flex flex-col items-center gap-6 text-center">
                        <img
                            src="/assets/logo-cinte-header.png"
                            alt="CINTE"
                            className="w-40 drop-shadow-lg"
                        />
                        <h1 className="font-heading text-2xl font-bold text-white tracking-wide leading-tight">
                            PORTAL DE RADICACIÓN<br />DE NOVEDADES
                        </h1>
                        <div className="w-16 h-0.5 bg-[#65BCF7] rounded-full" />
                        <p className="font-body text-sm text-[#9fb3c8] max-w-[240px]">
                            Registra y gestiona tus novedades laborales de manera ágil y segura.
                        </p>
                    </div>
                </div>

                {/* ── Panel derecho: formulario ── */}
                <div className={theme.formCard}>
                    <div className="p-6 md:p-10">

                        <form onSubmit={handleSubmit} className="space-y-8">

                            {/* ═══ Sección: Solicitante ═══ */}
                            <section>
                                <div className="mb-3 flex items-center gap-3 lg:hidden">
                                    <img src="/assets/logo-cinte-header.png" alt="CINTE" className="w-10 shrink-0" />
                                    <h1 className={`min-w-0 ${theme.mobileHeaderTitle}`}>PORTAL DE RADICACIÓN DE NOVEDADES</h1>
                                </div>
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <h2 className={`min-w-0 flex-1 ${theme.sectionTitleNoMb}`}>
                                        <span className={theme.sectionBar} />
                                        Solicitante
                                    </h2>
                                    <div className="flex shrink-0 items-center justify-end gap-3 sm:pl-2">
                                        <span className={themeMode === 'light' ? theme.switchLabelActive : theme.switchLabelIdle}>White</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={themeMode === 'light'}
                                            aria-label="Cambiar tema del formulario entre claro y oscuro"
                                            onClick={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
                                            className={`${theme.switchTrack} ${themeMode === 'light' ? theme.switchTrackOn : ''}`}
                                        >
                                            <span
                                                className={`${theme.switchThumb} ${themeMode === 'light' ? theme.switchThumbOn : ''}`}
                                            />
                                        </button>
                                        <span className={themeMode === 'dark' ? theme.switchLabelActive : theme.switchLabelIdle}>Dark</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelCls}>Cédula {reqStar}</label>
                                        <p className={theme.helperMuted}>Solo números, sin puntos ni comas.</p>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                required
                                                name="cedula"
                                                value={formData.cedula}
                                                onChange={handleChange}
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                placeholder="Ej: 1234567890"
                                                className={`flex-1 ${inputCls}`}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleComprobarCedula}
                                                disabled={verificandoCedula}
                                                className="px-5 py-3 rounded-xl bg-[#2F7BB8] text-white font-semibold font-body text-sm hover:bg-[#004D87] disabled:opacity-50 transition-all shadow-md shadow-[#004D87]/20"
                                            >
                                                {verificandoCedula ? 'Verificando...' : 'Comprobar'}
                                            </button>
                                        </div>
                                    </div>

                                    {documentoMensaje.tipo === 'error' && documentoMensaje.text ? (
                                        <div className={theme.docErrorBox}>
                                            {documentoMensaje.text}
                                        </div>
                                    ) : null}

                                    {colaboradorVerificado && formData.nombre && (
                                        <div className={theme.avatarRow}>
                                            <div className="w-12 h-12 rounded-full bg-[#2F7BB8] flex items-center justify-center text-white font-heading font-bold text-lg shrink-0">
                                                {(formData.nombre || '').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className={theme.avatarName}>{formData.nombre}</p>
                                                <p className={theme.avatarSub}>CC {formData.cedula}</p>
                                            </div>
                                            <span className={theme.badgeVerificado}>Verificado</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className={labelCls}>Correo del Solicitante</label>
                                        <input
                                            name="correo"
                                            value={formData.correo}
                                            onChange={handleChange}
                                            type="email"
                                            autoComplete="off"
                                            disabled={!colaboradorVerificado}
                                            readOnly={bloquearCorreo}
                                            aria-readonly={bloquearCorreo}
                                            placeholder="usuario@dominio.com"
                                            className={`${inputCls} ${!colaboradorVerificado || bloquearCorreo ? theme.correoReadonly : ''}`}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* ═══ Sección: Detalles ═══ */}
                            <section>
                                <h2 className={theme.sectionTitle}>
                                    <span className={theme.sectionBarDetalle} />
                                    Detalles
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <label className={labelCls}>Cliente {reqStar}</label>
                                        <select
                                            required
                                            name="cliente"
                                            value={formData.cliente}
                                            onChange={handleChange}
                                            disabled={!puedeDiligenciarDetalle || bloquearCliente}
                                            className={`${inputCls} ${(!puedeDiligenciarDetalle || bloquearCliente) ? 'disabled:opacity-70' : ''}`}
                                        >
                                            <option value="">{loadingCatalogos ? 'Cargando clientes...' : 'Selecciona cliente...'}</option>
                                            {clientesParaSelect.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className={labelCls}>Líder {reqStar}</label>
                                        <select
                                            required
                                            name="lider"
                                            value={formData.lider}
                                            onChange={handleChange}
                                            disabled={
                                                !puedeDiligenciarDetalle
                                                || !formData.cliente
                                                || (catalogLocks.lider && colaboradorVerificado)
                                            }
                                            className={`${inputCls} disabled:opacity-50`}
                                        >
                                            <option value="">{formData.cliente ? (loadingCatalogos ? 'Cargando líderes...' : 'Selecciona líder...') : 'Selecciona cliente primero'}</option>
                                            {lideresParaSelect.map((l) => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1 md:col-span-2">
                                        <label className={labelCls}>Tipo de Novedad {reqStar}</label>
                                        <select
                                            required
                                            name="tipo"
                                            value={formData.tipo}
                                            onChange={handleChange}
                                            disabled={!colaboradorVerificado}
                                            className={`${inputCls} ${!colaboradorVerificado ? 'disabled:opacity-70' : ''}`}
                                        >
                                            <option value="">Selecciona...</option>
                                            {NOVEDAD_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                                        </select>
                                    </div>
                                    {requiereMontoCop && (
                                        <div className="flex flex-col gap-1 md:col-span-2 animate-in fade-in duration-300">
                                            <label className={labelCls}>
                                                Valor de disponibilidad (COP) {reqStar}
                                            </label>
                                            <input
                                                required={requiereMontoCop}
                                                name="montoBono"
                                                value={formData.montoBono}
                                                onChange={handleChange}
                                                onBlur={handleMontoBonoBlur}
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="$ 0"
                                                disabled={!detalleFormularioActivo}
                                                className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`}
                                            />
                                            <small className={theme.helperMutedPlain}>Miles con punto, decimales con coma (ej. $ 1.250.000,50). Al salir del campo se formatea.</small>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* ═══ Sección: Fechas / Horas ═══ */}
                            <section>
                                <h2 className={theme.sectionTitle}>
                                    <span className={theme.sectionBarFechas} />
                                    Fechas
                                </h2>

                                {usaBloqueHoras && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Inicio {reqStar}</label>
                                            <input required={usaBloqueHoras} name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" max={esIncapacidad ? todayIso : undefined} disabled={!detalleFormularioActivo} className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`} />
                                            {formData.fechaInicio && festivosSet.has(formData.fechaInicio) && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un festivo nacional</div>
                                            )}
                                            {formData.fechaInicio && !festivosSet.has(formData.fechaInicio) && new Date(formData.fechaInicio + 'T12:00:00Z').getUTCDay() === 0 && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un domingo</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Hora Inicio (24h) {reqStar}</label>
                                            <input
                                                required={usaBloqueHoras}
                                                name="horaInicio"
                                                value={formData.horaInicio}
                                                onChange={handleChange}
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="HH:mm"
                                                disabled={!detalleFormularioActivo}
                                                className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Fin {reqStar}</label>
                                            <input required={usaBloqueHoras} name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} disabled={!detalleFormularioActivo} className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`} />
                                            {formData.fechaFin && festivosSet.has(formData.fechaFin) && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un festivo nacional</div>
                                            )}
                                            {formData.fechaFin && !festivosSet.has(formData.fechaFin) && new Date(formData.fechaFin + 'T12:00:00Z').getUTCDay() === 0 && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un domingo</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Hora Fin (24h) {reqStar}</label>
                                            <input
                                                required={usaBloqueHoras}
                                                name="horaFin"
                                                value={formData.horaFin}
                                                onChange={handleChange}
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="HH:mm"
                                                disabled={!detalleFormularioActivo}
                                                className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Horas (automático)</label>
                                            <input name="cantidadHoras" value={horasCalculadas || ''} readOnly type="text" placeholder="0" className={`${inputCls} ${theme.inputReadonly}`} />
                                        </div>
                                        <div className={theme.hintLine}>
                                            Formato militar <strong className={theme.hintStrong}>HH:mm</strong> en reloj <strong className={theme.hintStrong}>America/Bogotá</strong> (civil Colombia). La fecha/hora fin debe ser mayor que la de inicio.
                                        </div>
                                        {(horaInicioFormatoInvalido || horaFinFormatoInvalido) && (
                                            <div className="md:col-span-2 text-sm text-[#ff6b6b] font-body">
                                                Formato de hora inválido. Usa formato 24H: HH:mm (ejemplo: 20:00).
                                            </div>
                                        )}
                                        {horaFinInvalida && (
                                            <div className="md:col-span-2 text-sm text-[#ff6b6b] font-body">
                                                La fecha/hora fin debe ser mayor que la fecha/hora inicio.
                                            </div>
                                        )}
                                        {isHoraExtra && colaboradorVerificado && heDomingoPreviewLoading && (
                                            <div className={theme.hintLine}>Validando política de Hora Extra en domingo…</div>
                                        )}
                                        {isHoraExtra && colaboradorVerificado && heDomingoPreview?.error && (
                                            <div className="md:col-span-2 text-sm text-[#ff6b6b] font-body">{heDomingoPreview.error}</div>
                                        )}
                                        {isHoraExtra && colaboradorVerificado && heDomingoPreview?.ok && heDomingoPreview.requiereEleccionCompensacion && (
                                            <div className={theme.heBlock}>
                                                <p className={theme.heText}>
                                                    Este es tu {heDomingoPreview.maxTier === 1 ? 'primer' : 'segundo'} domingo trabajado en el mes tienes derecho a indicar si deseas un <strong className={theme.heStrong}>compensatorio en tiempo</strong> o un <strong className={theme.heStrong}>compensatorio en dinero</strong>.
                                                </p>
                                                <div className="flex flex-col gap-2">
                                                    <label className={theme.radioLabel}>
                                                        <input
                                                            type="radio"
                                                            name="heDomingoComp"
                                                            checked={heDomingoCompensacion === 'tiempo'}
                                                            disabled={!detalleFormularioActivo}
                                                            onChange={() => {
                                                                setHeDomingoCompensacion('tiempo');
                                                                setDiaCompensatorioYmd('');
                                                            }}
                                                        />
                                                        Compensatorio en tiempo
                                                    </label>
                                                    <label className={theme.radioLabel}>
                                                        <input
                                                            type="radio"
                                                            name="heDomingoComp"
                                                            checked={heDomingoCompensacion === 'dinero'}
                                                            disabled={!detalleFormularioActivo}
                                                            onChange={() => {
                                                                setHeDomingoCompensacion('dinero');
                                                                setDiaCompensatorioYmd('');
                                                            }}
                                                        />
                                                        Compensatorio en dinero
                                                    </label>
                                                </div>
                                                {heDomingoCompensacion === 'tiempo'
                                                    && heDomingoPreview.compensatorioTiempoMinYmd
                                                    && heDomingoPreview.compensatorioTiempoMaxYmd && (
                                                    <div className="flex flex-col gap-1 pt-1 max-w-xs">
                                                        <label className={theme.helperMutedPlain} htmlFor="diaCompensatorioHe">
                                                            Día compensatorio (calendario; solo entre {heDomingoPreview.compensatorioTiempoMinYmd} y {heDomingoPreview.compensatorioTiempoMaxYmd})
                                                        </label>
                                                        <input
                                                            id="diaCompensatorioHe"
                                                            type="date"
                                                            required={heDomingoCompensacion === 'tiempo'}
                                                            min={heDomingoPreview.compensatorioTiempoMinYmd}
                                                            max={heDomingoPreview.compensatorioTiempoMaxYmd}
                                                            value={diaCompensatorioYmd}
                                                            onChange={(e) => setDiaCompensatorioYmd(e.target.value)}
                                                            disabled={!detalleFormularioActivo}
                                                            className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`}
                                                        />
                                                    </div>
                                                )}
                                                {heDomingoPreview.domingoTrabajadoYmd ? (
                                                    <p className={theme.helperMutedPlain}>
                                                        Domingo trabajado reportado (referencia): <strong className={theme.hintStrong}>{heDomingoPreview.domingoTrabajadoYmd}</strong>
                                                    </p>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!usaBloqueHoras && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Inicio {reqStar}</label>
                                            <input required name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" max={esIncapacidad ? todayIso : undefined} disabled={!detalleFormularioActivo} className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`} />
                                            {formData.fechaInicio && festivosSet.has(formData.fechaInicio) && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un festivo nacional</div>
                                            )}
                                            {formData.fechaInicio && !festivosSet.has(formData.fechaInicio) && new Date(formData.fechaInicio + 'T12:00:00Z').getUTCDay() === 0 && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un domingo</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Fin {autocalculaDiasDesdeRango && reqStar}</label>
                                            <input required={autocalculaDiasDesdeRango} name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} disabled={!detalleFormularioActivo} className={`${inputCls} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`} />
                                            {fechaFinInvalida && <small className="text-[#ff6b6b] text-xs font-body">La Fecha Fin no puede ser menor que la Fecha Inicio.</small>}
                                            {formData.fechaFin && festivosSet.has(formData.fechaFin) && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un festivo nacional</div>
                                            )}
                                            {formData.fechaFin && !festivosSet.has(formData.fechaFin) && new Date(formData.fechaFin + 'T12:00:00Z').getUTCDay() === 0 && (
                                                <div className="text-xs text-rose-500 font-bold mt-1">⚠️ Es un domingo</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {esDisponibilidad && detalleFormularioActivo && (
                                    <div className="flex flex-col gap-1 mt-4 max-w-xs">
                                        <label className={labelCls}>Días hábiles en el rango (referencia)</label>
                                        <input
                                            readOnly
                                            type="text"
                                            value={diasInformativosDisponibilidad > 0 ? `${diasInformativosDisponibilidad} día(s)` : '—'}
                                            className={`${inputCls} ${theme.inputReadonly}`}
                                        />
                                        <small className={theme.helperMutedPlain}>Solo informativo; el valor enviado al sistema es el monto en pesos.</small>
                                    </div>
                                )}

                                {requiereDias && (
                                    <div className="flex flex-col gap-1 mt-4 max-w-xs">
                                        <label className={labelCls}>Días solicitados {reqStar}</label>
                                        <input required={requiereDias} min="1" name="diasSolicitados" value={autocalculaDiasDesdeRango ? diasAutoCalculados : formData.diasSolicitados} onChange={handleChange} readOnly={autocalculaDiasDesdeRango} type="number" placeholder="Ej: 2" disabled={!detalleFormularioActivo} className={`${inputCls} ${theme.inputReadonly} ${!detalleFormularioActivo ? 'disabled:opacity-70' : ''}`} />
                                        {autocalculaDiasCalendario && (
                                            <small className={theme.helperMutedPlain}>Calculado automáticamente (días calendario, incluye fines de semana).</small>
                                        )}
                                        {autocalculaDiasHabiles && !autocalculaDiasCalendario && (
                                            <small className={theme.helperMutedPlain}>Calculado automáticamente (lun-vie).</small>
                                        )}
                                    </div>
                                )}
                            </section>

                            {/* ═══ Sección: Soportes / Adjuntos (no aplica a Disponibilidad) ═══ */}
                            {!esSinAdjuntosPublicos && (
                            <section>
                                <h2 className={theme.sectionTitle}>
                                    <span className={theme.sectionBar} />
                                    Soportes / Adjuntos {(requiereAdjunto || requierePlantillaExcel) && reqStar}
                                </h2>

                                <input
                                    multiple
                                    type="file"
                                    id="soportes"
                                    accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />

                                <label
                                    htmlFor="soportes"
                                    onDragOver={(e) => { if (!detalleFormularioActivo) return; e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    className={`${theme.fileDropBase} ${!detalleFormularioActivo ? theme.fileDropDisabled : `cursor-pointer ${dragOver ? theme.fileDropDrag : theme.fileDropIdle}`}`}
                                >
                                    <svg className={theme.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                                    <span className={theme.uploadHint}>Arrastra archivos aquí o <span className={theme.uploadHintAccent}>haz clic para seleccionar</span></span>
                                    <div className="flex gap-2 flex-wrap justify-center">
                                        {['PDF', 'JPG', 'PNG', 'XLS', 'XLSX'].map((ext) => (
                                            <span key={ext} className={theme.chipExt}>{ext}</span>
                                        ))}
                                    </div>
                                    <span className={`text-[10px] font-body ${theme.helperMutedPlain}`}>Máx. 5 MB por archivo</span>
                                </label>

                                {selectedFiles.length > 0 && (
                                    <div className="mt-3 flex flex-col gap-2">
                                        {selectedFiles.map((file, idx) => (
                                            <div key={`${file.name}-${file.size}`} className={theme.fileRow}>
                                                <span className={theme.fileIconBg}>{fileIcon(file.name)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className={theme.fileName}>{file.name}</p>
                                                    <p className={theme.fileSize}>{(file.size / 1024).toFixed(0)} KB</p>
                                                </div>
                                                <button type="button" onClick={() => removeFile(idx)} disabled={!detalleFormularioActivo} className="text-[#ff6b6b] hover:text-[#ff4040] text-lg leading-none px-1 disabled:opacity-40">&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!!rule.formatLinks?.length && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {rule.formatLinks.map((fmt) => (
                                            <a key={fmt.href} href={fmt.href} download className={theme.formatLink}>
                                                Descargar: {fmt.label}
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {requierePlantillaExcel && (
                                    <p className={theme.excelNote}>
                                        Puedes subir PDF u otros adjuntos en el orden que prefieras; al enviar debe haber al menos un Excel (.xls o .xlsx) con el formato diligenciado.
                                    </p>
                                )}
                                {requiereAdjunto && (
                                    <p className={`${theme.helperMutedPlain} mt-2`}>Documentos obligatorios: {requiredDocuments.join(' | ')}.</p>
                                )}
                            </section>
                            )}

                            {/* ═══ Consentimiento datos personales ═══ */}
                            <div className={theme.consentBox}>
                                <div className="flex items-start gap-3">
                                    <input
                                        id="acepta-politica-datos"
                                        type="checkbox"
                                        checked={aceptaPoliticaDatos}
                                        onChange={(e) => setAceptaPoliticaDatos(e.target.checked)}
                                        className="mt-1 h-4 w-4 shrink-0 rounded border-[#2F7BB8] text-[#2F7BB8] focus:ring-[#65BCF7]"
                                    />
                                    <label htmlFor="acepta-politica-datos" className={theme.consentLabel}>
                                        Declaro haber leído y acepto el tratamiento de mis datos personales de acuerdo con la política de Grupo CINTE.
                                    </label>
                                </div>
                                <p className={theme.politicaMuted}>
                                    <a
                                        href={URL_POLITICA_DATOS_PERSONALES}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={theme.consentLink}
                                    >
                                        Ver política de tratamiento y protección de datos personales
                                    </a>
                                </p>
                            </div>

                            {/* ═══ Botón Enviar ═══ */}
                            <button
                                disabled={isSubmitting || bloqueHeDomingoComp || !colaboradorVerificado || !aceptaPoliticaDatos}
                                type="submit"
                                className="w-full py-4 px-6 rounded-xl font-heading font-bold text-base text-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 bg-gradient-to-r from-[#004D87] to-[#2F7BB8] hover:from-[#004D87] hover:to-[#088DC6]"
                            >
                                {isSubmitting ? 'Procesando...' : 'Enviar Solicitud'}
                            </button>

                            {status.text && (
                                <div className={`text-center font-semibold text-base font-body transition-all ${status.type === 'success' ? 'text-[#1fc76a]' : status.type === 'error' ? 'text-[#ff6b6b]' : 'text-[#f39c12] animate-pulse'}`}>
                                    {status.text}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
