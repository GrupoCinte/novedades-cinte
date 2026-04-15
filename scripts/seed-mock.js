require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'novedades_cinte',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1022940836k'
});

async function main() {
  await client.connect();
  console.log("Conectado a la base de datos. Insertando datos de prueba...");

  try {
    // 1. Colaboradores (Cédula y Nombre)
    const colaboradores = [
      { cedula: "1000000001", nombre: "Juan Perez" },
      { cedula: "1000000002", nombre: "Maria Gonzalez" },
      { cedula: "1000000003", nombre: "Carlos Ramirez" },
      { cedula: "1000000004", nombre: "Ana Torres" },
      { cedula: "1000000005", nombre: "Luis Fernando Gomez" },
    ];
    for (let c of colaboradores) {
      await client.query("INSERT INTO colaboradores (cedula, nombre) VALUES ($1, $2) ON CONFLICT (cedula) DO NOTHING;", [c.cedula, c.nombre]);
    }
    console.log("✅ 5 Colaboradores creados (Cédula y Nombre).");

    // 2. Usuarios (Email, Username, Name)
    const users = [
      { email: "admin1@cinte.com", username: "admin1", full_name: "Admin Juan", role: "super_admin", area: "Global" },
      { email: "nomina1@cinte.com", username: "nomina1", full_name: "Nomina Maria", role: "nomina", area: "Global" },
      { email: "ch1@cinte.com", username: "ch1", full_name: "CH Carlos", role: "admin_ch", area: "Capital Humano" },
      { email: "gp1@cinte.com", username: "gp1", full_name: "GP Ana", role: "gp", area: "Operaciones" },
      { email: "lider1@cinte.com", username: "lider1", full_name: "Lider Luis", role: "team_ch", area: "Operaciones" },
    ];
    const crypto = require('crypto');
    const defaultPassword = 'Admin123*';
    const pwdHash = crypto.createHash('sha256').update(defaultPassword).digest('hex');

    for (let u of users) {
      await client.query("INSERT INTO users (email, username, full_name, role, area, password_hash) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;", [u.email, u.username, u.full_name, u.role, u.area, pwdHash]);
    }
    console.log("✅ 5 Usuarios de sistema creados (con Correo Electrónico).");

    // 3. Clientes y Lideres
    const clientesLideres = [
      { cliente: "Bancolombia", lider: "Luis Fernando Gomez" },
      { cliente: "Ecopetrol", lider: "Marta Rodriguez" },
      { cliente: "Grupo Aval", lider: "Pedro Sanchez" },
      { cliente: "Claro", lider: "Camilo Torres" },
      { cliente: "Nutresa", lider: "Diana Vargas" },
    ];
    for (let cl of clientesLideres) {
      await client.query("INSERT INTO clientes_lideres (cliente, lider) VALUES ($1, $2) ON CONFLICT (cliente, lider) DO NOTHING;", [cl.cliente, cl.lider]);
    }
    console.log("✅ 5 Registros de Clientes y Líderes creados.");

    // 4. Novedades de prueba (Hora Extra)
    const novedades = [
      {
        nombre: "Juan Perez",
        cedula: "1000000001",
        tipo_novedad: "Hora Extra",
        fecha_inicio: "2026-04-10",
        fecha_fin: "2026-04-10",
        hora_inicio: "17:00:00",
        hora_fin: "20:00:00",
        cantidad_horas: 3,
        horas_diurnas: 2,
        horas_nocturnas: 1,
        estado: "Pendiente"
      },
      {
        nombre: "Maria Gonzalez",
        cedula: "1000000002",
        tipo_novedad: "Hora Extra",
        fecha_inicio: "2026-04-10",
        fecha_fin: "2026-04-10",
        hora_inicio: "20:00:00",
        hora_fin: "22:00:00",
        cantidad_horas: 2,
        horas_diurnas: 0,
        horas_nocturnas: 2,
        estado: "Pendiente"
      }
    ];

    for (let n of novedades) {
      await client.query(
        "INSERT INTO novedades (nombre, cedula, tipo_novedad, fecha_inicio, fecha_fin, hora_inicio, hora_fin, cantidad_horas, horas_diurnas, horas_nocturnas, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [n.nombre, n.cedula, n.tipo_novedad, n.fecha_inicio, n.fecha_fin, n.hora_inicio, n.hora_fin, n.cantidad_horas, n.horas_diurnas, n.horas_nocturnas, n.estado]
      );
    }
    console.log("✅ 2 Novedades de prueba (Hora Extra) creadas.");

  } catch (err) {
    console.error("❌ Error insertando datos:", err);
  } finally {
    await client.end();
  }
}

main();
