import { useEffect, useMemo, useState } from 'react';
import { NOVEDAD_TYPES, getNovedadRule } from './novedadRules';
import { parseMontoCOPInput, formatMontoCOPLocale } from './copMoneyFormat';

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

const MSG_EXCEL_PLANTILLA = '❌ Este tipo de novedad requiere al menos un archivo Excel (.xls o .xlsx) con el formato diligenciado.';

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [lideres, setLideres] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(false);
    const [colaboradorVerificado, setColaboradorVerificado] = useState(false);
    const [verificandoCedula, setVerificandoCedula] = useState(false);

    const normalizeCedulaInput = (value) => String(value || '').replace(/\D/g, '');

    const isHoraExtra = formData.tipo === 'Hora Extra';
    const rule = useMemo(() => getNovedadRule(formData.tipo), [formData.tipo]);
    const requiredDocuments = rule.requiredDocuments || [];
    const requiredDocsCount = requiredDocuments.length;
    const requiereAdjunto = requiredDocsCount > 0;
    const minSupportsRequired = requiereAdjunto ? requiredDocsCount : 0;
    const requierePlantillaExcel = Array.isArray(rule.formatLinks) && rule.formatLinks.length > 0;
    const requiereDias = Boolean(rule.requiresDayCount);
    const autocalculaDiasHabiles = Boolean(rule.autoBusinessDays);
    const esVacacionesDinero = formData.tipo === 'Vacaciones en dinero';
    const esBonos = formData.tipo === 'Bonos';
    const esIncapacidad = formData.tipo === 'Incapacidad';
    const requiereLapsoHora = Boolean(rule.requiresTimeRange);
    const usaBloqueHoras = isHoraExtra || requiereLapsoHora;

    const parseMilitaryTimeToMinutes = (value) => {
        if (!value) return null;
        const clean = String(value).trim();
        const match = clean.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return (hours * 60) + minutes;
    };

    const buildDateTimeMs = (dateValue, timeValue) => {
        if (!dateValue || !timeValue) return null;
        const d = new Date(`${dateValue}T${timeValue}:00`);
        if (Number.isNaN(d.getTime())) return null;
        return d.getTime();
    };

    const countBusinessDaysInclusive = (startDateRaw, endDateRaw) => {
        if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
        const start = new Date(`${startDateRaw}T00:00:00`);
        const end = new Date(`${endDateRaw}T00:00:00`);
        let count = 0;
        for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            const day = cursor.getDay();
            if (day !== 0 && day !== 6) count += 1;
        }
        return count;
    };

    const horasCalculadas = useMemo(() => {
        if (!usaBloqueHoras) return 0;
        const inicioMs = buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
        const finMs = buildDateTimeMs(formData.fechaFin, formData.horaFin);
        if (inicioMs === null || finMs === null || finMs <= inicioMs) return 0;
        return Number(((finMs - inicioMs) / (1000 * 60 * 60)).toFixed(2));
    }, [usaBloqueHoras, formData.fechaInicio, formData.fechaFin, formData.horaInicio, formData.horaFin]);

    const hourBreakdown = useMemo(() => {
        if (!isHoraExtra) return { diurnas: 0, nocturnas: 0, label: '' };
        const inicioMs = buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
        const finMs = buildDateTimeMs(formData.fechaFin, formData.horaFin);
        if (inicioMs === null || finMs === null || finMs <= inicioMs) return { diurnas: 0, nocturnas: 0, label: '' };

        let diurnasMin = 0;
        let nocturnasMin = 0;
        for (let tick = inicioMs; tick < finMs; tick += 60 * 1000) {
            const current = new Date(tick);
            const minuteOfDay = (current.getHours() * 60) + current.getMinutes();
            if (minuteOfDay >= 360 && minuteOfDay < 1140) {
                diurnasMin += 1;
            } else {
                nocturnasMin += 1;
            }
        }
        const diurnas = Number((diurnasMin / 60).toFixed(2));
        const nocturnas = Number((nocturnasMin / 60).toFixed(2));
        let label = '';
        if (diurnas > 0 && nocturnas > 0) label = 'Mixta';
        else if (diurnas > 0) label = 'Diurna';
        else if (nocturnas > 0) label = 'Nocturna';
        return { diurnas, nocturnas, label };
    }, [isHoraExtra, formData.fechaInicio, formData.fechaFin, formData.horaInicio, formData.horaFin]);

    const diasHabilesCalculados = useMemo(() => {
        if (!autocalculaDiasHabiles) return 0;
        return countBusinessDaysInclusive(formData.fechaInicio, formData.fechaFin);
    }, [autocalculaDiasHabiles, formData.fechaInicio, formData.fechaFin]);

    const opcionesHoraMilitar = useMemo(() => {
        const opciones = [];
        for (let hora = 0; hora < 24; hora += 1) {
            for (let minuto = 0; minuto < 60; minuto += 15) {
                const h = String(hora).padStart(2, '0');
                const m = String(minuto).padStart(2, '0');
                opciones.push(`${h}:${m}`);
            }
        }
        return opciones;
    }, []);

    const opcionesHoraFin = useMemo(() => {
        const inicio = parseMilitaryTimeToMinutes(formData.horaInicio);
        if (inicio === null) return opcionesHoraMilitar;
        const fechaInicio = String(formData.fechaInicio || '');
        const fechaFin = String(formData.fechaFin || '');
        if (fechaInicio && fechaFin && fechaFin > fechaInicio) return opcionesHoraMilitar;
        return opcionesHoraMilitar.filter((hora) => parseMilitaryTimeToMinutes(hora) > inicio);
    }, [formData.horaInicio, formData.fechaInicio, formData.fechaFin, opcionesHoraMilitar]);

    const horaFinInvalida = usaBloqueHoras
        && formData.fechaInicio
        && formData.fechaFin
        && formData.horaInicio
        && formData.horaFin
        && buildDateTimeMs(formData.fechaFin, formData.horaFin) <= buildDateTimeMs(formData.fechaInicio, formData.horaInicio);

    const fechaFinInvalida = !usaBloqueHoras
        && formData.fechaInicio
        && formData.fechaFin
        && formData.fechaFin < formData.fechaInicio;

    const bloqueoEnvioHoraExtra = usaBloqueHoras
        && (!formData.fechaInicio || !formData.fechaFin || !formData.horaInicio || !formData.horaFin || horaFinInvalida);

    const bloqueoEnvioFechas = !usaBloqueHoras
        && (!formData.fechaInicio || fechaFinInvalida);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'cedula') {
            const digits = normalizeCedulaInput(value);
            setColaboradorVerificado(false);
            setFormData({ ...formData, cedula: digits, nombre: '' });
            return;
        }
        if (name === 'cliente') {
            setFormData({ ...formData, cliente: value, lider: '' });
            return;
        }
        if (name === 'horaInicio') {
            const nuevaHoraInicio = parseMilitaryTimeToMinutes(value);
            const horaFinActual = parseMilitaryTimeToMinutes(formData.horaFin);
            const mismoDia = String(formData.fechaInicio || '') === String(formData.fechaFin || '');
            const resetHoraFin = mismoDia && horaFinActual !== null && nuevaHoraInicio !== null && horaFinActual <= nuevaHoraInicio;
            setFormData({ ...formData, horaInicio: value, horaFin: resetHoraFin ? '' : formData.horaFin });
            return;
        }
        if (name === 'fechaInicio') {
            const resetFechaFin = formData.fechaFin && formData.fechaFin < value;
            const nextFechaFin = resetFechaFin ? '' : formData.fechaFin;
            const nextDias = autocalculaDiasHabiles ? String(countBusinessDaysInclusive(value, nextFechaFin)) : formData.diasSolicitados;
            setFormData({ ...formData, fechaInicio: value, fechaFin: nextFechaFin, diasSolicitados: nextDias });
            return;
        }
        if (name === 'fechaFin') {
            const nextDias = autocalculaDiasHabiles ? String(countBusinessDaysInclusive(formData.fechaInicio, value)) : formData.diasSolicitados;
            setFormData({ ...formData, fechaFin: value, diasSolicitados: nextDias });
            return;
        }
        if (name === 'tipo') {
            const nextRule = getNovedadRule(value);
            const nextRequiereDias = Boolean(nextRule.requiresDayCount);
            const nextAutoDias = Boolean(nextRule.autoBusinessDays);
            const nextDias = nextAutoDias
                ? String(countBusinessDaysInclusive(formData.fechaInicio, formData.fechaFin))
                : (nextRequiereDias ? formData.diasSolicitados : '');
            setFormData({
                ...formData,
                tipo: value,
                diasSolicitados: nextDias,
                montoBono: value === 'Bonos' ? '$ ' : '$ '
            });
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
            setStatus({ type: 'error', text: '❌ Ingresa una cédula (solo números, sin puntos ni comas).' });
            return;
        }
        setVerificandoCedula(true);
        setStatus({ type: '', text: '' });
        try {
            const res = await fetch(`/api/catalogos/colaborador?cedula=${encodeURIComponent(c)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Cédula no registrada');
            }
            setFormData((prev) => ({ ...prev, cedula: data.cedula || c, nombre: data.nombre || '' }));
            setColaboradorVerificado(true);
            setStatus({ type: 'success', text: '✅ Colaborador verificado.' });
        } catch (err) {
            setColaboradorVerificado(false);
            setFormData((prev) => ({ ...prev, nombre: '' }));
            setStatus({ type: 'error', text: `❌ ${err?.message || 'No se pudo verificar la cédula.'}` });
        } finally {
            setVerificandoCedula(false);
        }
    };

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
        if (!autocalculaDiasHabiles) return;
        const next = String(diasHabilesCalculados);
        if (formData.diasSolicitados !== next) {
            setFormData((prev) => ({ ...prev, diasSolicitados: next }));
        }
    }, [autocalculaDiasHabiles, diasHabilesCalculados, formData.diasSolicitados]);

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

        if (bloqueoEnvioHoraExtra || bloqueoEnvioFechas) {
            const mensaje = isHoraExtra
                ? '❌ Corrige fecha/horas de Hora Extra antes de enviar.'
                : '❌ Corrige las fechas (Fecha Fin no puede ser menor a Fecha Inicio).';
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


        if (requiereAdjunto && selectedFiles.length < requiredDocsCount) {
            setStatus({
                type: 'error',
                text: `❌ Debes adjuntar todos los documentos requeridos: ${requiredDocuments.join(', ')}.`
            });
            return;
        }


        if (requierePlantillaExcel) {
            if (selectedFiles.length === 0) {
                setStatus({ type: 'error', text: '❌ Debes adjuntar el formato Excel diligenciado (.xls o .xlsx).' });
                return;
            }
            if (!selectedFiles.some(isExcelAttachment)) {
                setStatus({ type: 'error', text: MSG_EXCEL_PLANTILLA });
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

        if (autocalculaDiasHabiles && !(diasHabilesCalculados > 0)) {
            setStatus({ type: 'error', text: '❌ El rango seleccionado no contiene dias hábiles (lunes a viernes).' });
            return;
        }

        if (requiereDias && !autocalculaDiasHabiles && !esVacacionesDinero && !(Number(formData.diasSolicitados) > 0)) {
            setStatus({ type: 'error', text: '❌ Debes diligenciar una cantidad de dias valida.' });
            return;
        }

        if (esVacacionesDinero && !formData.fechaFin) {
            setStatus({ type: 'error', text: '❌ Vacaciones en dinero requiere Fecha Fin.' });
            return;
        }

        if (usaBloqueHoras) {
            const inicio = buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
            const fin = buildDateTimeMs(formData.fechaFin, formData.horaFin);

            if (!formData.fechaInicio || !formData.fechaFin || inicio === null || fin === null) {
                setStatus({ type: 'error', text: '❌ Este tipo requiere fecha inicio, fecha fin y lapso horario.' });
                return;
            }
            if (fin <= inicio) {
                setStatus({ type: 'error', text: '❌ La fecha/hora fin debe ser mayor que la fecha/hora inicio.' });
                return;
            }
        }

        if (esBonos) {
            const monto = parseMontoCOPInput(formData.montoBono);
            if (monto == null || monto <= 0) {
                setStatus({ type: 'error', text: '❌ Bonos requiere un valor en pesos mayor a cero (ej. $ 1.500.000 o 1500000,50).' });
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

            if (usaBloqueHoras) {
                payload.append('fecha', formData.fechaInicio);
                payload.append('horaInicio', formData.horaInicio);
                payload.append('horaFin', formData.horaFin);
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin);
                payload.append('cantidadHoras', String(requiereLapsoHora ? horasCalculadas : horasCalculadas));
                payload.append('horasDiurnas', String(hourBreakdown.diurnas || 0));
                payload.append('horasNocturnas', String(hourBreakdown.nocturnas || 0));
                payload.append('tipoHoraExtra', hourBreakdown.label || '');
            } else {
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin || 'N/A');
                const diasValue = autocalculaDiasHabiles ? diasHabilesCalculados : Number(formData.diasSolicitados || 0);
                payload.append('cantidadHoras', requiereDias ? diasValue : (formData.cantidadHoras || 0));
            }
            if (esBonos) {
                const monto = parseMontoCOPInput(formData.montoBono);
                payload.append('montoCop', String(monto != null ? monto : 0));
            }

            for (const file of selectedFiles) {
                payload.append('soportes', file);
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
                setSelectedFiles([]);
                setLideres([]);
                // Limpiar mensaje de éxito después de unos segundos
                setTimeout(() => setStatus({ type: '', text: '' }), 4000);
            } else {
                throw new Error(data?.error || data?.message || 'Error al enviar la solicitud');
            }
        } catch (error) {
            console.error(error);
            setStatus({ type: 'error', text: `❌ ${error?.message || 'Error al enviar la solicitud'}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    const [dragOver, setDragOver] = useState(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
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

    const inputCls = 'w-full bg-[#0b1e30]/80 border border-[#1a3a56] text-white p-3 rounded-xl font-body text-sm focus:outline-none focus:border-[#65BCF7] focus:ring-2 focus:ring-[#65BCF7]/20 transition-all placeholder-[#3c5d7a] [color-scheme:dark]';
    const labelCls = 'text-sm font-medium text-[#9fb3c8] font-body';
    const reqStar = <span className="text-[#65BCF7]">*</span>;

    return (
        <div
            className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
            style={{ backgroundImage: `linear-gradient(135deg, rgba(4,20,30,0.92) 0%, rgba(0,77,135,0.7) 100%), url('/img/bg-portal.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' }}
        >
            <div className="absolute inset-0 bg-[#04141E]/40 backdrop-blur-[2px]" />

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
                <div className="flex-1 lg:rounded-r-3xl lg:rounded-l-none rounded-none bg-[#04141E]/85 backdrop-blur-xl border border-[#1a3a56]/50 lg:border-l-0 overflow-y-auto max-h-screen lg:max-h-[92vh]">
                    <div className="p-6 md:p-10">

                        {/* Header mobile */}
                        <div className="flex lg:hidden items-center gap-3 mb-6">
                            <img src="/assets/logo-cinte-header.png" alt="CINTE" className="w-10" />
                            <h1 className="font-heading text-lg font-bold text-white tracking-wide">PORTAL DE RADICACIÓN DE NOVEDADES</h1>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8">

                            {/* ═══ Sección: Solicitante ═══ */}
                            <section>
                                <h2 className="font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-[#65BCF7] rounded-full inline-block" />
                                    Solicitante
                                </h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelCls}>Cédula {reqStar}</label>
                                        <p className="text-xs text-[#4a6f8f] mb-1.5 font-body">Solo números, sin puntos ni comas.</p>
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

                                    {colaboradorVerificado && formData.nombre && (
                                        <div className="flex items-center gap-4 p-4 rounded-xl bg-[#0b1e30]/60 border border-[#1a3a56]">
                                            <div className="w-12 h-12 rounded-full bg-[#2F7BB8] flex items-center justify-center text-white font-heading font-bold text-lg shrink-0">
                                                {(formData.nombre || '').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-white font-body font-semibold text-sm">{formData.nombre}</p>
                                                <p className="text-[#9fb3c8] font-body text-xs">CC {formData.cedula}</p>
                                            </div>
                                            <span className="ml-auto text-xs font-body font-semibold text-[#1fc76a] bg-[#1fc76a]/10 px-2 py-1 rounded-lg">Verificado</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className={labelCls}>Nombre y Apellido {reqStar}</label>
                                        <input
                                            readOnly
                                            name="nombre"
                                            value={formData.nombre}
                                            type="text"
                                            placeholder={colaboradorVerificado ? '' : 'Se completará al comprobar la cédula'}
                                            className={`${inputCls} read-only:bg-[#04141E]/60 read-only:cursor-not-allowed`}
                                        />
                                    </div>

                                    <div>
                                        <label className={labelCls}>Correo del Solicitante</label>
                                        <input name="correo" value={formData.correo} onChange={handleChange} type="email" placeholder="usuario@dominio.com" className={inputCls} />
                                    </div>
                                </div>
                            </section>

                            {/* ═══ Sección: Detalles ═══ */}
                            <section>
                                <h2 className="font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-[#088DC6] rounded-full inline-block" />
                                    Detalles
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1">
                                        <label className={labelCls}>Tipo de Novedad {reqStar}</label>
                                        <select required name="tipo" value={formData.tipo} onChange={handleChange} className={inputCls}>
                                            <option value="">Selecciona...</option>
                                            {NOVEDAD_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className={labelCls}>Cliente {reqStar}</label>
                                        <select required name="cliente" value={formData.cliente} onChange={handleChange} className={inputCls}>
                                            <option value="">{loadingCatalogos ? 'Cargando clientes...' : 'Selecciona cliente...'}</option>
                                            {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1 md:col-span-2">
                                        <label className={labelCls}>Líder {reqStar}</label>
                                        <select required name="lider" value={formData.lider} onChange={handleChange} disabled={!formData.cliente} className={`${inputCls} disabled:opacity-50`}>
                                            <option value="">{formData.cliente ? (loadingCatalogos ? 'Cargando líderes...' : 'Selecciona líder...') : 'Selecciona cliente primero'}</option>
                                            {lideres.map((l) => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    {esBonos && (
                                        <div className="flex flex-col gap-1 md:col-span-2 animate-in fade-in duration-300">
                                            <label className={labelCls}>Valor del bono (COP) {reqStar}</label>
                                            <input
                                                required={esBonos}
                                                name="montoBono"
                                                value={formData.montoBono}
                                                onChange={handleChange}
                                                onBlur={handleMontoBonoBlur}
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="$ 0"
                                                className={inputCls}
                                            />
                                            <small className="text-xs text-[#4a6f8f] font-body">Miles con punto, decimales con coma (ej. $ 1.250.000,50). Al salir del campo se formatea.</small>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* ═══ Sección: Fechas / Horas ═══ */}
                            <section>
                                <h2 className="font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-[#2F7BB8] rounded-full inline-block" />
                                    Fechas
                                </h2>

                                {usaBloqueHoras && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Inicio {reqStar}</label>
                                            <input required={usaBloqueHoras} name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" max={esIncapacidad ? todayIso : undefined} className={inputCls} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Hora Inicio (24h) {reqStar}</label>
                                            <select required={usaBloqueHoras} name="horaInicio" value={formData.horaInicio} onChange={handleChange} className={inputCls}>
                                                <option value="">Selecciona hora inicio...</option>
                                                {opcionesHoraMilitar.map((h) => <option key={`i-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Fin {reqStar}</label>
                                            <input required={usaBloqueHoras} name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} className={inputCls} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Hora Fin (24h) {reqStar}</label>
                                            <select required={usaBloqueHoras} name="horaFin" value={formData.horaFin} onChange={handleChange} className={inputCls}>
                                                <option value="">Selecciona hora fin...</option>
                                                {opcionesHoraFin.map((h) => <option key={`f-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Horas (automático)</label>
                                            <input name="cantidadHoras" value={horasCalculadas || ''} readOnly type="text" placeholder="0" className={`${inputCls} read-only:bg-[#04141E]/60 read-only:text-[#9fb3c8]`} />
                                        </div>
                                        <div className="md:col-span-2 text-xs text-[#4a6f8f] font-body">
                                            Formato militar <strong className="text-[#9fb3c8]">HH:mm</strong>. La fecha/hora fin debe ser mayor que la de inicio.
                                        </div>
                                        {horaFinInvalida && (
                                            <div className="md:col-span-2 text-sm text-[#ff6b6b] font-body">
                                                La fecha/hora fin debe ser mayor que la fecha/hora inicio.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!usaBloqueHoras && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Inicio {reqStar}</label>
                                            <input required name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" max={esIncapacidad ? todayIso : undefined} className={inputCls} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className={labelCls}>Fecha Fin {(autocalculaDiasHabiles || esVacacionesDinero) && reqStar}</label>
                                            <input required={autocalculaDiasHabiles || esVacacionesDinero} name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} className={inputCls} />
                                            {fechaFinInvalida && <small className="text-[#ff6b6b] text-xs font-body">La Fecha Fin no puede ser menor que la Fecha Inicio.</small>}
                                        </div>
                                    </div>
                                )}

                                {requiereDias && !esVacacionesDinero && (
                                    <div className="flex flex-col gap-1 mt-4 max-w-xs">
                                        <label className={labelCls}>Días solicitados {reqStar}</label>
                                        <input required={requiereDias} min="1" name="diasSolicitados" value={autocalculaDiasHabiles ? diasHabilesCalculados : formData.diasSolicitados} onChange={handleChange} readOnly={autocalculaDiasHabiles} type="number" placeholder="Ej: 2" className={`${inputCls} read-only:bg-[#04141E]/60 read-only:text-[#9fb3c8]`} />
                                        {autocalculaDiasHabiles && <small className="text-xs text-[#4a6f8f] font-body">Calculado automáticamente (lun-vie).</small>}
                                    </div>
                                )}
                            </section>

                            {/* ═══ Sección: Soportes / Adjuntos ═══ */}
                            <section>
                                <h2 className="font-subtitle text-lg font-extralight text-[#65BCF7] tracking-wide mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-[#65BCF7] rounded-full inline-block" />
                                    Soportes / Adjuntos {(requiereAdjunto || requierePlantillaExcel) && reqStar}
                                </h2>

                                <input multiple type="file" id="soportes" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx" onChange={handleFileChange} className="hidden" />

                                <label
                                    htmlFor="soportes"
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${dragOver ? 'border-[#65BCF7] bg-[#65BCF7]/10' : 'border-[#1a3a56] hover:border-[#2F7BB8] bg-[#0b1e30]/40'}`}
                                >
                                    <svg className="w-10 h-10 text-[#4a6f8f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                                    <span className="text-sm text-[#9fb3c8] font-body">Arrastra archivos aquí o <span className="text-[#65BCF7] font-semibold">haz clic para seleccionar</span></span>
                                    <div className="flex gap-2 flex-wrap justify-center">
                                        {['PDF', 'JPG', 'PNG', 'XLS', 'XLSX'].map((ext) => (
                                            <span key={ext} className="px-2 py-0.5 rounded text-[10px] font-bold font-body bg-[#1a3a56]/60 text-[#65BCF7]">{ext}</span>
                                        ))}
                                    </div>
                                    <span className="text-[10px] text-[#4a6f8f] font-body">Máx. 5 MB por archivo</span>
                                </label>

                                {selectedFiles.length > 0 && (
                                    <div className="mt-3 flex flex-col gap-2">
                                        {selectedFiles.map((file, idx) => (
                                            <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0b1e30]/50 border border-[#1a3a56]">
                                                <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#2F7BB8]/20 text-[#65BCF7] text-[10px] font-bold font-body shrink-0">{fileIcon(file.name)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-white font-body truncate">{file.name}</p>
                                                    <p className="text-[10px] text-[#4a6f8f] font-body">{(file.size / 1024).toFixed(0)} KB</p>
                                                </div>
                                                <button type="button" onClick={() => removeFile(idx)} className="text-[#ff6b6b] hover:text-[#ff4040] text-lg leading-none px-1">&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!!rule.formatLinks?.length && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {rule.formatLinks.map((fmt) => (
                                            <a key={fmt.href} href={fmt.href} download className="inline-flex items-center px-3 py-1.5 text-xs font-semibold font-body rounded-lg border border-[#2F7BB8]/40 text-[#65BCF7] hover:bg-[#2F7BB8]/10 transition-all">
                                                Descargar: {fmt.label}
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {requierePlantillaExcel && (
                                    <p className="text-xs text-[#65BCF7]/90 mt-2 font-body">Puedes subir PDF u otros adjuntos en el orden que prefieras; al enviar debe haber al menos un Excel (.xls o .xlsx) con el formato diligenciado.</p>
                                )}
                                {requiereAdjunto && (
                                    <p className="text-xs text-[#4a6f8f] mt-2 font-body">Documentos obligatorios: {requiredDocuments.join(' | ')}.</p>
                                )}
                            </section>

                            {/* ═══ Botón Enviar ═══ */}
                            <button
                                disabled={isSubmitting}
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
