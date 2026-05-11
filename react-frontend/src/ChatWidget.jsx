import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, ChevronDown, Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE — intenciones y respuestas
// ─────────────────────────────────────────────────────────────────────────────
const INTENTS = [
    {
        id: 'pendientes',
        label: '¿Cuántas novedades hay pendientes?',
        icon: '📋',
        category: 'estado',
        response: (ctx) =>
            ctx?.pendientesCount !== undefined
                ? `Actualmente hay **${ctx.pendientesCount} novedad(es) pendiente(s)** esperando revisión.\n\nPuedes gestionarlas desde la sección **Gestión de Novedades** en el menú lateral.`
                : 'Puedes ver el conteo de pendientes en el KPI **"Alertas Pendientes"** en el inicio del Dashboard.',
    },
    {
        id: 'aprobar',
        label: '¿Cómo apruebo una novedad?',
        icon: '✅',
        category: 'proceso',
        response: () =>
            'Para **aprobar** una novedad sigue estos pasos:\n\n1. Ve a **Gestión de Novedades** en el menú\n2. Busca el registro con estado *Pendiente*\n3. Haz clic en el ícono ✓ (verde) de la fila\n4. La novedad cambiará a **Aprobado** automáticamente.',
    },
    {
        id: 'rechazar',
        label: '¿Cómo rechazo una novedad?',
        icon: '❌',
        category: 'proceso',
        response: () =>
            'Para **rechazar** una novedad:\n\n1. Ve a **Gestión de Novedades**\n2. Localiza el registro *Pendiente*\n3. Haz clic en el ícono ✗ (rojo)\n4. El estado cambiará a **Rechazado**.\n\n⚠️ Esta acción queda registrada en el sistema.',
    },
    {
        id: 'tipos',
        label: '¿Qué tipos de novedad existen?',
        icon: '📂',
        category: 'info',
        response: () =>
            'Los **tipos de novedad** registrados en CINTE son:\n\n• 🔴 Incapacidad\n• 🟡 Vacaciones\n• 🔵 Permiso\n• 🟢 Hora Extra\n• 🟣 Licencia\n\nPuedes filtrar por tipo en las secciones de **Gestión** y **Calendario**.',
    },
    {
        id: 'exportar',
        label: '¿Cómo exporto el reporte?',
        icon: '📥',
        category: 'proceso',
        response: () =>
            'Para exportar el reporte en **Excel**:\n\n1. Ve a la sección **Gestión de Novedades**\n2. Aplica los filtros que necesites (tipo, estado, correo)\n3. Haz clic en el botón **"Exportar Reporte Excel"** (azul, arriba a la derecha)\n4. El archivo .xlsx se descargará automáticamente con columnas organizadas.',
    },
    {
        id: 'filtrar',
        label: '¿Cómo uso los filtros del Dashboard?',
        icon: '🔍',
        category: 'proceso',
        response: () =>
            'El **Dashboard Inicio** tiene un filtro por período:\n\n• **Mes**: selecciona el mes de interés\n• **Día**: (habilitado al elegir mes) filtra por día específico\n• **Limpiar filtro**: restablece la vista completa\n\nEste filtro afecta el **Monitor de Tendencia**, la **Distribución por Tipología** y el **Top 5 Empleados**.',
    },
    {
        id: 'calendario',
        label: '¿Qué muestra el Calendario?',
        icon: '📅',
        category: 'info',
        response: () =>
            'El **Calendario Operativo** muestra:\n\n• Las novedades por día según su **Fecha de Inicio**\n• Un indicador con la cantidad de registros por día\n• Códigos de color por tipo de novedad\n• Al hacer clic en un día con registros, se abre un **detalle completo**\n\nPuedes navegar entre meses con las flechas de la cabecera.',
    },
    {
        id: 'riesgo',
        label: '¿Qué es el Riesgo Operativo?',
        icon: '⚠️',
        category: 'info',
        response: () =>
            'El **Índice de Riesgo Operativo** (sección Análisis Avanzado) clasifica empleados por:\n\n• 🟥 **Riesgo Alto**: puntaje ≥ 10 (múltiples incapacidades u horas extra)\n• 🟡 **Riesgo Medio**: puntaje ≥ 5\n• 🔵 **Riesgo Base**: puntaje < 5\n\nSirve para identificar posibles casos de burnout o ausentismo frecuente.',
    },
    {
        id: 'version',
        label: '¿Quién desarrolló este sistema?',
        icon: '🧠',
        category: 'info',
        response: () =>
            'Este sistema fue diseñado y desarrollado por:\n\n**Luis Miguel Correa**\n*Arquitecto de datos*\n\nSistema de Análisis de Novedades — Grupo CINTE **V2.0**\n\n¿En qué más puedo ayudarte? 😊',
    },
];

const CATEGORIES = [
    { id: 'todos', label: 'Todos' },
    { id: 'estado', label: '📊 Estado' },
    { id: 'proceso', label: '⚙️ Proceso' },
    { id: 'info', label: 'ℹ️ Info' },
];

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
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.18}s`, animationDuration: '0.8s' }}
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatWidget({ ctx }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([
        {
            id: 0,
            role: 'bot',
            text: '¡Hola! Soy **CINTEBot** 🤖, tu asistente de RR.HH.\n\nPuedo ayudarte con preguntas sobre el sistema. Selecciona una opción o escribe tu consulta:',
            timestamp: new Date(),
        },
    ]);
    const [typing, setTyping] = useState(false);
    const [input, setInput] = useState('');
    const [activeCategory, setActiveCategory] = useState('todos');
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const visibleIntents = activeCategory === 'todos'
        ? INTENTS
        : INTENTS.filter(i => i.category === activeCategory);

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
            setMessages(prev => [...prev, botMsg]);
            if (!open) setUnread(n => n + 1);
        }, 900 + Math.random() * 500);
    };

    const handleIntent = (intent) => {
        const userMsg = {
            id: Date.now(),
            role: 'user',
            text: intent.label,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        sendBotReply(intent.response(ctx));
    };

    const handleFreeText = (e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;

        const userMsg = { id: Date.now(), role: 'user', text, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        // Simple keyword matching
        const lower = text.toLowerCase();
        const matched = INTENTS.find(intent => {
            const keywords = intent.label.toLowerCase().split(/[\s?¿,]+/);
            return keywords.some(kw => kw.length > 3 && lower.includes(kw));
        });

        if (matched) {
            sendBotReply(matched.response(ctx));
        } else {
            sendBotReply(
                'No estoy seguro de cómo responder eso. 🤔\n\nPor favor selecciona una de las opciones disponibles o reformula tu pregunta.'
            );
        }
    };

    const formatTime = (date) =>
        date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return (
        <>
            {/* ── Floating Button ─────────────────────────────────── */}
            <button
                onClick={() => setOpen(o => !o)}
                className="fixed bottom-6 right-6 z-50 group"
                title="Asistente CINTE"
            >
                <div className="relative w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-[0_0_24px_rgba(59,130,246,0.45)] flex items-center justify-center transition-all hover:scale-110 hover:shadow-[0_0_32px_rgba(59,130,246,0.6)] active:scale-95 border border-blue-400/30">
                    {open ? (
                        <ChevronDown size={22} className="text-white" />
                    ) : (
                        <Bot size={22} className="text-white" />
                    )}
                    {/* pulse ring */}
                    {!open && (
                        <span className="absolute inset-0 rounded-2xl ring-2 ring-blue-500/50 animate-ping opacity-40" />
                    )}
                    {/* unread badge */}
                    {unread > 0 && !open && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg">
                            {unread}
                        </span>
                    )}
                </div>
                <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-[#1e293b] text-xs px-3 py-1.5 rounded-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl font-medium text-slate-200 pointer-events-none">
                    Asistente CINTE
                </span>
            </button>

            {/* ── Chat Window ─────────────────────────────────────── */}
            <div
                className={`
                    fixed bottom-24 right-6 z-50 w-[370px] max-h-[600px] flex flex-col
                    bg-[#0f172a] border border-slate-700/70 rounded-2xl shadow-2xl
                    transition-all duration-300 origin-bottom-right
                    ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}
                `}
                style={{ maxHeight: 'min(600px, calc(100vh - 120px))' }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-gradient-to-r from-blue-700/20 to-indigo-700/10 rounded-t-2xl flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
                        <Sparkles size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white leading-tight">CINTEBot</p>
                        <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block animate-pulse" />
                            En línea · Asistente de RR.HH.
                        </p>
                    </div>
                    <button
                        onClick={() => setOpen(false)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-all flex items-center justify-center flex-shrink-0"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth" style={{ minHeight: 0 }}>
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Avatar */}
                            {msg.role === 'bot' && (
                                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot size={13} className="text-blue-400" />
                                </div>
                            )}
                            <div className={`max-w-[85%] flex flex-col gap-0.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`
                                        px-3 py-2.5 rounded-2xl text-sm leading-relaxed
                                        ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-sm'
                                            : 'bg-[#1e293b] text-slate-200 border border-slate-700/60 rounded-tl-sm'
                                        }
                                    `}
                                >
                                    <FormatText text={msg.text} />
                                </div>
                                <span className="text-[9px] text-slate-600 px-1">{formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {typing && (
                        <div className="flex gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                <Bot size={13} className="text-blue-400" />
                            </div>
                            <div className="bg-[#1e293b] border border-slate-700/60 rounded-2xl rounded-tl-sm">
                                <TypingDots />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick-reply chips */}
                <div className="border-t border-slate-700/60 flex-shrink-0">
                    {/* Category tabs */}
                    <div className="flex gap-1 px-3 pt-2.5 pb-1 overflow-x-auto scrollbar-none">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`
                                    flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all
                                    ${activeCategory === cat.id
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                                    }
                                `}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Chips */}
                    <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 max-h-28 overflow-y-auto">
                        {visibleIntents.map(intent => (
                            <button
                                key={intent.id}
                                onClick={() => handleIntent(intent)}
                                disabled={typing}
                                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-300 border border-slate-700 hover:border-blue-500/50 px-2.5 py-1.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <span>{intent.icon}</span>
                                <span className="leading-tight">{intent.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <form onSubmit={handleFreeText} className="flex gap-2 px-3 pb-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Escribe tu pregunta..."
                            disabled={typing}
                            className="flex-1 bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 text-sm text-slate-200 placeholder-slate-500 px-3 py-2 rounded-xl outline-none transition-all disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || typing}
                            className="w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl flex items-center justify-center transition-all flex-shrink-0 disabled:cursor-not-allowed"
                        >
                            <Send size={14} />
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
