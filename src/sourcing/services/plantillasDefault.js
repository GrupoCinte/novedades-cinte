/**
 * Guion base del agente de preentrevista (Contacto AT).
 * Cada fase es una plantilla editable con placeholders tipo [VARIABLE] que se
 * sustituyen con datos del candidato + criterios de la vacante + analista
 * (ver plantillaVars.js). El set por defecto se siembra al crear una campaña
 * y luego puede editarse por campaña.
 */

const PLANTILLA_FASES = [
    { key: 'apertura', label: 'Mensaje de apertura' },
    { key: 'oferta', label: 'Plantilla de oferta' },
    { key: 'cierre_presentacion', label: 'Cierre de presentación' },
    { key: 'formulario_datos', label: 'Solicitud de datos' },
    { key: 'solicitud_hv', label: 'Solicitud de hoja de vida' },
    { key: 'reenganche', label: 'Reenganche (abierto a propuestas)' },
    { key: 'cierre_amable', label: 'Cierre amable (no disponible)' }
];

const PLANTILLAS_DEFAULT = {
    apertura:
        'Hola, buenos días [NOMBRE_CANDIDATO], hablas con [NOMBRE_ANALISTA], analista de '
        + 'Atracción de Talento de Grupo CINTE Colombia.\n\n'
        + 'Me contacto contigo porque encontré tu perfil en [FUENTE] y me interesa tu experiencia '
        + 'para el cargo de [NOMBRE_CARGO].',
    oferta:
        '¡Qué tal estás [NOMBRE_CANDIDATO]! Súper, mira, te comparto el cargo al detalle:\n\n'
        + 'Rol: [NOMBRE_CARGO]\n\n'
        + 'Perfil: [FORMACION_REQUERIDA].\n'
        + '[AÑOS_EXPERIENCIA] años de experiencia en [AREA_EXPERIENCIA].\n'
        + 'Manejo de [HABILIDADES_TECNICAS].\n'
        + 'Deseable: [HABILIDADES_DESEABLES].\n\n'
        + 'Contrato: [TIPO_CONTRATO] con CINTE\n'
        + 'Cliente: [NOMBRE_CLIENTE]\n'
        + 'Horarios: [HORARIO]\n'
        + 'Modalidad: [MODALIDAD] en [CIUDAD]',
    cierre_presentacion:
        '¿Consideras que tu perfil y expectativas se ajustan a esta oferta?',
    formulario_datos:
        'Perfecto, para continuar el proceso necesito que me ayudes con la siguiente información:\n\n'
        + '1. Formación académica:\n'
        + '2. ¿Cuentas con tarjeta profesional?\n'
        + '3. ¿Tienes empleo actualmente? ¿Podrías indicarme tu salario actual o al menos una banda salarial de referencia?\n'
        + '4. Aspiración salarial:\n'
        + '5. Ciudad de residencia:\n'
        + '6. Disponibilidad de inicio de labores (si todo sale bien en el proceso):\n'
        + '7. ¿Te encuentras en otros procesos de selección actualmente?\n'
        + '8. ¿Tienes viajes programados en los próximos meses? ¿En qué fechas?\n'
        + '9. ¿Alguna novedad importante que consideres reportar en el proceso?\n'
        + '10. Fecha de nacimiento:\n'
        + '11. Número de cédula:\n'
        + '12. Nombre completo:\n'
        + '13. Correo electrónico:',
    solicitud_hv:
        '¿Tienes una hoja de vida actualizada que me puedas compartir? '
        + 'Puede ser en español o en inglés, como prefieras.',
    reenganche:
        'Actualmente, ¿estás abierto/a a escuchar propuestas laborales?',
    cierre_amable:
        '¡Muchas gracias por tu tiempo, [NOMBRE_CANDIDATO]! Cualquier cosa quedo atento/a. '
        + 'Te deseo muchos éxitos y quedas en nuestra base para futuras oportunidades que se ajusten a tu perfil.'
};

/**
 * Campos del formulario de recolección (13 datos requeridos).
 * Sirven como esquema de `datos` en la preentrevista.
 */
const CAMPOS_FORMULARIO = [
    'formacion_academica',
    'tarjeta_profesional',
    'empleo_actual_salario',
    'aspiracion_salarial',
    'ciudad_residencia',
    'disponibilidad_inicio',
    'otros_procesos',
    'viajes_programados',
    'novedades',
    'fecha_nacimiento',
    'numero_cedula',
    'nombre_completo',
    'correo_electronico'
];

function buildDefaultPlantillas() {
    return { ...PLANTILLAS_DEFAULT };
}

module.exports = {
    PLANTILLA_FASES,
    PLANTILLAS_DEFAULT,
    CAMPOS_FORMULARIO,
    buildDefaultPlantillas
};
