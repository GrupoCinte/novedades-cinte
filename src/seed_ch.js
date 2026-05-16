const { Pool } = require('pg');

async function seed() {
    const pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'novedades_cinte',
        user: 'cinte_app',
        password: '1022940836k'
    });

    const novedades = [
        {
            nombre: 'Juan Perez',
            cedula: '12345678',
            correo_solicitante: 'juan.perez@example.com',
            cliente: 'CLIENTE A',
            lider: 'LIDER A',
            tipo_novedad: 'Incapacidad',
            area: 'Capital Humano',
            fecha_inicio: '2026-05-01',
            fecha_fin: '2026-05-05',
            estado: 'Pendiente'
        },
        {
            nombre: 'Maria Lopez',
            cedula: '87654321',
            correo_solicitante: 'maria.lopez@example.com',
            cliente: 'CLIENTE B',
            lider: 'LIDER B',
            tipo_novedad: 'Licencia de luto',
            area: 'Capital Humano',
            fecha_inicio: '2026-05-10',
            fecha_fin: '2026-05-13',
            estado: 'Pendiente'
        },
        {
            nombre: 'Carlos Ruiz',
            cedula: '11223344',
            correo_solicitante: 'carlos.ruiz@example.com',
            cliente: 'CLIENTE A',
            lider: 'LIDER A',
            tipo_novedad: 'Permiso remunerado',
            area: 'Capital Humano',
            fecha_inicio: '2026-05-15',
            fecha_fin: '2026-05-15',
            estado: 'Pendiente'
        },
        {
            nombre: 'Ana Gomez',
            cedula: '44332211',
            correo_solicitante: 'ana.gomez@example.com',
            cliente: 'CLIENTE C',
            lider: 'LIDER C',
            tipo_novedad: 'Licencia de maternidad',
            area: 'Capital Humano',
            fecha_inicio: '2026-06-01',
            fecha_fin: '2026-09-01',
            estado: 'Pendiente'
        }
    ];

    try {
        console.log('Iniciando siembra de datos de prueba...');
        for (const n of novedades) {
            await pool.query(
                `INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, tipo_novedad, area, fecha_inicio, fecha_fin, estado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [n.nombre, n.cedula, n.correo_solicitante, n.cliente, n.lider, n.tipo_novedad, n.area, n.fecha_inicio, n.fecha_fin, n.estado]
            );
            console.log(`Insertada novedad para ${n.nombre}`);
        }
        console.log('Siembra completada con éxito.');
    } catch (error) {
        console.error('Error al sembrar datos:', error);
    } finally {
        await pool.end();
    }
}

seed();
