import { buildCsrfHeaders } from '../../cognitoAuth.js';

async function parseResponse(response, defaultErrorMsg, successKey = 'actividad') {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = payload?.error || defaultErrorMsg;
    return { ok: false, error: errorMsg, status: response.status, [successKey === 'actividad' ? 'actividad' : successKey]: successKey === 'mensaje' ? undefined : (successKey === 'activo' ? null : []) };
  }
  if (successKey === 'mensaje') {
    return { ok: true, mensaje: payload?.mensaje };
  }
  if (successKey === 'cliente') {
    return { ok: true, cliente: payload?.cliente || null };
  }
  if (successKey === 'activo') {
    return { ok: true, activo: payload?.activo || null };
  }
  if (successKey === 'actividades') {
    return { ok: true, actividades: payload?.actividades || [] };
  }
  return { ok: true, actividad: payload?.actividad };
}


/**
 * Consulta el contexto del consultor (cliente asignado en su ficha).
 */
export async function fetchConsultorActividadesContext() {
  try {
    const response = await fetch('/api/consultor/actividades/context', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo obtener el contexto del consultor.', 'cliente');
  } catch {
    return {
      ok: false,
      error: 'Error de red al consultar el cliente asignado.'
    };
  }
}

/**
 * Consulta la lista del historial de actividades del consultor autenticado.
 */
export async function fetchActividadesList() {
  try {
    const response = await fetch('/api/consultor/actividades', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo consultar el historial de actividades.', 'actividades');
  } catch {
    return {
      ok: false,
      error: 'Error de red al obtener el historial de actividades.',
      actividades: []
    };
  }
}

/**
 * Crea una entrada manual de tiempo para el consultor.
 */
export async function createActividadManual({ descripcion, fecha, horaInicio, horaFin }) {
  try {
    const headers = buildCsrfHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch('/api/consultor/actividades', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        descripcion,
        fecha,
        horaInicio,
        horaFin
      })
    });

    return parseResponse(response, 'No se pudo registrar la entrada de tiempo.');
  } catch {
    return {
      ok: false,
      error: 'Error de red al guardar la actividad.'
    };
  }
}

/**
 * Consulta el cronómetro activo en curso (si existe).
 */
export async function fetchCronometroActivo() {
  try {
    const response = await fetch('/api/consultor/actividades/cronometro/activo', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo verificar el estado del cronómetro.', 'activo');
  } catch (err) {
    return {
      ok: false,
      error: 'Error de red al verificar el cronómetro activo.',
      activo: null
    };
  }
}

/**
 * Inicia un nuevo cronómetro con la descripción dada.
 */
export async function iniciarCronometroApi({ descripcion }) {
  try {
    const headers = buildCsrfHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch('/api/consultor/actividades/cronometro/iniciar', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ descripcion })
    });

    return parseResponse(response, 'No se pudo iniciar el cronómetro.');
  } catch (err) {
    console.error(err);
    return {
      ok: false,
      error: 'Error de red al iniciar el cronómetro.'
    };
  }
}

/**
 * Detiene el cronómetro en curso y guarda la actividad.
 */
export async function detenerCronometroApi() {
  try {
    const headers = buildCsrfHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch('/api/consultor/actividades/cronometro/detener', {
      method: 'POST',
      headers,
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo detener el cronómetro.');
  } catch (err) {
    return {
      ok: false,
      error: 'Error de red al detener el cronómetro.'
    };
  }
}

/**
 * Cancela el cronómetro en curso sin guardar ninguna actividad.
 */
export async function cancelarCronometroApi() {
  try {
    const headers = buildCsrfHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch('/api/consultor/actividades/cronometro/cancelar', {
      method: 'POST',
      headers,
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo cancelar el cronómetro.', 'mensaje');
  } catch (err) {
    return {
      ok: false,
      error: 'Error de red al cancelar el cronómetro.'
    };
  }
}

/**
 * Actualiza una entrada de tiempo manual.
 */
export async function updateActividadApi(id, { descripcion, fecha, horaInicio, horaFin }) {
  try {
    const headers = buildCsrfHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`/api/consultor/actividades/${id}`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        descripcion,
        fecha,
        horaInicio,
        horaFin
      })
    });

    return parseResponse(response, 'No se pudo actualizar la entrada de tiempo.');
  } catch {
    return {
      ok: false,
      error: 'Error de red al actualizar la actividad.'
    };
  }
}

/**
 * Elimina una entrada de tiempo.
 */
export async function deleteActividadApi(id) {
  try {
    const headers = buildCsrfHeaders({
      Accept: 'application/json'
    });

    const response = await fetch(`/api/consultor/actividades/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    return parseResponse(response, 'No se pudo eliminar la entrada de tiempo.', 'mensaje');
  } catch {
    return {
      ok: false,
      error: 'Error de red al eliminar la actividad.'
    };
  }
}
