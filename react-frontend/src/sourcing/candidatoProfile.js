/** Utilidades para mostrar perfiles de candidatos en la UI. */

const NAV_NOISE = new Set([
    'comentarios', 'cuestionario', 'contacto', 'contacto 1', 'contacto 2',
    'experiencia', 'experiencias', 'formación', 'formacion', 'habilidades'
]);

export function isNavigableProfileUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim().toLowerCase();
    if (!u.startsWith('http')) return false;
    if (u.includes('buscar?') && u.includes('#')) return false;
    return (
        u.includes('hoja-de-vida')
        || u.includes('postulacion/')
        || u.includes('resumee')
        || u.includes('/cv/')
    );
}

export function isPartialProfile(perfil) {
    if (!perfil || typeof perfil !== 'object') return true;
    if (perfil.datos_completos === true) return false;
    if (perfil.extraccion?.estado === 'parcial') return true;
    return !(
        (perfil.resumen_perfil && String(perfil.resumen_perfil).length > 80)
        || perfil.email
        || perfil.telefono
        || (Array.isArray(perfil.contactos) && perfil.contactos.length > 0)
        || (Array.isArray(perfil.experiencias) && perfil.experiencias.length > 0)
    );
}

export function filterProfileList(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
        const t = String(item || '').trim().toLowerCase();
        return t.length > 4 && !NAV_NOISE.has(t) && !/^contacto\s*\d*$/.test(t);
    });
}

export function profileSections(perfil) {
    if (!perfil || typeof perfil !== 'object') return [];
    const sections = [];

    if (perfil.fecha_actualizacion) {
        sections.push({ label: 'Actualizado en El Empleo', value: perfil.fecha_actualizacion });
    }
    if (perfil.nivel_estudio) {
        sections.push({ label: 'Nivel de estudios', value: perfil.nivel_estudio });
    }
    if (perfil.idiomas) {
        sections.push({ label: 'Idiomas', value: perfil.idiomas });
    }
    if (perfil.experiencia) {
        sections.push({ label: 'Años de experiencia', value: perfil.experiencia });
    }
    if (perfil.edad) {
        sections.push({ label: 'Edad', value: perfil.edad });
    }
    if (perfil.salario) {
        sections.push({ label: 'Aspiración salarial', value: perfil.salario });
    }

    const experiencias = filterProfileList(perfil.experiencias);
    if (experiencias.length > 0) {
        sections.push({ label: 'Experiencias', list: experiencias });
    }
    const formacion = filterProfileList(perfil.formacion);
    if (formacion.length > 0) {
        sections.push({ label: 'Formación', list: formacion });
    }
    const habilidades = filterProfileList(perfil.habilidades);
    if (habilidades.length > 0) {
        sections.push({ label: 'Habilidades', list: habilidades });
    }
    return sections;
}

export function formatContactos(perfil) {
    if (!perfil || typeof perfil !== 'object') return [];
    if (Array.isArray(perfil.contactos) && perfil.contactos.length > 0) {
        return perfil.contactos.filter((c) => c && (c.telefono || c.email));
    }
    if (perfil.telefono || perfil.email) {
        return [{ label: 'Contacto', telefono: perfil.telefono, email: perfil.email }];
    }
    return [];
}
