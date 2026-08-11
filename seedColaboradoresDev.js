require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

async function seedColaboradores() {
    try {
        console.log("=== Iniciando Seed de Colaboradores (Directorio AUT-284) ===");

        // Mapeamos los colaboradores a insertar con cargos variados y de diferentes empresas
        const nuevosColaboradores = [
            { cedula: '90001', nombre: 'Juan Gomez', correo: 'juan.gomez@cinte.com', puesto: 'GP', cliente: 'Bancolombia_Test', empleador: 'Grupo Cinte', activo: true },
            { cedula: '90002', nombre: 'Laura Vargas', correo: 'laura.vargas@cinte.com', puesto: 'CAC', cliente: null, empleador: 'Grupo Cinte', activo: true },
            { cedula: '90003', nombre: 'Michael Fonseca', correo: 'mfonseca@grupocinte.com', puesto: 'Super Admin', cliente: null, empleador: 'Grupo Cinte', activo: true },
            { cedula: '90004', nombre: 'Andres Felipe', correo: 'andres.felipe@cinte.com', puesto: 'Líder Técnico', cliente: 'Davivienda_Test', empleador: 'Grupo Cinte', activo: true },
            { cedula: '90005', nombre: 'Camila Rodriguez', correo: 'camila.rodriguez@cinte.com', puesto: 'Líder Comercial', cliente: 'Sura_Test', empleador: 'Grupo Cinte', activo: true },
            
            // Consultores adicionales (algunos ya existían en el seed anterior, pero los actualizamos completo)
            { cedula: '1001', nombre: 'Carlos Ruiz', correo: 'c1@cinte.com', puesto: 'Desarrollador Java', cliente: 'Bancolombia_Test', empleador: 'Cinte Colombia', activo: true },
            { cedula: '1002', nombre: 'Ana Gomez', correo: 'c2@cinte.com', puesto: 'Analista QA', cliente: 'Bancolombia_Test', empleador: 'Cinte Colombia', activo: true },
            { cedula: '1003', nombre: 'Luis Soto', correo: 'c3@cinte.com', puesto: 'DevOps Engineer', cliente: 'Bancolombia_Test', empleador: 'Cinte Colombia', activo: true },
            
            { cedula: '1004', nombre: 'Marta Diaz', correo: 'c4@cinte.com', puesto: 'Scrum Master', cliente: 'Davivienda_Test', empleador: 'Cinte Peru', activo: true },
            { cedula: '1005', nombre: 'Pedro Perez', correo: 'c5@cinte.com', puesto: 'Tech Lead', cliente: 'Davivienda_Test', empleador: 'Cinte Peru', activo: true },
            { cedula: '1006', nombre: 'Laura Vega', correo: 'c6@cinte.com', puesto: 'UX Designer', cliente: 'Davivienda_Test', empleador: 'Cinte Peru', activo: true },
            
            { cedula: '1007', nombre: 'Jorge Luna', correo: 'c7@cinte.com', puesto: 'Data Scientist', cliente: 'Sura_Test', empleador: 'Cinte Iberia', activo: true },
            { cedula: '1008', nombre: 'Maria Paz', correo: 'c8@cinte.com', puesto: 'Data Engineer', cliente: 'Sura_Test', empleador: 'Cinte Iberia', activo: true },
            { cedula: '1009', nombre: 'Oscar Rios', correo: 'c9@cinte.com', puesto: 'Cloud Architect', cliente: 'Sura_Test', empleador: 'Cinte Iberia', activo: true },
            { cedula: '1010', nombre: 'Diana Ruiz', correo: 'c10@cinte.com', puesto: 'Backend Dev', cliente: 'Sura_Test', empleador: 'Cinte Colombia', activo: true },
            { cedula: '1011', nombre: 'Hugo Gil', correo: 'c11@cinte.com', puesto: 'Frontend Dev', cliente: 'Sura_Test', empleador: 'Cinte Colombia', activo: false }, // Inactivo para pruebas
            
            // Algunos adicionales genéricos
            { cedula: '2001', nombre: 'Elena Martinez', correo: 'elena.martinez@cinte.com', puesto: 'Consultor Funcional', cliente: 'Ecopetrol', empleador: 'Cinte Colombia', activo: true },
            { cedula: '2002', nombre: 'Diego Torres', correo: 'diego.torres@cinte.com', puesto: 'Soporte N2', cliente: 'Claro', empleador: 'Cinte Peru', activo: true }
        ];

        let insertados = 0;

        for (const colab of nuevosColaboradores) {
            // Se usa ON CONFLICT (cedula) para asegurar idempotencia.
            // Si la columna "empleador" existe en el modelo extendido, la actualizamos. Si no, solo nombre, correo_cinte, puesto, cliente.
            await pool.query(`
                INSERT INTO colaboradores (cedula, nombre, correo_cinte, cliente, puesto, empleador, activo)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (cedula) DO UPDATE SET 
                    nombre = EXCLUDED.nombre,
                    correo_cinte = EXCLUDED.correo_cinte,
                    cliente = EXCLUDED.cliente,
                    puesto = EXCLUDED.puesto,
                    empleador = EXCLUDED.empleador,
                    activo = EXCLUDED.activo;
            `, [colab.cedula, colab.nombre, colab.correo, colab.cliente, colab.puesto, colab.empleador, colab.activo]);
            insertados++;
        }

        console.log(`✅ Se insertaron/actualizaron ${insertados} colaboradores exitosamente.`);
        console.log(`\nResumen de Cargos:`);
        const cargosUnicos = [...new Set(nuevosColaboradores.map(c => c.puesto))];
        console.log(cargosUnicos.join(', '));
        
        console.log(`\nResumen de Clientes Asignados:`);
        const clientesUnicos = [...new Set(nuevosColaboradores.map(c => c.cliente).filter(Boolean))];
        console.log(clientesUnicos.join(', '));

    } catch (err) {
        console.error("Error en Seed de Colaboradores:", err);
    } finally {
        await pool.end();
    }
}

seedColaboradores();
