require('dotenv').config();
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// ─── Carpeta de uploads ──────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Minimal PDF válido ──────────────────────────────────────────────────────
function makePDF(titulo, empleado, tipo) {
    return `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 180>>
stream
BT
/F1 18 Tf
50 750 Td
(GRUPO CINTE - SOPORTE DE NOVEDAD) Tj
/F1 13 Tf
0 -40 Td
(Empleado: ${empleado}) Tj
0 -25 Td
(Tipo: ${tipo}) Tj
0 -25 Td
(Documento de soporte generado para: ${titulo}) Tj
0 -25 Td
(Fecha: ${new Date().toLocaleDateString('es-CO')}) Tj
ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000506 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
587
%%EOF`;
}

// ─── Datos de prueba ─────────────────────────────────────────────────────────
const empleados = [
    { nombre: 'María Fernanda Gómez', cedula: '1020345678', correo: 'mfgomez@cinte.com.co' },
    { nombre: 'Carlos Andrés Ramírez', cedula: '1087654321', correo: 'caramirez@cinte.com.co' },
    { nombre: 'Valentina Torres Ruiz', cedula: '1098765432', correo: 'vtorres@cinte.com.co' },
    { nombre: 'Sebastián López Mora', cedula: '1123456789', correo: 'slopez@cinte.com.co' },
    { nombre: 'Daniela Martínez Cruz', cedula: '1034567890', correo: 'dmartinez@cinte.com.co' },
    { nombre: 'Juan Pablo Herrera', cedula: '1045678901', correo: 'jpherrera@cinte.com.co' },
    { nombre: 'Luisa Fernanda Peña', cedula: '1056789012', correo: 'lfpena@cinte.com.co' },
    { nombre: 'Andrés Felipe Silva', cedula: '1067890123', correo: 'afsilva@cinte.com.co' },
    { nombre: 'Natalia Ospina Vega', cedula: '1078901234', correo: 'nospina@cinte.com.co' },
    { nombre: 'Santiago Moreno Díaz', cedula: '1089012345', correo: 'smoreno@cinte.com.co' },
];

const tipos = [
    { tipo: 'Incapacidad', horas: '0', turno: 'N/A' },
    { tipo: 'Vacaciones', horas: '0', turno: 'N/A' },
    { tipo: 'Permiso', horas: '4', turno: 'N/A' },
    { tipo: 'Hora extra', horas: '6', turno: 'Nocturna' },
    { tipo: 'Licencia', horas: '0', turno: 'N/A' },
    { tipo: 'Hora extra', horas: '8', turno: 'Dominical' },
    { tipo: 'Permiso', horas: '2', turno: 'N/A' },
    { tipo: 'Incapacidad', horas: '0', turno: 'N/A' },
    { tipo: 'Vacaciones', horas: '0', turno: 'N/A' },
    { tipo: 'Licencia', horas: '0', turno: 'N/A' },
];

// 15 registros — todos Pendiente, distintas fechas de 2026
const fechasBase = [
    ['2026-02-03', '2026-02-05'],
    ['2026-02-10', '2026-02-10'],
    ['2026-02-14', '2026-02-20'],
    ['2026-02-17', '2026-02-17'],
    ['2026-02-21', '2026-02-28'],
    ['2026-02-24', '2026-02-24'],
    ['2026-03-01', '2026-03-03'],
    ['2026-03-01', '2026-03-01'],
    ['2026-03-03', '2026-03-07'],
    ['2026-03-03', '2026-03-03'],
    ['2026-03-04', '2026-03-04'],
    ['2026-03-04', '2026-03-10'],
    ['2026-03-04', '2026-03-04'],
    ['2026-03-04', '2026-03-04'],
    ['2026-03-04', '2026-03-04'],
];

// ─── Generar archivos y registros ────────────────────────────────────────────
const novedades = [];

for (let i = 0; i < 15; i++) {
    const emp = empleados[i % empleados.length];
    const t = tipos[i % tipos.length];
    const [fi, ff] = fechasBase[i];
    const ts = new Date(2026, 1 + Math.floor(i / 5), (i * 2) % 28 + 1, 8 + i % 10, 0, 0).toISOString();

    // Nombre de archivo PDF
    const filename = `soporte-${Date.now()}-${i}.pdf`;
    const filepath = path.join(uploadDir, filename);

    // Escribir PDF placeholder
    fs.writeFileSync(filepath, makePDF(`Novedad ${i + 1}`, emp.nombre, t.tipo));
    console.log(`✅ Creado: ${filename}`);

    novedades.push({
        nombre: emp.nombre,
        cedula: emp.cedula,
        correoSolicitante: emp.correo,
        tipoNovedad: t.tipo,
        fechaInicio: fi,
        fechaFin: ff,
        cantidadHoras: t.horas,
        tipoHoraExtra: t.turno,
        soporteRuta: `/assets/uploads/${filename}`,
        creadoEn: ts,
        estado: 'Pendiente',
    });
}

// ─── Leer Excel existente y agregar registros ────────────────────────────────
const EXCEL_PATH = path.join(__dirname, 'datos_novedades.xlsx');

let existentes = [];
if (fs.existsSync(EXCEL_PATH)) {
    const wb0 = xlsx.readFile(EXCEL_PATH);
    const ws0 = wb0.Sheets[wb0.SheetNames[0]];
    existentes = xlsx.utils.sheet_to_json(ws0);
    console.log(`📂 Registros existentes: ${existentes.length}`);
}

const todos = [...existentes, ...novedades];

const wb = xlsx.utils.book_new();
const ws = xlsx.utils.json_to_sheet(todos);
xlsx.utils.book_append_sheet(wb, ws, 'Novedades');
xlsx.writeFile(wb, EXCEL_PATH);

console.log(`\n🎉 Excel actualizado: ${todos.length} registros totales (${novedades.length} nuevos pendientes)`);
