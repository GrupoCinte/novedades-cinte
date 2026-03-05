require('dotenv').config();
const express = require('express');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3005;

// Configuración para recibir datos grandes (soportes en Base64)
app.use(express.json({ limit: '50mb' }));

// SERVIR ARCHIVOS ESTÁTICOS
// 1. La carpeta public para los HTML
app.use(express.static(path.join(__dirname, 'public')));
// 2. La carpeta assets para el logo (fuera de public)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// MULTER Config para adjuntos
const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext)
    }
});
const upload = multer({ storage: storage });

const EXCEL_PATH = path.join(__dirname, 'datos_novedades.xlsx');

// Función para gestionar el Excel
function obtenerDatosExcel() {
    if (!fs.existsSync(EXCEL_PATH)) {
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet([]);
        xlsx.utils.book_append_sheet(wb, ws, "Novedades");
        xlsx.writeFile(wb, EXCEL_PATH);
        return [];
    }
    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
}

const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secreto-por-defecto';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Middleware para verificar el Token JWT
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        next();
    });
};

// API: Autenticación (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
        console.error('⚠️ ADMIN_PASSWORD no configurada en .env');
        return res.status(500).json({ error: 'Servidor no configurado' });
    }
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ username, role: 'admin' }, SECRET_KEY, { expiresIn: EXPIRES_IN });
        return res.json({ success: true, token });
    }

    res.status(401).json({ error: 'Credenciales inválidas' });
});

// API: Obtener registros para el Dashboard (PROTEGIDO)
app.get('/api/novedades', verificarToken, (req, res) => {
    res.json({ items: obtenerDatosExcel() });
});

// API: Guardar novedad
app.post('/api/enviar-novedad', upload.single('soporte'), (req, res) => {
    try {
        const datos = obtenerDatosExcel();
        const archivoRuta = req.file ? `/assets/uploads/${req.file.filename}` : null;
        const nuevaNovedad = {
            ...req.body,
            soporteRuta: archivoRuta,
            creadoEn: new Date().toISOString(),
            estado: 'Pendiente'
        };
        datos.push(nuevaNovedad);
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(datos);
        xlsx.utils.book_append_sheet(wb, ws, "Novedades");
        xlsx.writeFile(wb, EXCEL_PATH);
        console.log("✅ Registro guardado:", nuevaNovedad.nombre);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Error al guardar" });
    }
});
// API: Actualizar estado de novedad (PROTEGIDO)
app.post('/api/actualizar-estado', verificarToken, (req, res) => {
    try {
        const { id, nuevoEstado } = req.body;
        const datos = obtenerDatosExcel();

        const index = datos.findIndex(d => d.creadoEn === id);
        if (index !== -1) {
            datos[index].estado = nuevoEstado;
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(datos);
            xlsx.utils.book_append_sheet(wb, ws, "Novedades");
            xlsx.writeFile(wb, EXCEL_PATH);
            console.log(`✅ Estado actualizado: ${id} -> ${nuevoEstado}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Registro no encontrado" });
        }
    } catch (error) {
        console.error("❌ Error al actualizar estado:", error);
        res.status(500).json({ error: "Error al actualizar" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
    console.log(`📂 Carpeta assets: ${path.join(__dirname, 'assets')}`);
});