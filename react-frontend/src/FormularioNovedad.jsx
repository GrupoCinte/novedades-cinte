import { useEffect, useMemo, useState } from 'react';
import { NOVEDAD_TYPES, getNovedadRule } from './novedadRules';

const ALLOWED_ATTACHMENT_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.xls', '.xlsx']);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function FormularioNovedad() {
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
        tipoJornada: 'Diurna',
        fechaInicio: '',
        fechaFin: '',
        diasSolicitados: ''
    });

    const [status, setStatus] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [lideres, setLideres] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(false);

    const isHoraExtra = formData.tipo === 'Hora Extra';
    const rule = useMemo(() => getNovedadRule(formData.tipo), [formData.tipo]);
    const requiredDocuments = rule.requiredDocuments || [];
    const requiredDocsCount = requiredDocuments.length;
    const requiereAdjunto = requiredDocsCount > 0;
    const minSupportsRequired = requiereAdjunto ? 1 : 0;
    const requiereDias = Boolean(rule.requiresDayCount);
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

    const horasCalculadas = useMemo(() => {
        if (!usaBloqueHoras) return 0;
        const inicioMs = buildDateTimeMs(formData.fechaInicio, formData.horaInicio);
        const finMs = buildDateTimeMs(formData.fechaFin, formData.horaFin);
        if (inicioMs === null || finMs === null || finMs <= inicioMs) return 0;
        return Number(((finMs - inicioMs) / (1000 * 60 * 60)).toFixed(2));
    }, [usaBloqueHoras, formData.fechaInicio, formData.fechaFin, formData.horaInicio, formData.horaFin]);

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
            setFormData({ ...formData, fechaInicio: value, fechaFin: resetFechaFin ? '' : formData.fechaFin });
            return;
        }
        setFormData({ ...formData, [name]: value });
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

        if (requiereAdjunto && selectedFiles.length < minSupportsRequired) {
            setStatus({
                type: 'error',
                text: `❌ Debes adjuntar al menos ${minSupportsRequired} soporte(s) para ${formData.tipo}.`
            });
            return;
        }
        for (const file of selectedFiles) {
            const attachmentError = getAttachmentError(file);
            if (attachmentError) {
                setStatus({ type: 'error', text: attachmentError });
                return;
            }
        }

        if (requiereDias && !(Number(formData.diasSolicitados) > 0)) {
            setStatus({ type: 'error', text: '❌ Debes diligenciar una cantidad de dias valida.' });
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
            payload.append('tipoHoraExtra', formData.tipoJornada);

            if (usaBloqueHoras) {
                payload.append('fecha', formData.fechaInicio);
                payload.append('horaInicio', formData.horaInicio);
                payload.append('horaFin', formData.horaFin);
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin);
                payload.append('cantidadHoras', String(requiereLapsoHora ? horasCalculadas : horasCalculadas));
            } else {
                payload.append('fechaInicio', formData.fechaInicio);
                payload.append('fechaFin', formData.fechaFin || 'N/A');
                payload.append('cantidadHoras', requiereDias ? (formData.diasSolicitados || 0) : (formData.cantidadHoras || 0));
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
                    tipoJornada: 'Diurna',
                    fechaInicio: '',
                    fechaFin: '',
                    diasSolicitados: ''
                });
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

    return (
        <div className="relative flex justify-center w-full animate-in fade-in zoom-in duration-300 bg-[#0f2437]">

            <div className="relative w-full max-w-5xl">
                <div className="relative bg-[#163047]/72 border border-white/18 rounded-2xl p-8 md:p-12 w-full shadow-[0_14px_40px_rgba(2,12,35,0.45)] max-h-[85vh] overflow-y-auto overflow-x-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2a90ff] to-[#1fc76a]" />
                    <p className="text-[#9fb3c8] mb-8">Completa los datos para registrar tu novedad en el sistema.</p>

                    <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Nombre y Apellido <span className="text-[#1fc76a]">*</span></label>
                            <input required name="nombre" value={formData.nombre} onChange={handleChange} type="text" placeholder="Ej: Kevin Ovalle" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Cédula <span className="text-[#1fc76a]">*</span></label>
                            <input required name="cedula" value={formData.cedula} onChange={handleChange} type="number" placeholder="Documento de identidad" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Correo del Solicitante</label>
                            <input name="correo" value={formData.correo} onChange={handleChange} type="email" placeholder="usuario@dominio.com" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Tipo de Novedad <span className="text-[#1fc76a]">*</span></label>
                            <select required name="tipo" value={formData.tipo} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                <option value="">Selecciona...</option>
                                {NOVEDAD_TYPES.map((tipo) => (
                                    <option key={tipo} value={tipo}>{tipo}</option>
                                ))}
                                <option value="Hora Extra">Hora Extra</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Cliente <span className="text-[#1fc76a]">*</span></label>
                            <select required name="cliente" value={formData.cliente} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                <option value="">{loadingCatalogos ? 'Cargando clientes...' : 'Selecciona cliente...'}</option>
                                {clientes.map((cliente) => (
                                    <option key={cliente} value={cliente}>{cliente}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Líder <span className="text-[#1fc76a]">*</span></label>
                            <select required name="lider" value={formData.lider} onChange={handleChange} disabled={!formData.cliente} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all disabled:opacity-60">
                                <option value="">{formData.cliente ? (loadingCatalogos ? 'Cargando lideres...' : 'Selecciona lider...') : 'Selecciona cliente primero'}</option>
                                {lideres.map((lider) => (
                                    <option key={lider} value={lider}>{lider}</option>
                                ))}
                            </select>
                        </div>

                        {usaBloqueHoras && (
                            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Inicio <span className="text-[#1fc76a]">*</span></label>
                                    <input required={usaBloqueHoras} name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Hora Inicio (24h) <span className="text-[#1fc76a]">*</span></label>
                                    <select required={usaBloqueHoras} name="horaInicio" value={formData.horaInicio} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                        <option value="">Selecciona hora inicio...</option>
                                        {opcionesHoraMilitar.map((hora) => (
                                            <option key={`inicio-${hora}`} value={hora}>{hora}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Fin <span className="text-[#1fc76a]">*</span></label>
                                    <input required={usaBloqueHoras} name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Hora Fin (24h) <span className="text-[#1fc76a]">*</span></label>
                                    <select required={usaBloqueHoras} name="horaFin" value={formData.horaFin} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                        <option value="">Selecciona hora fin...</option>
                                        {opcionesHoraFin.map((hora) => (
                                            <option key={`fin-${hora}`} value={hora}>{hora}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Jornada</label>
                                    <select name="tipoJornada" value={formData.tipoJornada} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                        <option value="Diurna">Diurna</option>
                                        <option value="Nocturna">Nocturna</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Cantidad de Horas (Automático)</label>
                                    <input name="cantidadHoras" value={horasCalculadas || ''} readOnly type="text" placeholder="0" className="bg-[#0d1e2e] border border-[#21405f] text-[#9fb3c8] p-3 rounded-lg focus:outline-none transition-all" />
                                </div>
                                <div className="md:col-span-2 text-sm text-[#9fb3c8]">
                                    Usa selector en formato militar <strong>HH:mm</strong>. La fecha/hora fin debe ser mayor que la fecha/hora inicio.
                                </div>
                                {horaFinInvalida && (
                                    <div className="md:col-span-2 text-sm text-[#ff6b6b]">
                                        La fecha/hora fin debe ser mayor que la fecha/hora inicio.
                                    </div>
                                )}
                            </div>
                        )}

                        {!usaBloqueHoras && (
                            <>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Inicio <span className="text-[#1fc76a]">*</span></label>
                                    <input required name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Fin</label>
                                    <input name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" min={formData.fechaInicio || undefined} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                                    {fechaFinInvalida && (
                                        <small className="text-[#ff6b6b]">La Fecha Fin no puede ser menor que la Fecha Inicio.</small>
                                    )}
                                </div>
                            </>
                        )}
                        {requiereDias && (
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-[#9fb3c8]">Dias solicitados <span className="text-[#1fc76a]">*</span></label>
                                <input required={requiereDias} min="1" name="diasSolicitados" value={formData.diasSolicitados} onChange={handleChange} type="number" placeholder="Ej: 2" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]" />
                            </div>
                        )}

                        <div className="col-span-1 md:col-span-2 flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Soportes / Adjuntos (PDF, JPG, PNG, XLS, XLSX) - max 5MB por archivo {requiereAdjunto && <span className="text-[#1fc76a]">*</span>}</label>
                            <input multiple type="file" id="soportes" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx" onChange={handleFileChange} className="hidden" />
                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                                <label
                                    htmlFor="soportes"
                                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-[#2a90ff]/40 text-[#2a90ff] hover:bg-[#2a90ff]/10 transition-all cursor-pointer text-sm font-semibold"
                                >
                                    Seleccionar archivos
                                </label>
                                <span className="text-sm text-[#9fb3c8]">
                                    {selectedFiles.length > 0
                                        ? `${selectedFiles.length} archivo(s): ${selectedFiles.map((f) => f.name).join(', ')}`
                                        : 'Ningun archivo seleccionado'}
                                </span>
                            </div>
                            {!!rule.formatLinks?.length && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {rule.formatLinks.map((fmt) => (
                                        <a
                                            key={fmt.href}
                                            href={fmt.href}
                                            download
                                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#2a90ff]/40 text-[#2a90ff] hover:bg-[#2a90ff]/10 transition-all"
                                        >
                                            Descargar: {fmt.label}
                                        </a>
                                    ))}
                                </div>
                            )}
                            {requiereAdjunto && (
                                <small className="text-[#9fb3c8]">
                                    Documentos obligatorios: {requiredDocuments.join(' | ')}.
                                </small>
                            )}
                        </div>
                    </div>

                    <button disabled={isSubmitting} type="submit" className="w-full mt-8 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg hover:shadow-xl hover:shadow-[#2a90ff]/20">
                        {isSubmitting ? 'Procesando...' : 'Enviar Solicitud'}
                    </button>

                    {status.text && (
                        <div className={`mt-6 text-center font-semibold text-lg transition-all ${status.type === 'success' ? 'text-[#1fc76a]' : status.type === 'error' ? 'text-[#ff6b6b]' : 'text-[#f39c12] animate-pulse'}`}>
                            {status.text}
                        </div>
                    )}
                    </form>
                </div>
            </div>
        </div>
    );
}
