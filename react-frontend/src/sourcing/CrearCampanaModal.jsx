import { useEffect, useState } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';

export default function CrearCampanaModal({ count, creating, error = '', nombreSugerido = '', onClose, onSubmit }) {
    const { isLight } = useModuleTheme();
    const defaultNombre = nombreSugerido.trim() || (count > 0 ? 'Campaña de contacto' : '');
    const [nombre, setNombre] = useState(defaultNombre);
    const [mensaje, setMensaje] = useState('');
    const [canalDefault, setCanalDefault] = useState('auto');

    useEffect(() => {
        const next = nombreSugerido.trim() || (count > 0 ? 'Campaña de contacto' : '');
        if (next) setNombre(next);
    }, [nombreSugerido, count]);

    const input = isLight
        ? 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100';
    const label = isLight ? 'text-xs font-medium text-slate-700' : 'text-xs font-medium text-slate-300';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const btnPrimary = isLight
        ? 'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50'
        : 'rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50';

    const canSubmit = nombre.trim().length >= 2 && count > 0 && !creating;

    return (
        <GestionModalShell
            open
            onClose={onClose}
            title="Nueva campaña de contacto"
            subtitle={`${count} candidato${count !== 1 ? 's' : ''} seleccionado${count !== 1 ? 's' : ''}`}
            size="md"
        >
            <div className="space-y-3">
                <label className="block">
                    <span className={label}>Nombre de la campaña</span>
                    <input
                        className={`${input} mt-1`}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Contacto Backend Senior — julio"
                    />
                </label>
                <label className="block">
                    <span className={label}>Canal</span>
                    <select className={`${input} mt-1`} value={canalDefault} onChange={(e) => setCanalDefault(e.target.value)}>
                        <option value="auto">Automático (WhatsApp si hay teléfono, InMail para LinkedIn)</option>
                        <option value="whatsapp">Solo WhatsApp</option>
                        <option value="inmail">Solo InMail</option>
                    </select>
                </label>
                <label className="block">
                    <span className={label}>Mensaje inicial (opcional)</span>
                    <textarea
                        className={`${input} mt-1 min-h-[100px]`}
                        value={mensaje}
                        onChange={(e) => setMensaje(e.target.value)}
                        placeholder="Déjelo vacío para usar la plantilla de apertura del agente (con datos de la vacante)."
                    />
                </label>
                <p className={`text-xs ${muted}`}>
                    Solo entran candidatos <strong>aprobados</strong> con teléfono (WhatsApp) o perfil LinkedIn (InMail).
                    Al crear la campaña se enviará automáticamente al flujo de contacto si está configurado.
                </p>
                {error ? <p className="text-sm text-red-500">{error}</p> : null}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        className={isLight ? 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700' : 'rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200'}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className={btnPrimary}
                        disabled={!canSubmit}
                        onClick={() => onSubmit({ nombre: nombre.trim(), mensaje: mensaje.trim(), canalDefault })}
                    >
                        {creating ? 'Creando…' : 'Crear campaña'}
                    </button>
                </div>
            </div>
        </GestionModalShell>
    );
}
