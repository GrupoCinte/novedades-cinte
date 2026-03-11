require('dotenv').config();
const express = require('express');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3005;

/* ========================= MIDDLEWARES BASE ========================= */

app.use(express.json({ limit: '50mb' }));

app.use(cors({
  origin: [/^http:\/\/localhost:\d+$/],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

/* ========================= EXCEL ========================= */

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

/* ========================= UPLOADS ========================= */

const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_').slice(0, 40);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file) return cb(null, true);
    if (allowedMimes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG o PNG.'));
  },
});

/* ========================= USUARIOS + AUTH ========================= */

const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secreto';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Usuarios demo
 */
const USERS = [
  { id:'u1', email:'ch.admin@empresa.com',  name:'Admin CH',  role:'admin_ch',  area:'Capital Humano',
    panels:['dashboard','calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },

  { id:'u2', email:'ops.admin@empresa.com', name:'Admin OPS', role:'admin_ops', area:'Operaciones',
    panels:['dashboard','calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },

  { id:'u3', email:'gp@empresa.com',        name:'Gerente',   role:'gp',        area:'Operaciones',
    panels:['calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },

  { id:'u4', email:'team.ch@empresa.com',   name:'Team CH',   role:'team_ch',   area:'Capital Humano',
    panels:['calendar','gestion'], passwordPlain:'123456', passwordVersion:0 },
];

/* ========================= REGISTRO (NUEVO) ========================= */

const REGISTER_CODES = new Map();

app.post("/api/auth/register/start", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.json({ ok:false, message:"Email requerido" });

  // Generar código
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const tempToken = `${email}-${Date.now()}`;

  REGISTER_CODES.set(tempToken, { email, code });

  console.log("Código de registro:", code);

  res.json({ ok:true, tempToken, code });  // En producción NO enviar code
});

app.post("/api/auth/register/verify", (req, res) => {
  const { email, code } = req.body;

  for (const [token, entry] of REGISTER_CODES) {
    if (entry.email === email && entry.code === code) {
      return res.json({ ok: true });
    }
  }

  return res.json({ ok:false, message:"Código incorrecto" });
});

app.post("/api/auth/register/finish", (req, res) => {
  const { email, nombres, apellidos, celular, password } = req.body || {};

  if (!email || !password) {
    return res.json({ ok:false, message:"Datos incompletos" });
  }

  // Crear nuevo usuario simple (demo)
  const newUser = {
    id: 'u' + (USERS.length + 1),
    email,
    name: nombres + " " + apellidos,
    role: 'team_ch',     // puedes cambiar este rol por el que necesites
    area: 'Capital Humano',
    panels: ['calendar','gestion'],
    passwordPlain: password,
    passwordVersion:0
  };

  USERS.push(newUser);

  res.json({ ok:true });
});

/* ========================= JWT ========================= */

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
  const [, token] = h.split(" ");
  if (!token) return res.status(401).json({ error:"Token faltante" });

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch (err) {
    return res.status(403).json({ error:"Token inválido" });
  }
}

function findUserByEmailOrAlias(val) {
  const v = String(val || '').trim().toLowerCase();
  if (!v) return null;

  return (
    USERS.find(u => u.email.toLowerCase() === v) ||
    USERS.find(u => u.email.split("@")[0].toLowerCase() === v) ||
    USERS.find(u => String(u.role).toLowerCase() === v)
  );
}

/* ========================= RBAC ========================= */

const POLICY = {
  admin_ch:  { panels:['dashboard','calendar','gestion'] },
  admin_ops: { panels:['dashboard','calendar','gestion'] },
  gp:        { panels:['calendar','gestion'] },
  team_ch:   { panels:['calendar','gestion'] }
};

function allowPanel(panel) {
  return (req,res,next) => {
    const role = req.user?.role;
    const conf = POLICY[role];
    if (!conf) return res.status(403).json({ ok:false, message:"Rol no autorizado" });
    if (!conf.panels.includes(panel)) {
      return res.status(403).json({ ok:false, message:`Sin permiso para panel: ${panel}` });
    }
    next();
  };
}

function applyScope(req,res,next) {
  const userArea = req.user?.area || "";
  req.scope = {
    areas: userArea ? [userArea] : [],
    role: req.user?.role || "",
    userId: req.user?.sub || "",
  };
  next();
}

function filterByAreas(list, areas) {
  if (!Array.isArray(list)) return [];
  const withArea = list.filter(it => it.area && it.area.trim() !== "");
  if (areas.length > 0) return withArea.filter(it => areas.includes(it.area));
  return [];
}

/* ========================= LOGIN ========================= */

app.post('/api/login', (req,res) => {
  const { email, username, password } = req.body || {};
  const userId = (email || username || "").trim().toLowerCase();

  if (!userId || !password) {
    return res.status(400).json({ ok:false, message:"Usuario y contraseña requeridos" });
  }

  const user = findUserByEmailOrAlias(userId);
  if (!user || password !== user.passwordPlain) {
    return res.status(401).json({ ok:false, message:"Credenciales inválidas" });
  }

  const token = emitirToken(user);

  res.json({
    ok:true,
    token,
    user: {
      id:user.id,
      email:user.email,
      name:user.name,
      role:user.role,
      area:user.area,
      panels:user.panels
    }
  });
});

/* ========================= RESET PASSWORD ========================= */

const RESET_TOKENS = new Map();

function isStrongPassword(pw='') {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);
}

app.post('/api/auth/forgot-password', (req,res)=>{
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ ok:false, message:"Email requerido" });

  const user = findUserByEmailOrAlias(email);
  if (!user) return res.json({ ok:true, message:"Si existe se enviará un correo" });

  const resetToken = jwt.sign({ sub:user.id, purpose:"reset" }, SECRET_KEY, { expiresIn:'15m' });

  RESET_TOKENS.set(resetToken, {
    userId:user.id,
    exp:Date.now() + 15*60*1000
  });

  const resetUrl = `http://localhost:5175/admin/reset?token=${encodeURIComponent(resetToken)}`;
  console.log("Reset URL:", resetUrl);

  res.json({ ok:true, resetUrl });
});

app.post('/api/auth/reset-password', (req,res)=>{
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword)
    return res.status(400).json({ ok:false, message:"Datos faltantes" });

  if (!isStrongPassword(newPassword))
    return res.status(400).json({ ok:false, message:"Contraseña débil" });

  let claims;
  try { claims = jwt.verify(token, SECRET_KEY); }
  catch { return res.status(400).json({ ok:false, message:"Token inválido" }) }

  if (claims.purpose !== 'reset')
    return res.status(400).json({ ok:false, message:"Token invalido" });

  const rec = RESET_TOKENS.get(token);
  if (!rec || rec.exp < Date.now())
    return res.status(400).json({ ok:false, message:"Token expirado" });

  const user = USERS.find(u => u.id === claims.sub);

  user.passwordPlain = newPassword;
  user.passwordVersion++;
  RESET_TOKENS.delete(token);

  res.json({ ok:true, message:"Contraseña actualizada" });
});

/* ========================= CAMBIAR CONTRASEÑA ========================= */

app.post("/api/auth/change-password", verificarToken, (req,res)=>{
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ ok:false, message:"Datos faltantes" });

  const user = USERS.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ ok:false, message:"Usuario no encontrado" });

  if (user.passwordPlain !== currentPassword)
    return res.status(401).json({ ok:false, message:"Contraseña actual incorrecta" });

  if (!isStrongPassword(newPassword))
    return res.status(400).json({ ok:false, message:"Contraseña insegura" });

  user.passwordPlain = newPassword;
  user.passwordVersion++;

  res.json({ ok:true, message:"Contraseña cambiada" });
});

/* ========================= RUTAS PROTEGIDAS (RBAC) ========================= */

app.get('/api/dashboard/metrics',
  verificarToken,
  allowPanel('dashboard'),
  applyScope,
  (req,res)=>{
    const list = filterByAreas(obtenerDatosExcel(), req.scope.areas);

    const total = list.length;
    const porEstado = list.reduce((acc,n)=>{
      const e = (n.estado || '').toLowerCase();
      if (e.includes('pend')) acc['Pendiente'] = (acc['Pendiente']||0)+1;
      else if (e.includes('aprob')) acc['Aprobado'] = (acc['Aprobado']||0)+1;
      else if (e.includes('rech')) acc['Rechazado'] = (acc['Rechazado']||0)+1;
      else acc[n.estado || '—'] = (acc[n.estado||'—']||0)+1;
      return acc;
    },{});

    res.json({
      ok:true,
      data:{ total, porEstado, areaScope:req.scope.areas[0] || "—" }
    });
});

/* LISTADO */
app.get('/api/novedades',
  verificarToken,
  applyScope,
  (req,res)=>{
    let list = filterByAreas(obtenerDatosExcel(), req.scope.areas);
    res.json({ ok:true, data:list, items:list });
});

/* ENVIAR */
app.post('/api/enviar-novedad',
  verificarToken,
  upload.single('soporte'),
  (req,res)=>{
    try {
      const datos = obtenerDatosExcel();
      const archivoRuta = req.file ? `/assets/uploads/${req.file.filename}` : null;

      const novedad = {
        ...req.body,
        soporteRuta:archivoRuta,
        creadoEn:new Date().toISOString(),
        estado:"Pendiente",
        area:req.user.area
      };

      datos.push(novedad);
      guardarDatosExcel(datos);

      res.json({ ok:true });
    } catch (e) {
      res.status(500).json({ ok:false, error:"Error al guardar" });
    }
});

/* ACTUALIZAR */
app.post('/api/actualizar-estado',
  verificarToken,
  allowPanel('gestion'),
  applyScope,
  (req,res)=>{
    const { id, nuevoEstado } = req.body;
    const datos = obtenerDatosExcel();

    const idx = datos.findIndex(d => d.creadoEn === id || d.id === id);
    if (idx === -1) return res.status(404).json({ ok:false, message:"No existe" });

    const item = datos[idx];
    if (item.area !== req.user.area)
      return res.status(403).json({ ok:false, message:"No autorizado" });

    datos[idx].estado = nuevoEstado;
    guardarDatosExcel(datos);

    res.json({ ok:true });
});

/* ========================= ERROR HANDLER ========================= */

app.use((err, req, res, next)=>{
  if (err && err.message && /Tipo de archivo/i.test(err.message))
    return res.status(400).json({ ok:false, error:err.message });

  if (err?.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ ok:false, error:"Archivo supera 5MB" });

  console.error("🔥 Error no controlado:", err);
  res.status(500).json({ ok:false, error:"Error interno" });
});

/* ========================= ARRANQUE ========================= */

app.listen(PORT, ()=>{
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});