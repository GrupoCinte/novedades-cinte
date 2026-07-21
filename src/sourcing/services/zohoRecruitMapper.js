'use strict';

/**
 * Mapea un registro de Zoho Recruit al formato candidato del portal.
 */
function mapZohoRecordToCandidato(rec, cargoBuscado = '') {
    const nombre = rec.Full_Name || rec.full_name || '';
    const skillsRaw = rec.Skill_Set || rec.skill_set || '';
    const skills = typeof skillsRaw === 'string'
        ? skillsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : Array.isArray(skillsRaw) ? skillsRaw : [];

    const modTime = rec.Modified_On || rec.Last_Activity_Time || '';
    let diasInactivo = '';
    let ultimaActividad = '';
    if (modTime) {
        try {
            const fechaMod = new Date(String(modTime).slice(0, 19));
            if (!Number.isNaN(fechaMod.getTime())) {
                diasInactivo = String(Math.floor((Date.now() - fechaMod.getTime()) / 86400000));
                ultimaActividad = fechaMod.toLocaleDateString('es-CO');
            }
        } catch {
            /* ignore */
        }
    }

    const salarioRaw = rec.Expected_Salary || rec.Aspiracion_Salarial || rec.expected_salary || '';
    const zohoId = String(rec.id || rec.Id || '');

    return {
        nombre,
        cargo: rec.Cargo_Actual || rec.cargo_actual || '',
        ciudad: rec.City || rec.city || '',
        experiencia: String(rec.Experience_in_Years ?? rec.experience_in_years ?? ''),
        email: rec.Email || rec.email || '',
        telefono: String(rec.Mobile || rec.mobile || ''),
        resumen_perfil: String(rec.Description || rec.description || '').slice(0, 300),
        url: zohoId
            ? `https://recruit.zoho.com/recruit/EntityInfo.do?module=Candidates&id=${zohoId}`
            : '',
        fuente: 'Zoho Recruit',
        skills,
        zoho_id: zohoId,
        dias_inactivo: diasInactivo,
        ultima_actividad: ultimaActividad,
        estado_zoho: rec.Candidate_Status || rec.candidate_status || '',
        salario: String(salarioRaw || '').trim(),
        cargo_buscado: cargoBuscado
    };
}

function mapCandidatoToZohoPayload(candidato) {
    const nombre = String(candidato.nombre || 'Sin nombre').trim().split(/\s+/);
    const skills = candidato.perfil?.skills || candidato.skills || [];
    const skillsStr = Array.isArray(skills) ? skills.join(', ') : String(skills || '');

    return {
        data: [{
            Last_Name: nombre.length ? nombre[nombre.length - 1] : 'Sin nombre',
            First_Name: nombre.length > 1 ? nombre.slice(0, -1).join(' ') : '',
            Cargo_Actual: candidato.perfil?.cargo || candidato.cargo || '',
            City: candidato.perfil?.ciudad || candidato.ciudad || '',
            Email: candidato.perfil?.email || candidato.email || '',
            Mobile: candidato.perfil?.telefono || candidato.telefono || '',
            Candidate_Source: candidato.fuente || '',
            Skill_Set: skillsStr,
            Source: 'Portal Atracción CINTE'
        }]
    };
}

module.exports = {
    mapZohoRecordToCandidato,
    mapCandidatoToZohoPayload
};
