require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

async function seed() {
    try {
        console.log("=== Iniciando Seed de Datos de Seguimiento (AUT-284) ===");

        // 1. Obtener usuarios reales
        console.log("Buscando usuarios existentes...");
        const gpRes = await pool.query(`SELECT id, email FROM users WHERE role = 'gp' LIMIT 1`);
        if (gpRes.rowCount === 0) throw new Error("No hay usuarios GP en la DB. Crea uno desde la interfaz primero.");
        const gpId = gpRes.rows[0].id;
        const gpEmail = gpRes.rows[0].email;

        const cacRes = await pool.query(`SELECT id, email FROM users WHERE role = 'cac' LIMIT 1`);
        const saRes = await pool.query(`SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1`);
        const cacEmail = cacRes.rowCount > 0 ? cacRes.rows[0].email : 'N/A';
        const saEmail = saRes.rowCount > 0 ? saRes.rows[0].email : 'N/A';

        // Limpiar data anterior generada por este script
        console.log("Limpiando datos de prueba anteriores...");
        await pool.query(`DELETE FROM clientes_lideres WHERE cliente IN ('Bancolombia_Test', 'Davivienda_Test', 'Sura_Test')`);
        await pool.query(`DELETE FROM seguimiento_acta WHERE cliente IN ('Bancolombia_Test', 'Davivienda_Test', 'Sura_Test')`);

        // 2. Usar Consultores Existentes o generar mock local
        console.log("Buscando consultores en la base de datos...");
        const colabRes = await pool.query(`SELECT cedula, nombre FROM colaboradores LIMIT 15`);
        
        let consultores = colabRes.rows;
        if (consultores.length < 10) {
            consultores = [
                { cedula: '1001', nombre: 'Carlos Ruiz' },
                { cedula: '1002', nombre: 'Ana Gomez' },
                { cedula: '1003', nombre: 'Luis Soto' },
                { cedula: '1004', nombre: 'Marta Diaz' },
                { cedula: '1005', nombre: 'Pedro Perez' },
                { cedula: '1006', nombre: 'Laura Vega' },
                { cedula: '1007', nombre: 'Jorge Luna' },
                { cedula: '1008', nombre: 'Maria Paz' },
                { cedula: '1009', nombre: 'Oscar Rios' },
                { cedula: '1010', nombre: 'Diana Ruiz' },
                { cedula: '1011', nombre: 'Hugo Gil' }
            ];
        }

        // 3. Asignar Cartera al GP
        console.log("Asignando cartera al GP (" + gpEmail + ")...");
        const clientes = ['Bancolombia_Test', 'Davivienda_Test', 'Sura_Test'];
        for (const cliente of clientes) {
            await pool.query(`
                INSERT INTO clientes_lideres (id, cliente, lider, gp_user_id)
                VALUES ($1, $2, $3, $4)
            `, [uuidv4(), cliente, 'Líder ' + cliente, gpId]);
        }

        // 4. Crear Actas de Seguimiento
        console.log("Creando actas de seguimiento...");

        const actasSeed = [
            {
                tipo: 'consultor',
                estado: 'FINALIZADO',
                cliente: 'Bancolombia_Test',
                participantes: [consultores[0]], // 1 participante
                fecha: '2026-08-01',
                inicio: '08:00',
                fin: '09:00',
                objetivo: 'Revisar avance del sprint y desempeño del mes en curso.',
                agenda: [{ id: uuidv4(), tema: 'Desempeño mensual', duracion: '45 min' }, { id: uuidv4(), tema: 'Novedades de nómina', duracion: '15 min' }],
                planes: [
                    { id: uuidv4(), tarea: 'Ajustar acceso VPN corporativo', responsable: consultores[0].nombre, fecha: '2026-08-10', criticidad: 'Alta', recursos: 'Ticket Helpdesk' },
                    { id: uuidv4(), tarea: 'Ajustar configuracion de IDE', responsable: consultores[0].nombre, fecha: '2026-08-11', criticidad: 'Baja', recursos: 'Local' }
                ],
                desarrolloConsultores: {
                    [consultores[0].cedula]: {
                        desempeno: consultores[0].nombre + ' ha demostrado un excelente dominio técnico en las herramientas de Java. Ha cumplido con todas las historias de usuario.',
                        oportunidades: 'Mejorar los tiempos de revisión de código (PRs) de otros compañeros.',
                        riesgos: 'Riesgo de sobrecarga de trabajo si no se delegan algunas tareas del sprint actual.'
                    }
                }
            },
            {
                tipo: 'consultor',
                estado: 'FINALIZADO',
                cliente: 'Davivienda_Test',
                participantes: [consultores[3], consultores[4], consultores[5]], // 3 participantes
                fecha: '2026-08-03',
                inicio: '10:00',
                fin: '11:30',
                objetivo: 'Alineación estratégica del equipo ágil con el Tech Lead y diseño UX.',
                agenda: [{ id: uuidv4(), tema: 'Planificación de Q3', duracion: '1 hr' }, { id: uuidv4(), tema: 'Revisión de deuda técnica', duracion: '30 min' }],
                planes: [
                    { id: uuidv4(), tarea: 'Documentar arquitectura cloud', responsable: consultores[4].nombre, fecha: '2026-08-20', criticidad: 'Media', recursos: 'Confluence' },
                    { id: uuidv4(), tarea: 'Diseñar wireframes del onboarding', responsable: consultores[5].nombre, fecha: '2026-08-15', criticidad: 'Alta', recursos: 'Figma' },
                    { id: uuidv4(), tarea: 'Actualizar métricas de velocidad', responsable: consultores[3].nombre, fecha: '2026-08-12', criticidad: 'Baja', recursos: 'Jira' }
                ],
                desarrolloConsultores: {
                    [consultores[3].cedula]: { desempeno: 'Excelente gestión de las ceremonias ágiles.', oportunidades: 'Ninguna relevante.', riesgos: 'Dependencia con otros equipos.' },
                    [consultores[4].cedula]: { desempeno: 'Liderazgo técnico sólido en la migración a AWS.', oportunidades: 'Involucrar más a los junior.', riesgos: 'Brechas de seguridad en IAM.' },
                    [consultores[5].cedula]: { desempeno: 'Propuestas de UI muy innovadoras.', oportunidades: 'Alinear los componentes con el Design System global.', riesgos: 'Retrasos por aprobación del cliente.' }
                }
            },
            {
                tipo: 'cliente',
                estado: 'FINALIZADO',
                cliente: 'Sura_Test',
                participantes: [consultores[6], consultores[7], consultores[8], consultores[9], consultores[10]], // 5 participantes
                fecha: '2026-08-04',
                inicio: '14:00',
                fin: '16:00',
                objetivo: 'Revisión mensual de indicadores de servicio e impacto del equipo de datos y arquitectura.',
                agenda: [{ id: uuidv4(), tema: 'Kpis de rendimiento', duracion: '1 hr' }, { id: uuidv4(), tema: 'Feedback de líderes', duracion: '1 hr' }],
                planes: [
                    { id: uuidv4(), tarea: 'Presentar reporte de automatización', responsable: 'Líder Sura', fecha: '2026-08-25', criticidad: 'Alta', recursos: 'PowerBI' },
                    { id: uuidv4(), tarea: 'Evaluar costos de infraestructura', responsable: consultores[8].nombre, fecha: '2026-08-30', criticidad: 'Alta', recursos: 'AWS Cost Explorer' },
                    { id: uuidv4(), tarea: 'Solicitar accesos DB de QA', responsable: consultores[7].nombre, fecha: '2026-08-15', criticidad: 'Media', recursos: 'Service Now' }
                ],
                desarrolloCliente: {
                    temasHablados: 'Se evaluaron los indicadores de los 5 consultores asignados a la célula de Big Data. El cliente destaca el trabajo del Arquitecto Cloud pero solicita mejorar la velocidad de entrega del equipo de Frontend.',
                    compromisosGenerales: 'El GP se compromete a realizar un acompañamiento más cercano a los desarrolladores junior.'
                }
            },
            {
                tipo: 'consultor',
                estado: 'BORRADOR',
                cliente: 'Davivienda_Test',
                participantes: [consultores[3], consultores[5], consultores[4]], // Varios participantes en borrador
                fecha: '2026-08-05',
                inicio: '16:00',
                fin: '17:00',
                objetivo: 'Revisión rápida de bloqueo en producción por error en pipeline.',
                agenda: [{ id: uuidv4(), tema: 'Análisis de Bug Crítico', duracion: '1 hr' }],
                planes: [
                    { id: uuidv4(), tarea: 'Ejecutar rollback en prod', responsable: consultores[4].nombre, fecha: '2026-08-05', criticidad: 'Alta', recursos: 'Gitlab' }
                ],
                desarrolloConsultores: {
                    [consultores[3].cedula]: { desempeno: 'Coordinando resolución', oportunidades: '', riesgos: 'Alto impacto en negocio' },
                    [consultores[4].cedula]: { desempeno: 'Revisando logs del servidor', oportunidades: '', riesgos: '' },
                    [consultores[5].cedula]: { desempeno: 'Revisando afectación UI', oportunidades: '', riesgos: '' }
                }
            }
        ];

        for (const actaData of actasSeed) {
            const actaId = uuidv4();
            const payload = {
                fechaReunion: actaData.fecha,
                horaInicio: actaData.inicio,
                horaFin: actaData.fin,
                responsableNombre: 'Gerente Pruebas', 
                responsableCargo: 'GP Senior',
                objetivo: actaData.objetivo,
                agenda: actaData.agenda,
                planesAccion: actaData.planes,
                proximaReunion: 'Mensual'
            };

            if (actaData.tipo === 'consultor') {
                payload.desarrolloConsultores = actaData.desarrolloConsultores;
            } else {
                payload.desarrolloCliente = actaData.desarrolloCliente;
            }

            const finalizadoAt = actaData.estado === 'FINALIZADO' ? new Date().toISOString() : null;

            await pool.query(`
                INSERT INTO seguimiento_acta (id, tipo, estado, cliente, gp_id, fecha_acta, payload_json, finalizado_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [actaId, actaData.tipo, actaData.estado, actaData.cliente, gpId, actaData.fecha, JSON.stringify(payload), finalizadoAt]);

            // Participantes
            for (const p of actaData.participantes) {
                await pool.query(`
                    INSERT INTO seguimiento_participante (acta_id, rol, cedula, email, nombre)
                    VALUES ($1, 'consultor', $2, $3, $4)
                `, [actaId, p.cedula, p.email || (p.cedula + '@cinte.com'), p.nombre]);
            }
        }

        console.log("=== Seed de Datos Completado con Éxito ===");
        console.log("------------------------------------------");
        console.log("Actas creadas:");
        console.log(" - Acta Bancolombia_Test (Consultor, 1 participante, FINALIZADO)");
        console.log(" - Acta Davivienda_Test (Consultor, 3 participantes, FINALIZADO)");
        console.log(" - Acta Sura_Test (Cliente, 5 participantes, FINALIZADO)");
        console.log(" - Acta Davivienda_Test (Consultor, 3 participantes, BORRADOR)");
        console.log("------------------------------------------");
        console.log("¡Carga exitosa! Puedes iniciar sesión con uno de los siguientes usuarios para probar (la contraseña suele ser la estándar de dev):");
        console.log(`- GP (con las actas asignadas): ${gpEmail}`);
        console.log(`- CAC (acceso global): ${cacEmail}`);
        console.log(`- Super Admin (acceso global): ${saEmail}`);

    } catch (err) {
        console.error("Error en Seed:", err);
    } finally {
        await pool.end();
    }
}

seed();
