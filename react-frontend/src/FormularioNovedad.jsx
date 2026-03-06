import { useMemo, useState } from 'react';

export default function FormularioNovedad() {
  const [formData, setFormData] = useState({
    nombre: '',
    cedula: '',
    correo: '',
    tipo: '',
    // ---- Hora Extra ----
    fecha: '',       // fecha única para Hora Extra
    horaInicio: '',  // HH:mm (24h)
    horaFin: '',     // HH:mm (24h)
    // ---- Otros tipos ----
    fechaInicio: '',
    fechaFin: '',
    // ---- Comunes ----
    cantidadHoras: '',
    tipoJornada: 'Diurna',
  });

  const [status, setStatus] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isHoraExtra = formData.tipo === 'Hora Extra';

  // --- cálculo automático (ya no permite cruce de medianoche por tu regla de fin > inicio) ---
  const horasCalculadas = useMemo(() => {
    if (!isHoraExtra) return 0;
    const { fecha, horaInicio, horaFin } = formData;
    if (!fecha || !horaInicio || !horaFin) return 0;

    // Validación estricta: fin debe ser MAYOR que inicio
    if (horaFin <= horaInicio) return 0;

    const [Y, M, D] = fecha.split('-').map(Number);
    const [h1, m1] = horaInicio.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);

    const start = new Date(Y, M - 1, D, h1, m1, 0);
    const end   = new Date(Y, M - 1, D, h2, m2, 0);

    const hours = (end.getTime() - start.getTime()) / 36e5;
    return Math.max(0, Math.round(hours * 100) / 100); // redondeo 2 decimales
  }, [isHoraExtra, formData.fecha, formData.horaInicio, formData.horaFin]);

  // Helpers de validación
  const isValidDateOrder = (start, end) => {
    if (!start || !end) return true;
    return end >= start; // se permite igual día; usa ">" si quieres obligar > estrictamente
  };

  const isValidTimeOrder = (start, end) => {
    if (!start || !end) return true;
    return end > start; // estricto: fin debe ser mayor
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // limpiar mensajes si el usuario cambia algo
    if (status.type) setStatus({ type: '', text: '' });

    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      // UX: si cambia fechaInicio, y fechaFin quedó menor, la vaciamos
      if (name === 'fechaInicio' && next.fechaFin && next.fechaFin < value) {
        next.fechaFin = '';
      }
      // UX: si cambia horaInicio, y horaFin quedó menor/igual, la vaciamos
      if (name === 'horaInicio' && next.horaFin && next.horaFin <= value) {
        next.horaFin = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // --- Validaciones previas al envío ---
    if (!formData.nombre?.trim() || !formData.cedula?.trim() || !formData.tipo) {
      setStatus({ type: 'error', text: '❌ Completa los campos obligatorios.' });
      return;
    }

    if (isHoraExtra) {
      // Validación de fecha + horas (24h)
      if (!formData.fecha || !formData.horaInicio || !formData.horaFin) {
        setStatus({ type: 'error', text: '❌ Completa Fecha, Hora Inicio y Hora Fin.' });
        return;
      }
      if (!isValidTimeOrder(formData.horaInicio, formData.horaFin)) {
        setStatus({ type: 'error', text: '❌ La Hora Fin no puede ser menor o igual que la Hora Inicio.' });
        return;
      }
    } else {
      // Validación de calendario
      if (!formData.fechaInicio) {
        setStatus({ type: 'error', text: '❌ La Fecha Inicio es obligatoria.' });
        return;
      }
      if (formData.fechaFin && !isValidDateOrder(formData.fechaInicio, formData.fechaFin)) {
        setStatus({ type: 'error', text: '❌ La Fecha Fin no puede ser menor que la Fecha Inicio.' });
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
      payload.append('tipoNovedad', formData.tipo);
      payload.append('tipoHoraExtra', formData.tipoJornada);

      // Archivo
      const fileInput = document.getElementById('soporte');
      if (fileInput && fileInput.files.length > 0) {
        payload.append('soporte', fileInput.files[0]);
      }

      if (isHoraExtra) {
        // —— Hora Extra: fecha + horas (24h) + cantidad calculada ——
        payload.append('fecha', formData.fecha);
        payload.append('horaInicio', formData.horaInicio);
        payload.append('horaFin', formData.horaFin);
        payload.append('cantidadHoras', String(horasCalculadas || 0));

        // Compat: si el backend espera fechaInicio/fechaFin:
        payload.append('fechaInicio', formData.fecha || 'N/A');
        payload.append('fechaFin', formData.fecha || 'N/A');
      } else {
        // —— Otros tipos: calendario clásico ——
        payload.append('fechaInicio', formData.fechaInicio);
        payload.append('fechaFin', formData.fechaFin || 'N/A');
        payload.append('cantidadHoras', formData.cantidadHoras || 0);
      }

      const res = await fetch('/api/enviar-novedad', {
        method: 'POST',
        body: payload
      });

      if (res.ok) {
        setStatus({ type: 'success', text: '✅ ¡Guardado con éxito!' });
        setFormData({
          nombre: '',
          cedula: '',
          correo: '',
          tipo: '',
          fecha: '',
          horaInicio: '',
          horaFin: '',
          fechaInicio: '',
          fechaFin: '',
          cantidadHoras: '',
          tipoJornada: 'Diurna',
        });
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
            {/* Nombre */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#9fb3c8]">
                Nombre y Apellido <span className="text-[#1fc76a]">*</span>
              </label>
              <input
                required
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                type="text"
                placeholder="Ej: Kevin Ovalle"
                className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>

            {/* Cédula */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#9fb3c8]">
                Cédula <span className="text-[#1fc76a]">*</span>
              </label>
              <input
                required
                name="cedula"
                value={formData.cedula}
                onChange={handleChange}
                type="number"
                placeholder="Documento de identidad"
                className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>

            {/* Correo */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#9fb3c8]">Correo del Solicitante</label>
              <input
                name="correo"
                value={formData.correo}
                onChange={handleChange}
                type="email"
                placeholder="usuario@dominio.com"
                className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all placeholder-[#3c566e]"
              />
            </div>

            {/* Tipo de Novedad */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#9fb3c8]">
                Tipo de Novedad <span className="text-[#1fc76a]">*</span>
              </label>
              <select
                required
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
              >
                <option value="">Selecciona...</option>
                <option value="Incapacidad">Incapacidad</option>
                <option value="Apoyo">Apoyo</option>
                <option value="Apoyo Standby">Apoyo Standby</option>
                <option value="Vacaciones">Vacaciones</option>
                <option value="Hora Extra">Hora Extra</option>
                <option value="Licencia de Luto">Licencia de Luto</option>
                <option value="Permiso personal">Permiso personal</option>
              </select>
            </div>

            {/* ====== CONDICIONAL ====== */}
            {isHoraExtra ? (
              // ---------- HORA EXTRA ----------
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">
                    Fecha <span className="text-[#1fc76a]">*</span>
                  </label>
                  <input
                    required
                    name="fecha"
                    value={formData.fecha}
                    onChange={handleChange}
                    type="date"
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">
                    Hora Inicio (24h) <span className="text-[#1fc76a]">*</span>
                  </label>
                  <input
                    required
                    name="horaInicio"
                    value={formData.horaInicio}
                    onChange={handleChange}
                    type="time"
                    step="60"
                    pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">
                    Hora Fin (24h) <span className="text-[#1fc76a]">*</span>
                  </label>
                  <input
                    required
                    name="horaFin"
                    value={formData.horaFin}
                    onChange={handleChange}
                    type="time"
                    step="60"
                    min={formData.horaInicio || undefined} // ayuda visual: bloquea menores
                    pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
                  />
                </div>

                {/* Jornada */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">Jornada</label>
                  <select
                    name="tipoJornada"
                    value={formData.tipoJornada}
                    onChange={handleChange}
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
                  >
                    <option value="Diurna">Diurna</option>
                    <option value="Nocturna">Nocturna</option>
                  </select>
                </div>

                {/* Info de horas calculadas */}
                <div className="md:col-span-2 text-[#9fb3c8]">
                  {formData.horaInicio && formData.horaFin && formData.horaFin <= formData.horaInicio
                    ? '⚠️ La Hora Fin debe ser mayor que la Hora Inicio.'
                    : horasCalculadas > 0
                      ? `Horas calculadas: ${horasCalculadas}`
                      : 'Completa fecha y horas para calcular la cantidad.'}
                </div>
              </>
            ) : (
              // ---------- OTROS TIPOS ----------
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">
                    Fecha Inicio <span className="text-[#1fc76a]">*</span>
                  </label>
                  <input
                    required
                    name="fechaInicio"
                    value={formData.fechaInicio}
                    onChange={handleChange}
                    type="date"
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">Fecha Fin</label>
                  <input
                    name="fechaFin"
                    value={formData.fechaFin}
                    onChange={handleChange}
                    type="date"
                    min={formData.fechaInicio || undefined} // ayuda visual: bloquea menores
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all [color-scheme:dark]"
                  />
                  {!isValidDateOrder(formData.fechaInicio, formData.fechaFin) && (
                    <small className="text-[#ff6b6b]">La Fecha Fin no puede ser menor que la Fecha Inicio.</small>
                  )}
                </div>

                {/* (Opcional) Cantidad de Horas manual */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-sm font-semibold text-[#9fb3c8]">Cantidad de Horas</label>
                  <input
                    name="cantidadHoras"
                    value={formData.cantidadHoras}
                    onChange={handleChange}
                    type="number"
                    placeholder="0"
                    className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all"
                  />
                </div>
              </>
            )}

            {/* Soporte / Adjunto */}
            <div className="col-span-1 md:col-span-2 flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#9fb3c8]">
                Soporte / Adjunto (PDF, JPG, PNG)
              </label>
              <input
                type="file"
                id="soporte"
                className="bg-[#162a3d] border border-[#21405f] text-white p-3 rounded-lg focus:outline-none focus:border-[#2a90ff] focus:ring-2 focus:ring-[#2a90ff]/20 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#2a90ff]/10 file:text-[#2a90ff] hover:file:bg-[#2a90ff]/20 cursor-pointer"
              />
            </div>
          </div>

          <button
            disabled={isSubmitting}
            type="submit"
            className="w-full mt-8 bg-[#2a90ff] hover:bg-[#1a7ae0] disabled:bg-[#21405f] disabled:text-[#9fb3c8] text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg hover:shadow-xl hover:shadow-[#2a90ff]/20"
          >
            {isSubmitting ? 'Procesando...' : 'Enviar Solicitud'}
          </button>

          {status.text && (
            <div
              className={`mt-6 text-center font-semibold text-lg transition-all ${
                status.type === 'success'
                  ? 'text-[#1fc76a]'
                  : status.type === 'error'
                  ? 'text-[#ff6b6b]'
                  : 'text-[#f39c12] animate-pulse'
              }`}
            >
              {status.text}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}