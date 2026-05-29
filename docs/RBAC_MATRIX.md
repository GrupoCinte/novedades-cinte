# Matriz de roles (guía funcional)

**Para quién es este documento:** equipos de **aseguramiento de calidad (QA)** y **administradores** que necesitan entender qué puede hacer cada rol en el producto, **sin** detalle de programación.

**Qué cubre:** portal de staff en **`/admin`** (acceso con cuenta corporativa / Cognito), portal de consultores con Microsoft (**`/consultor`**), y radicación pública en **`/`**.

**Última revisión:** mayo 2026.

---

## 1. Idea general

- Hay dos mundos de sesión distintos: **personal interno (Cognito)** usa el portal **`/admin`** según su rol; **consultores externos (Microsoft Entra)** usan **`/consultor`**. No se mezclan en la misma pantalla de administración.
- Si una persona tiene **varios grupos** asignados en Cognito, el sistema aplica **un solo rol efectivo**, el de **mayor prioridad** (orden al final de este documento).
- En **novedades**, “ver todo” significa: **todas las solicitudes de todas las áreas de negocio** (Capital Humano, Operaciones, etc.), salvo que el rol esté pensado solo para un subconjunto (por ejemplo **GP** solo ve clientes asignados).

---

## 2. Tabla maestra: qué puede hacer cada rol

| Rol (nombre en sistema) | Rol en negocio (referencia) | Entrada al portal admin `/admin` | Módulo **Novedades** (tablero, calendario, gestión, alertas) | Módulo **Comercial** (cotizador) | Módulo **Contratación** (onboarding Capital Humano) | Módulo **Directorio** (catálogo cliente–líder, colaboradores, reubicaciones, datos maestros) |
|-------------------------|-----------------------------|-----------------------------------|---------------------------------------------------------------|-------------------------------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Super administrador** | Control total técnico | Sí | Todo el ciclo: ver **todas** las áreas y tipos; aprobar o rechazar cualquier tipo; editar o borrar solicitudes con políticas de auditoría | Sí | Sí | Sí |
| **CAC** | Control operativo amplio (ej. mesa de control) | Sí | Igual que super administrador en **visibilidad y decisión** sobre novedades (incluye todos los tipos y todas las áreas). **No** usa cotización ni onboarding CH desde este portal | **No** | **No** | **Sí** (misma capacidad operativa que super admin en directorio) |
| **Admin Capital Humano** | Responsable CH | Sí | Ve **todas** las áreas y **todos** los tipos de solicitud. Aprueba según reglas por tipo (ver sección 4). Accede a tablero, calendario y gestión | **No** | Sí | **No** |
| **Equipo Capital Humano** | Operativo CH | Sí | Misma **visibilidad** amplia que Admin CH (todas las áreas y tipos). Las **aprobaciones** dependen del tipo (ver sección 4) | **No** | Sí | **No** |
| **Comercial** | Fuerza comercial | Solo si la ruta lo permite | Normalmente **no** entra al shell clásico de novedades | **Sí** (es su módulo principal) | No | No |
| **GP** (Gestión de proyectos) | Coordinación operativa | Sí | Solo **Gestión de novedades** (sin tablero ni calendario como menú principal). Ve solicitudes de sus **clientes asignados**. Aprueba tipos operativos (Hora extra, disponibilidad, etc.) | No | No | No |
| **Nómina** | Área financiera / nómina | Sí | Tablero, calendario y gestión. Ve **todas las áreas**. **No** aprueba solicitudes: solo **verifica** información en tipos que lo requieren antes de que CH apruebe | No | No | No |
| **Consultor** (Microsoft) | Externo | Redirige a **`/consultor`**, no al admin staff | Radicación y seguimiento en portal consultor | No | No | No |

---

## 3. Módulo Novedades: visibilidad

- **Super administrador, CAC, Admin CH y Equipo CH** pueden **ver** cualquier tipo de solicitud y **listados que incluyen todas las áreas** (sin quedar limitados solo a “Capital Humano” en la práctica del listado).
- **Nómina** también ve alcance amplio para poder trabajar la verificación previa donde aplique.
- **GP** ve solo lo relacionado con **sus clientes asignados** (alcance operativo acotado).

---

## 4. Módulo Novedades: quién aprueba o rechaza (resumen por familia de solicitud)

Las reglas finas están en sistema; para pruebas y comunicación a usuario se resume así:

### A. Solicitudes de Capital Humano con paso **Nómina** (incapacidades, licencias, permisos remunerados o no remunerados, vacaciones en dinero, etc.)

1. **Nómina** revisa los datos y deja constancia (**correcto / incorrecto** y **observación obligatoria**). Esa verificación **no se puede cambiar** después del primer registro.
2. Cuando ya está verificado, pueden **aprobar o rechazar**: **Admin Capital Humano**, **Super administrador** y **CAC**.  
   **Equipo CH** **no** cierra estos tipos como aprobador final de regla general (sí puede verlos en pantalla).

### B. **Vacaciones en tiempo**

Pueden aprobar o rechazar: **GP**, **Admin CH**, **Equipo CH** y **CAC** (y super administrador).

### C. Solicitudes **operativas** (Hora extra, Disponibilidad, Bonos histórico, Permiso compensatorio en tiempo, etc.)

- **Solo GP** aprueba o rechaza según la política vigente para ese tipo.  
- Personal de CH (**Admin / Equipo**) **sí los ve** en listados, pero **no** son quienes aprueban esos tipos.

**Excepción:** **Compensatorio por votación/jurado** no entra en el bloque “solo GP”: es un tipo de **Capital Humano** (aprobación principal **Admin CH** en catálogo; **CAC** y **super administrador** pueden aprobar cualquier tipo según la sección D). El **Permiso compensatorio en tiempo** (programado en planta) **sí** sigue siendo solicitud operativa atendida por **GP**.

### D. Super administrador y CAC

Pueden **aprobar o rechazar cualquier tipo** según las validaciones del sistema (incluida la verificación de nómina cuando el tipo la exige).

---

## 5. Hub del portal admin: tarjetas de entrada

Al entrar a **`/admin`** con sesión válida, según el rol aparecen tarjetas como:

- **Gestión de Novedades** — quien tenga permiso de novedades.
- **Conciliaciones** — misma condición de acceso que Gestión de Novedades; en la versión actual es **solo lectura** (resumen por cliente y mes con novedades **aprobadas**).
- **Módulo Comercial** — cotizador; **no** aplica a **CAC**, **GP**, **Nómina**, ni a **Admin CH** ni **Equipo CH** (solo quienes tienen rol pensado para comercial o super administrador).
- **Capital Humano Onboarding** — contratación; **sí** aplica a **Admin CH** y **Equipo CH**; **no** aplica a **CAC**.
- **Módulo de administración** (Directorio) — **Super administrador** y **CAC**; **Admin CH** y **Equipo CH** **no** tienen esta tarjeta.

---

## 6. Directorio (catálogo maestro)

- Lo usan principalmente **Super administrador** y **CAC** para mantener clientes, líderes, colaboradores, pipeline de reubicaciones y datos relacionados.
- **Admin CH** y **Equipo CH** **no** tienen acceso a este módulo desde el hub.

---

## 7. Comercial y catálogo de roles TI

- El **cotizador** (`/admin/comercial`) lo usan el rol **Comercial**, **Super administrador** y cualquier perfil al que se le asigne explícitamente el **módulo comercial** en identidad.
- **Admin Capital Humano** y **Equipo Capital Humano** **no** tienen módulo comercial: trabajan **novedades** y **contratación (onboarding)**, pero **no** el cotizador ni las pantallas comerciales asociadas.
- **CAC** **no** entra al cotizador (prioridad: novedades + directorio).
- El **catálogo de roles TI** comparte el mismo acceso que el cotizador (universo “comercial”). La **edición** queda acotada a **Super administrador** en la configuración actual del producto.

---

## 8. Portal consultor (Microsoft Entra)

- Usuarios **consultores** inician sesión con Microsoft y trabajan en **`/consultor`** (radicación de novedades propias, placeholders de otros módulos según evolución del producto).
- **No** deben usar la misma experiencia que el personal interno en **`/admin`**.

---

## 9. Prioridad si hay varios grupos en Cognito

Si un usuario pertenece a más de un grupo, el rol efectivo es **uno solo**, elegido por esta prioridad (de mayor a menor):

**Super administrador → CAC → Admin Capital Humano → Equipo Capital Humano → GP → Nómina → Comercial → Consultor**

**Recomendación operativa:** asignar **un solo grupo** por usuario en Cognito cuando el puesto tenga un solo rol en la plataforma; así no hay ambigüedad. Si hay varios grupos, solo cuenta la prioridad anterior (no se puede elegir otro rol desde la pantalla de login).

---

## 10. Inicio de sesión en el portal admin (`/admin`)

- El acceso staff usa **solo usuario (correo) y contraseña**. El rol lo define **exclusivamente Cognito** (membresía en grupos); **no** hay selector de rol en el formulario de login.
- **Futuro (si el negocio lo pide):** un usuario con **varios grupos** podría elegir un **rol activo para la sesión** desde **configuración de cuenta**, siempre que el servidor compruebe que ese rol está entre sus grupos en Cognito (sin conceder permisos nuevos). No forma parte del alcance actual.

---

## 11. Mantenimiento y detalle técnico

- Los cambios de comportamiento se implementan en código; este documento debe **actualizarse** cuando cambien reglas de negocio visibles para el usuario.
- Detalle de rutas, nombres de campos y middlewares: **repositorio** (`src/rbac.js`, rutas de API y componentes del frontend). No es necesario para el día a día de QA funcional.
