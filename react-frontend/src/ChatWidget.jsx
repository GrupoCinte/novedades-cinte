import { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, X, Send, ChevronDown, Sparkles } from 'lucide-react';
import { NOVEDAD_TYPES } from './novedadRules';

const TIPOS_LINEA = NOVEDAD_TYPES.map((t) => `• **${t}**`).join('\n');

function buildWelcomeText(ctx) {
    const lines = [
        '¡Hola! Soy **CINTEBot**, tu asistente sobre **novedades** en este portal.',
        'Puedo orientarte en **Inicio** (KPIs y filtros de período), **Gestión de Novedades** (tabla, detalle, exportación Excel), **Alertas de Hora Extra** y **Calendario**.',
        'El portal admite **tema claro u oscuro** (según el interruptor del módulo); este chat se muestra siempre en estilo oscuro.',
    ];
    if (ctx?.role === 'super_admin') {
        lines.push(
            'Con tu rol de **super administrador** también aplican el **filtro por GP** en listados y la acción **Eliminar** en el detalle de una novedad (con motivo obligatorio).'
        );
    }
    lines.push('Elige una tarjeta o escribe tu consulta:');
    return lines.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE — intenciones y respuestas
// ─────────────────────────────────────────────────────────────────────────────
const INTENTS = [
    {
        id: 'pendientes',
        label: '¿Cuántas novedades hay pendientes?',
        icon: '📋',
        category: 'estado',
        keywords: ['pendientes', 'pendiente', 'revisión', 'revisar', 'contar', 'cuántas', 'cuantas'],
        response: (ctx) =>
            ctx?.pendientesCount !== undefined
                ? `Actualmente hay **${ctx.pendientesCount} novedad(es) pendiente(s)** esperando revisión.\n\nRevísalas en **Gestión de Novedades** (menú lateral) y abre el **detalle** de cada fila para aprobar o rechazar.`
                : 'En el **Inicio** del Dashboard verás el KPI de pendientes; en **Gestión de Novedades** puedes filtrar por estado **Pendiente** para trabajar la cola.',
    },
    {
        id: 'aprobar',
        label: '¿Cómo apruebo una novedad?',
        icon: '✅',
        category: 'gestion',
        keywords: ['aprobar', 'aceptar', 'aprobado', 'autorizar', 'visto', 'bueno', 'modal', 'detalle'],
        response: () =>
            'Para **aprobar** una novedad:\n\n1. Entra a **Gestión de Novedades**.\n2. Localiza el registro en estado **Pendiente**.\n3. Abre el **detalle** (clic en la fila o en la acción de ver).\n4. En el modal **Detalle de novedad**, revisa datos, **Hora Extra** (si aplica), soportes y usa **Aceptar**.\n\nEl estado pasará a **Aprobado** y queda trazabilidad en el sistema.',
    },
    {
        id: 'rechazar',
        label: '¿Cómo rechazo una novedad?',
        icon: '❌',
        category: 'gestion',
        keywords: ['rechazar', 'rechazado', 'negar', 'denegar', 'modal', 'detalle'],
        response: () =>
            'Para **rechazar** una novedad:\n\n1. Ve a **Gestión de Novedades**.\n2. Abre el **Detalle de novedad** del registro pendiente.\n3. Pulsa **Rechazar** en el pie del modal.\n\nEl estado pasa a **Rechazado** y la acción queda registrada.',
    },
    {
        id: 'tipos',
        label: '¿Qué tipos de novedad existen?',
        icon: '📂',
        category: 'info',
        keywords: ['tipos', 'tipo', 'catalogo', 'catálogo', 'lista', 'novedades', 'clasificación'],
        response: () =>
            `Los **tipos** configurados en el formulario y filtros son (lista alineada al sistema):\n\n${TIPOS_LINEA}\n\nEn **Gestión** y **Calendario** puedes filtrar por **Tipo**; la lista exacta puede ampliarse según reglas de negocio.`,
    },
    {
        id: 'exportar',
        label: '¿Cómo exporto el reporte Excel?',
        icon: '📥',
        category: 'gestion',
        keywords: ['exportar', 'excel', 'xlsx', 'reporte', 'descargar', 'archivo', 'hoja'],
        response: () =>
            'Para **exportar a Excel**:\n\n1. Ve a **Gestión de Novedades**.\n2. Ajusta los **filtros** (tipo, estado, nombre, cliente, fechas de **creación**, etc.); el export respeta lo filtrado.\n3. Pulsa **Exportar Reporte Excel** (botón con icono de descarga).\n\nPara **Hora Extra**, el Excel incluye columnas enriquecidas (tipologías, franjas y compensación dominical cuando aplica).',
    },
    {
        id: 'filtros_inicio',
        label: '¿Filtros del Inicio del Dashboard?',
        icon: '🔍',
        category: 'proceso',
        keywords: ['inicio', 'dashboard', 'mes', 'día', 'dia', 'periodo', 'período', 'kpi', 'tendencia', 'top'],
        response: () =>
            'En el **Inicio** del Dashboard puedes acotar el período:\n\n• **Mes** y, si eliges mes, **Día** para ver un día concreto.\n• **Limpiar** restablece la vista.\n\nEso afecta gráficas como el **Monitor de Tendencia**, la **Distribución por tipología** y el **Top empleados**.',
    },
    {
        id: 'filtros_gestion',
        label: '¿Filtros en Gestión de Novedades?',
        icon: '🧰',
        category: 'gestion',
        keywords: ['filtros', 'filtrar', 'gestión', 'gestion', 'buscar', 'cliente', 'estado', 'creación', 'creado'],
        response: (ctx) => {
            const gp =
                ctx?.role === 'super_admin'
                    ? '\n• **Filtro por GP**: solo **super administrador**; restringe novedades según el **GP** asociado en catálogo (incluye opción de clientes **sin GP** en directorio).'
                    : '\n• El **filtro por GP** está disponible para perfiles con permiso de alcance global (p. ej. super administrador).';
            return `En **Gestión de Novedades** puedes combinar:${gp}\n\n• Tipo, estado, nombre, cliente.\n• **Fechas de creación** (desde / hasta).\n\nLos filtros aplican a la tabla, a **Alertas HE** y al **export Excel**.`;
        },
    },
    {
        id: 'alertas_he',
        label: '¿Qué son las Alertas de Hora Extra?',
        icon: '⏱️',
        category: 'gestion',
        keywords: ['alertas', 'alerta', 'hora', 'extra', 'tope', 'topes', 'exceso', 'mensual', 'diario'],
        response: () =>
            'La sección **Alertas HE** (en **Gestión**) detecta **excesos de topes** de Hora Extra (por día, mes u otras reglas configuradas).\n\n• Verás **tarjetas** con resumen del caso.\n• **Ver alerta** abre el detalle y permite enlazar la gestión con la **novedad** correspondiente.\n\nNo es lo mismo que el **Calendario**: el calendario muestra novedades por **fecha de inicio**; las alertas HE son un **panel de control** de cumplimiento.',
    },
    {
        id: 'eliminar_superadmin',
        label: '¿Eliminar una novedad? (super admin)',
        icon: '🗑️',
        category: 'gestion',
        keywords: ['eliminar', 'borrar', 'suprimir', 'motivo', 'super', 'administrador'],
        response: (ctx) => {
            if (ctx?.role === 'super_admin') {
                return 'Como **super administrador**, en el modal **Detalle de novedad** verás **Eliminar**.\n\n1. Pulsa **Eliminar**.\n2. Se abre un segundo modal: debes escribir un **motivo obligatorio**.\n3. **Confirmar** borra el registro de la base (el historial de estados asociado se elimina en cascada) y se deja **auditoría** del motivo.\n\nLa edición avanzada de campos por pantalla puede estar desactivada; para correcciones masivas consulta al equipo técnico.';
            }
            return '**Eliminar** una novedad desde la interfaz está reservado al rol **super administrador** (motivo obligatorio y confirmación). Si necesitas anular un error de captura, contacta a un super admin o al equipo de soporte.';
        },
    },
    {
        id: 'calendario',
        label: '¿Qué muestra el Calendario?',
        icon: '📅',
        category: 'info',
        keywords: ['calendario', 'mes', 'día', 'dia', 'agenda', 'vista'],
        response: () =>
            'El **Calendario operativo** agrupa novedades por **fecha de inicio**.\n\n• Cada día muestra la **cantidad** de registros.\n• Los colores distinguen tipos.\n• Al hacer clic en un día con datos se abre el **detalle del día** con las novedades listadas.\n\nNavega el mes con las flechas de la cabecera.',
    },
    {
        id: 'riesgo',
        label: '¿Qué es el Riesgo Operativo?',
        icon: '⚠️',
        category: 'info',
        keywords: ['riesgo', 'operativo', 'burnout', 'ausentismo', 'puntaje'],
        response: () =>
            'El **Índice de Riesgo Operativo** (Análisis avanzado) agrupa empleados por un **puntaje** derivado de patrones (p. ej. incapacidades u horas extra):\n\n• **Alto** (≥ 10), **Medio** (≥ 5), **Base** (< 5).\n\nSirve como señal temprana; la interpretación final es humana.',
    },
    {
        id: 'version',
        label: '¿Quién desarrolló este sistema?',
        icon: '🧠',
        category: 'info',
        keywords: ['desarrollo', 'desarrollador', 'cinte', 'versión', 'version', 'autor'],
        response: () =>
            'Diseño y desarrollo: **Luis Miguel Correa** (*Arquitecto de datos*).\n\n**Sistema de Análisis de Novedades — Grupo CINTE V2.1** (portal con gestión, alertas HE, exportaciones y módulos administrativos).\n\n¿Algo más sobre el uso del panel?',
    },
];

const CATEGORIES = [
    { id: 'todos', label: 'Todos' },
    { id: 'estado', label: '📊 Estado' },
    { id: 'gestion', label: '📑 Gestión' },
    { id: 'proceso', label: '⚙️ Proceso' },
    { id: 'info', label: 'ℹ️ Info' },
];

function matchIntentByFreeText(lower) {
    const tryShort = [
        ['gp', 'filtros_gestion'],
        ['excel', 'exportar'],
        ['xlsx', 'exportar'],
        ['alerta', 'alertas_he'],
        ['tope', 'alertas_he'],
        ['exceso', 'alertas_he'],
    ];
    for (const [needle, id] of tryShort) {
        if (lower.includes(needle)) {
            const hit = INTENTS.find((i) => i.id === id);
            if (hit) return hit;
        }
    }
    for (const intent of INTENTS) {
        const bag = new Set(
            [
                ...(intent.keywords || []),
                ...intent.label
                    .toLowerCase()
                    .split(/[\s?¿,]+/)
                    .filter((w) => w.length > 2),
            ].map((w) => w.toLowerCase())
        );
        for (const kw of bag) {
            if (kw.length >= 3 && lower.includes(kw)) return intent;
        }
    }
    return null;
}

// Formatea texto con **negrita** y saltos de línea
function FormatText({ text }) {
    const lines = text.split('\n');
    return (
        <span>
            {lines.map((line, i) => {
                const parts = line.split(/\*\*(.*?)\*\*/g);
                return (
                    <span key={i}>
                        {parts.map((part, j) =>
                            j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
                        )}
                        {i < lines.length - 1 && <br />}
                    </span>
                );
            })}
        </span>
    );
}

// Indicador de escritura
function TypingDots() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-2 w-2 animate-bounce rounded-full bg-blue-400"
                    style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.8s' }}
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatWidget({ ctx }) {
    const welcomeText = useMemo(() => buildWelcomeText(ctx), [ctx?.role, ctx?.pendientesCount]);

    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState(() => [
        {
            id: 0,
            role: 'bot',
            text: buildWelcomeText(ctx),
            timestamp: new Date(),
        },
    ]);
    const [typing, setTyping] = useState(false);
    const [input, setInput] = useState('');
    const [activeCategory, setActiveCategory] = useState('todos');
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        setMessages((prev) => {
            const first = prev[0];
            if (!first || first.role !== 'bot' || first.id !== 0) return prev;
            if (first.text === welcomeText) return prev;
            return [{ ...first, text: welcomeText }, ...prev.slice(1)];
        });
    }, [welcomeText]);

    const visibleIntents =
        activeCategory === 'todos' ? INTENTS : INTENTS.filter((i) => i.category === activeCategory);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typing]);

    useEffect(() => {
        if (open) {
            setUnread(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    const sendBotReply = (text) => {
        setTyping(true);
        setTimeout(() => {
            setTyping(false);
            const botMsg = { id: Date.now(), role: 'bot', text, timestamp: new Date() };
            setMessages((prev) => [...prev, botMsg]);
            if (!open) setUnread((n) => n + 1);
        }, 900 + Math.random() * 500);
    };

    const handleIntent = (intent) => {
        const userMsg = {
            id: Date.now(),
            role: 'user',
            text: intent.label,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        sendBotReply(intent.response(ctx));
    };

    const handleFreeText = (e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;

        const userMsg = { id: Date.now(), role: 'user', text, timestamp: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');

        const lower = text.toLowerCase();
        const matched = matchIntentByFreeText(lower);

        if (matched) {
            sendBotReply(matched.response(ctx));
        } else {
            sendBotReply(
                'No estoy seguro de cómo responder eso.\n\nPrueba con las **tarjetas** de abajo o con palabras como: **gestión**, **alertas HE**, **exportar Excel**, **calendario**, **filtros** o **pendientes**.'
            );
        }
    };

    const formatTime = (date) => date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return (
        <>
            {/* ── Floating Button ─────────────────────────────────── */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="group fixed bottom-6 right-6 z-50"
                title="Asistente CINTE"
                type="button"
            >
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-600 to-indigo-700 shadow-[0_0_24px_rgba(59,130,246,0.45)] transition-all hover:scale-110 hover:shadow-[0_0_32px_rgba(59,130,246,0.6)] active:scale-95">
                    {open ? (
                        <ChevronDown size={22} className="text-white" />
                    ) : (
                        <Bot size={22} className="text-white" />
                    )}
                    {!open && (
                        <span className="absolute inset-0 animate-ping rounded-2xl opacity-40 ring-2 ring-blue-500/50" />
                    )}
                    {unread > 0 && !open && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-lg">
                            {unread}
                        </span>
                    )}
                </div>
                <span className="pointer-events-none absolute right-16 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    Asistente CINTE
                </span>
            </button>

            {/* ── Chat Window ─────────────────────────────────────── */}
            <div
                className={`
                    fixed bottom-24 right-6 z-50 flex w-[370px] max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-slate-700/70 bg-[#0f172a] shadow-2xl
                    transition-all duration-300 origin-bottom-right
                    ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'}
                `}
                style={{ maxHeight: 'min(600px, calc(100vh - 120px))' }}
            >
                <div className="flex flex-shrink-0 items-center gap-3 rounded-t-2xl border-b border-slate-700/60 bg-gradient-to-r from-blue-700/20 to-indigo-700/10 px-4 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-md">
                        <Sparkles size={16} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-tight text-white">CINTEBot</p>
                        <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                            En línea · Novedades y gestión
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-all hover:bg-rose-500/20 hover:text-rose-400"
                    >
                        <X size={13} />
                    </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 scroll-smooth" style={{ minHeight: 0 }}>
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {msg.role === 'bot' && (
                                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-600/20">
                                    <Bot size={13} className="text-blue-400" />
                                </div>
                            )}
                            <div className={`flex max-w-[85%] flex-col gap-0.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`
                                        rounded-2xl px-3 py-2.5 text-sm leading-relaxed
                                        ${
                                            msg.role === 'user'
                                                ? 'rounded-tr-sm bg-blue-600 text-white'
                                                : 'rounded-tl-sm border border-slate-700/60 bg-[#1e293b] text-slate-200'
                                        }
                                    `}
                                >
                                    <FormatText text={msg.text} />
                                </div>
                                <span className="px-1 text-[9px] text-slate-600">{formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    ))}

                    {typing && (
                        <div className="flex gap-2">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-600/20">
                                <Bot size={13} className="text-blue-400" />
                            </div>
                            <div className="rounded-2xl rounded-tl-sm border border-slate-700/60 bg-[#1e293b]">
                                <TypingDots />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="flex-shrink-0 border-t border-slate-700/60">
                    <div className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-1 pt-2.5">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setActiveCategory(cat.id)}
                                className={`
                                    flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all
                                    ${
                                        activeCategory === cat.id
                                            ? 'border-blue-500 bg-blue-600 text-white'
                                            : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                                    }
                                `}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-3 pb-2.5">
                        {visibleIntents.map((intent) => (
                            <button
                                key={intent.id}
                                type="button"
                                onClick={() => handleIntent(intent)}
                                disabled={typing}
                                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 transition-all hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <span>{intent.icon}</span>
                                <span className="leading-tight">{intent.label}</span>
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleFreeText} className="flex gap-2 px-3 pb-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Escribe tu pregunta..."
                            disabled={typing}
                            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || typing}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                        >
                            <Send size={14} />
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
