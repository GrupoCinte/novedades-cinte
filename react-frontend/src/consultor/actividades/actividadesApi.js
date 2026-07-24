import { buildCsrfHeaders } from '../../cognitoAuth.js';

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

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMsg = payload?.error || 'No se pudo obtener el contexto del consultor.';
      return { ok: false, error: errorMsg, status: response.status };
    }

    return { ok: true, cliente: payload?.cliente || null };
  } catch (err) {
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

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMsg = payload?.error || 'No se pudo consultar el historial de actividades.';
      return { ok: false, error: errorMsg, status: response.status, actividades: [] };
    }

    return { ok: true, actividades: payload?.actividades || [] };
  } catch (err) {
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

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMsg = payload?.error || 'No se pudo registrar la entrada de tiempo.';
      return { ok: false, error: errorMsg, status: response.status };
    }

    return { ok: true, actividad: payload?.actividad };
  } catch (err) {
    return {
      ok: false,
      error: 'Error de red al guardar la actividad.'
    };
  }
}
