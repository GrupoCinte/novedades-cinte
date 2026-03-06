import { useState } from 'react';

export default function FormularioNovedad() {
    const [formData, setFormData] = useState({
        nombre: '',
        cedula: '',
        correo: '',
        tipo: '',
        cantidadHoras: '',
        tipoJornada: 'Diurna',
        fechaInicio: '',
        fechaFin: ''
    });

    const [status, setStatus] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ type: 'wait', text: 'Procesando envío...' });

        try {
            const payload = new FormData();
            payload.append('nombre', formData.nombre);
            payload.append('cedula', formData.cedula);
            payload.append('correoSolicitante', formData.correo);
            payload.append('tipoNovedad', formData.tipo);
            payload.append('fechaInicio', formData.fechaInicio);
            payload.append('fechaFin', formData.fechaFin || 'N/A');
            payload.append('cantidadHoras', formData.cantidadHoras || 0);
            payload.append('tipoHoraExtra', formData.tipoJornada);

            const fileInput = document.getElementById('soporte');
            if (fileInput.files.length > 0) {
                payload.append('soporte', fileInput.files[0]);
            }

            const res = await fetch('/api/enviar-novedad', {
                method: 'POST',
                body: payload
            });

            if (res.ok) {
                setStatus({ type: 'success', text: '✅ ¡Guardado con éxito!' });
                setFormData({
                    nombre: '', cedula: '', correo: '', tipo: '', cantidadHoras: '', tipoJornada: 'Diurna', fechaInicio: '', fechaFin: ''
                });
                // Limpiar mensaje de éxito después de unos segundos
                setTimeout(() => setStatus({ type: '', text: '' }), 4000);
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error(error);
            setStatus({ type: 'error', text: '❌ Error al enviar la solicitud' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex justify-center w-full animate-in fade-in zoom-in duration-300">
            <div className="bg-[#0f2437] border border-[#21405f] rounded-2xl p-8 md:p-12 w-full max-w-4xl shadow-2xl">
                <h1 className="text-3xl font-bold text-[#2a90ff] mb-2">Solicitud de Novedades</h1>
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
                                <option value="Incapacidad">Incapacidad</option>
                                <option value="Vacaciones">Vacaciones</option>
                                <option value="Hora Extra">Hora Extra</option>
                                <option value="Licencia de Luto">Licencia de Luto</option>
                                <option value="Permiso personal">Permiso personal</option>
                            </select>
                        </div>

                        {formData.tipo === 'Hora Extra' && (
                            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Cantidad de Horas</label>
                                    <input name="cantidadHoras" value={formData.cantidadHoras} onChange={handleChange} type="number" placeholder="0" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-[#9fb3c8]">Jornada</label>
                                    <select name="tipoJornada" value={formData.tipoJornada} onChange={handleChange} className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all">
                                        <option value="Diurna">Diurna</option>
                                        <option value="Nocturna">Nocturna</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Inicio <span className="text-[#1fc76a]">*</span></label>
                            <input required name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} type="date" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Fin</label>
                            <input name="fechaFin" value={formData.fechaFin} onChange={handleChange} type="date" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]" />
                        </div>

                        <div className="col-span-1 md:col-span-2 flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#9fb3c8]">Soporte / Adjunto (PDF, JPG, PNG)</label>
                            <input type="file" id="soporte" className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#2a90ff]/10 file:text-[#2a90ff] hover:file:bg-[#2a90ff]/20 cursor-pointer" />
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
    );
}
