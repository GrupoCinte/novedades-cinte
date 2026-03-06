

## Dashboard (historial y novedades)
- Inicia el servidor y abre: **http://localhost:3000/dashboard.html**
- Endpoints usados por el dashboard:
  - `GET /api/historial` → lee `data/historial.jsonl`
  - `GET /api/novedades` → lee `data/novedades.jsonl`

**Validación de adjuntos (lado cliente y servidor)**
- Tipos permitidos: PDF, JPG, PNG
- Tamaño máximo: 10 MB
- El servidor valida tamaño, extensión y (si viene informada) el MIME.

**Campo “Correo del Solicitante”**
- Añadido en el formulario (opcional). Si lo completas, la API enviará copia de la notificación a ese correo.
