require('dotenv').config();
const express = require('express');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3005;

// =========================
// Body parser (JSON grande)
// =========================
app.use(express.json({ limit: '50mb' })); // ¡DEBE estar antes de las rutas!

// =========================
// Estáticos
// =========================
app.use(express.static(path.join(__dirname, 'public')));            // HTML si lo usas
app.use('/assets', express.static(path.join(__dirname, 'assets'))); // logo, uploads, etc.

// =========================
// Excel (persistencia)
// =========================
const EXCEL_PATH = path.join(__dirname, 'datos_novedades.xlsx');

function obtenerDatosExcel() {
  if (!fs.existsSync(EXCEL_PATH)) {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet([]);
    xlsx.utils.book_append_sheet(wb, ws, 'Novedades');
    xlsx.writeFile(wb, EXCEL_PATH);
    return [];
  }
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
}

function guardarDatosExcel(lista) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(lista);
  xlsx.utils.book_append_sheet(wb, ws, 'Novedades');
  xlsx.writeFile(wb, EXCEL_PATH);
}

// =========================
// Multer: uploads (PDF/JPG/PNG ≤ 5 MB)
// =========================
const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_').slice(0, 40);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file) return cb(null, true);
    if (allowedMimes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG o PNG.'));
  },
});

// =========================
// JWT / Auth
// =========================
const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secreto-por-defecto';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Usuarios DEMO (passwordPlain: 123456)
const USERS = [
  { id:'u1', email:'rh.admin@empresa.com',  name:'Admin CH',  role:'admin_ch',  area:'Capital Humano', panels:['dashboard','calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },
  { id:'u2', email:'ops.admin@empresa.com', name:'Admin OPS', role:'admin_ops', area:'Operaciones',    panels:['dashboard','calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },
  { id:'u3', email:'gp@empresa.com',        name:'Gerente',   role:'gp',        area:'Operaciones',    panels:['calendar','gestion'],             passwordPlain:'123456', passwordVersion:0 },
  { id:'u4', email:'team.rh@empresa.com',   name:'Team CH',   role:'team_ch',   area:'Capital Humano', panels:['calendar','gestion'],             passwordPlain:'123456', passwordVersion:0 },
];

function emitirToken(user) {
  return jwt.sign({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    area: user.area,
    panels: user.panels,
    pwdv: user.passwordVersion || 0,
  }, SECRET_KEY, { expiresIn: EXPIRES_IN });
}

function verificarToken(req, res, next) {
  const h = req.headers['authorization'] || '';
  const [, token] = h.split(' ');
  if (!token) return res.status(401).json({ error:'Acceso denegado. Token no proporcionado.' });
  try {
    const claims = jwt.verify(token, SECRET_KEY);
    req.user = claims;
    next();
  } catch {
    return res.status(403).json({ error:'Token inválido o expirado.' });
  }
}

function findUserByEmailOrAlias(val) {
  const v = String(val || '').trim().toLowerCase();
  if (!v) return null;
  return (
    USERS.find(u => u.email.toLowerCase() === v) ||
    USERS.find(u => u.email.split('@')[0].toLowerCase() === v) ||
    USERS.find(u => (u.role || '').toLowerCase() === v)
  );
}

// =========================
// RBAC middlewares
// =========================
const POLICY = {
  admin_ch:  { panels: ['dashboard','calendar','gestion'] },
  admin_ops: { panels: ['dashboard','calendar','gestion'] },
  gp:        { panels: ['calendar','gestion'] },
  team_ch:   { panels: ['calendar','gestion'] },
};

function allowPanel(panel) {
  return (req, res, next) => {
    const role = req.user?.role;
    const conf = POLICY[role];
    if (!conf) return res.status(403).json({ ok:false, message:'Rol no autorizado' });
    if (!conf.panels.includes(panel)) {
      return res.status(403).json({ ok:false, message:`Sin permiso para el panel: ${panel}` });
    }
    next();
  };
}

function applyScope(req, res, next) {
  const userArea = (req.user?.area && String(req.user.area)) || '';
  req.scope = {
    areas: userArea ? [userArea] : [], // si viene vacía, no filtra (compatibilidad)
    role: req.user?.role || '',
    userId: req.user?.sub || '',
  };
  next();
}

function filterByAreas(list, areas) {
  if (!Array.isArray(list)) return [];
  if (!areas || areas.length === 0) return list;
  return list.filter(item => !item.area || areas.includes(item.area)); // si no tiene area, lo dejamos
}

// =========================
// Login + perfil
// =========================
app.post('/api/login', (req, res) => {
  try {
    const body = req.body || {};
    const { email, username, password } = body;
    console.log('[LOGIN] body:', body);

    // 🔒 Nuevo esquema por roles (email / alias / rol) + 123456
    const userId = (email || username || '').toLowerCase().trim();
    if (!userId || !password) {
      return res.status(400).json({ ok:false, message:'Usuario y contraseña son obligatorios' });
    }

    const user = findUserByEmailOrAlias(userId);
    if (!user || password !== user.passwordPlain) {
      return res.status(401).json({ ok:false, message:'Credenciales inválidas' }); // <— NUEVO FORMATO
    }

    const token = emitirToken(user);
    return res.json({
      ok: true,
      token,
      user: { id:user.id, email:user.email, name:user.name, role:user.role, area:user.area, panels:user.panels },
    });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ ok:false, message:'Error interno' });
  }
});

app.get('/api/me', verificarToken, (req, res) => {
  res.json({ ok: true, me: req.user });
});

// =========================
// Forgot / Reset / Change password (DEV friendly)
// =========================
const RESET_TOKENS = new Map(); // token -> { userId, exp }

function isStrongPassword(pw='') {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);
}

app.post('/api/auth/forgot-password', (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, message:'Email es obligatorio' });

    const user = findUserByEmailOrAlias(email);
    // No revelar existencia
    if (!user) return res.json({ ok:true, message:'Si el email existe, se envió instrucción' });

    const resetToken = jwt.sign({ sub:user.id, purpose:'reset' }, SECRET_KEY, { expiresIn:'15m' });
    RESET_TOKENS.set(resetToken, { userId:user.id, exp: Date.now() + 15*60*1000 });

    const resetUrl = `http://localhost:5173/admin/reset?token=${encodeURIComponent(resetToken)}`; // ajusta si usas otro puerto FE
    console.log('🔗 Reset DEV:', resetUrl);
    res.json({ ok:true, message:'Si el email existe, se envió instrucción', resetUrl });
  } catch (e) {
    console.error('forgot error', e);
    res.status(500).json({ ok:false, message:'Error interno' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ ok:false, message:'Token y nueva contraseña son obligatorios' });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ ok:false, message:'La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.' });
    }

    let claims;
    try { claims = jwt.verify(token, SECRET_KEY); }
    catch { return res.status(400).json({ ok:false, message:'Token inválido o expirado' }); }
    if (claims.purpose !== 'reset') return res.status(400).json({ ok:false, message:'Token inválido' });

    const rec = RESET_TOKENS.get(token);
    if (!rec || rec.userId !== claims.sub || rec.exp < Date.now()) {
      return res.status(400).json({ ok:false, message:'Token ya utilizado o expirado' });
    }

    const user = USERS.find(u => u.id === claims.sub);
    if (!user) return res.status(404).json({ ok:false, message:'Usuario no encontrado' });

    user.passwordPlain = newPassword;
    user.passwordVersion = (user.passwordVersion || 0) + 1;
    RESET_TOKENS.delete(token);

    res.json({ ok:true, message:'Contraseña actualizada. Inicia sesión nuevamente.' });
  } catch (e) {
    console.error('reset error', e);
    res.status(500).json({ ok:false, message:'Error interno' });
  }
});

app.post('/api/auth/change-password', verificarToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok:false, message:'Contraseña actual y nueva son obligatorias' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ ok:false, message:'La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.' });
    }

    const user = USERS.find(u => u.id === req.user.sub);
    if (!user) return res.status(404).json({ ok:false, message:'Usuario no encontrado' });
    if (currentPassword !== user.passwordPlain) {
      return res.status(401).json({ ok:false, message:'La contraseña actual no es correcta' });
    }

    user.passwordPlain = newPassword;
    user.passwordVersion = (user.passwordVersion || 0) + 1;

    res.json({ ok:true, message:'Contraseña actualizada. Vuelve a iniciar sesión.' });
  } catch (e) {
    console.error('change-pw error', e);
    res.status(500).json({ ok:false, message:'Error interno' });
  }
});

// =========================
// Dashboard (métricas) — protegido + RBAC + scope por área
// =========================
app.get('/api/dashboard/metrics', verificarToken, allowPanel('dashboard'), applyScope, (req, res) => {
  const list = filterByAreas(obtenerDatosExcel(), req.scope.areas);

  const total = list.length;
  const porEstado = list.reduce((acc, n) => {
    const v = String(n.estado || '').toLowerCase();
    const e = v.includes('pend') ? 'Pendiente' : v.includes('aprob') ? 'Aprobado' : v.includes('rech') ? 'Rechazado' : (n.estado || '—');
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {});

  res.json({ ok:true, data: { total, porEstado, areaScope: req.scope.areas[0] || 'Todas' } });
});

// =========================
// Novedades — listado (protegido + scope por área)
// =========================
app.get('/api/novedades', verificarToken, applyScope, (req, res) => {
  const { limit } = req.query;
  let list = filterByAreas(obtenerDatosExcel(), req.scope.areas);
  if (limit) list = list.slice(0, Number(limit));
  res.json({ ok:true, data:list, items:list }); // compatibilidad con FE
});

// =========================
// Enviar novedad — público (o protégelo si quieres)
// =========================
app.post('/api/enviar-novedad', upload.single('soporte'), (req, res) => {
  try {
    const datos = obtenerDatosExcel();
    const archivoRuta = req.file ? `/assets/uploads/${req.file.filename}` : null;

    // Intenta inferir área desde token si viene (no obligatorio)
    let area = 'Operaciones';
    try {
      const h = req.headers['authorization'] || '';
      const [, token] = h.split(' ');
      if (token) {
        const claims = jwt.verify(token, SECRET_KEY);
        if (claims?.area) area = String(claims.area);
      }
    } catch { /* sin token válido, dejo por defecto */ }

    const nuevaNovedad = {
      ...req.body,
      soporteRuta: archivoRuta,
      creadoEn: new Date().toISOString(),
      estado: 'Pendiente',
      area,
    };

    datos.push(nuevaNovedad);
    guardarDatosExcel(datos);

    console.log('✅ Registro guardado:', nuevaNovedad.nombre);
    res.json({ ok:true });
  } catch (error) {
    console.error('❌ Error /api/enviar-novedad:', error);
    res.status(500).json({ ok:false, error:'Error al guardar' });
  }
});

// =========================
// Actualizar estado — protegido (gestión)
// =========================
app.post('/api/actualizar-estado', verificarToken, allowPanel('gestion'), applyScope, (req, res) => {
  try {
    const { id, nuevoEstado } = req.body || {};
    if (!id || !nuevoEstado) return res.status(400).json({ ok:false, error:'id y nuevoEstado son obligatorios' });

    const datos = obtenerDatosExcel();
    const idx = datos.findIndex(d => d.creadoEn === id || d.id === id);
    if (idx === -1) return res.status(404).json({ ok:false, error:'Registro no encontrado' });

    const item = datos[idx];
    if (req.scope.areas.length && item.area && !req.scope.areas.includes(item.area)) {
      return res.status(403).json({ ok:false, error:'No autorizado sobre esta área' });
    }

    datos[idx].estado = nuevoEstado;
    guardarDatosExcel(datos);

    console.log(`✅ Estado actualizado: ${id} -> ${nuevoEstado}`);
    res.json({ ok:true });
  } catch (error) {
    console.error('❌ Error /api/actualizar-estado:', error);
    res.status(500).json({ ok:false, error:'Error al actualizar' });
  }
});

// =========================
// Fallback REST: aprobar / rechazar
// =========================
app.post('/api/novedades/:id/approve', verificarToken, allowPanel('gestion'), applyScope, (req, res) => {
  try {
    const { id } = req.params;
    const datos = obtenerDatosExcel();
    const idx = datos.findIndex(d => d.creadoEn === id || d.id === id);
    if (idx === -1) return res.status(404).json({ ok:false, error:'Registro no encontrado' });

    const item = datos[idx];
    if (req.scope.areas.length && item.area && !req.scope.areas.includes(item.area)) {
      return res.status(403).json({ ok:false, error:'No autorizado sobre esta área' });
    }

    datos[idx].estado = 'Aprobado';
    guardarDatosExcel(datos);
    res.json({ ok:true, data: datos[idx] });
  } catch (e) {
    console.error('approve error', e);
    res.status(500).json({ ok:false, error:'Error al aprobar' });
  }
});

app.post('/api/novedades/:id/reject', verificarToken, allowPanel('gestion'), applyScope, (req, res) => {
  try {
    const { id } = req.params;
    const datos = obtenerDatosExcel();
    const idx = datos.findIndex(d => d.creadoEn === id || d.id === id);
    if (idx === -1) return res.status(404).json({ ok:false, error:'Registro no encontrado' });

    const item = datos[idx];
    if (req.scope.areas.length && item.area && !req.scope.areas.includes(item.area)) {
      return res.status(403).json({ ok:false, error:'No autorizado sobre esta área' });
    }

    datos[idx].estado = 'Rechazado';
    guardarDatosExcel(datos);
    res.json({ ok:true, data: datos[idx] });
  } catch (e) {
    console.error('reject error', e);
    res.status(500).json({ ok:false, error:'Error al rechazar' });
  }
});

// =========================
// Endpoint debug (para verificar que corre este server)
// =========================
app.get('/api/debug/whoami', (req, res) => {
  res.json({
    ok: true,
    note: 'server nuevo con RBAC',
    users: USERS.map(u => ({ email: u.email, role: u.role, panels: u.panels }))
  });
});

// =========================
// Manejo de errores (Multer y genéricos)
// =========================
app.use((err, req, res, next) => {
  if ((err && err.message && /Tipo de archivo no permitido|LIMIT_FILE_SIZE/i.test(err.message)) || err.code === 'LIMIT_FILE_SIZE') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera 5MB.'
      : 'Tipo de archivo no permitido. Solo PDF, JPG o PNG.';
    return res.status(400).json({ ok:false, error: msg });
  }
  console.error('🔥 Error no controlado:', err);
  return res.status(500).json({ ok:false, error:'Error interno del servidor' });
});

// =========================
// Arranque
// =========================

app.get('/api/debug/whoami', (req, res) => {
  res.json({
    ok: true,
    note: 'server nuevo con RBAC',
    users: (typeof USERS !== 'undefined')
      ? USERS.map(u => ({ email: u.email, role: u.role, panels: u.panels }))
      : 'USERS no definido aquí'
  });
});



app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
  console.log(`📂 Carpeta assets: ${path.join(__dirname, 'assets')}`);
});