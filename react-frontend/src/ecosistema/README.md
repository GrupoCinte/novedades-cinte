# Mock «Ecosistema Cinte» (planeación)

Este directorio contiene **solo UI de mockup** para visualizar tres portales (colaborador, administrativo, cliente) y las capas de núcleo compartido y automatización, alineado al diagrama de planeación del ecosistema.

## Cómo verlo

- Arranca el frontend (`npm run dev`) y abre **`/ecosistema`**.
- No requiere login. Es independiente de `/admin` y del flujo de Cognito.

## Desactivar el mock en un build

En `.env` del frontend:

```env
VITE_ENABLE_ECOSISTEMA_MOCK=false
```

Con eso, cualquier ruta bajo `/ecosistema` redirige a `/` y el bundle del mock puede seguir existiendo pero no se muestra la UI (la ruta sigue registrada).

Por defecto el mock está **habilitado** si la variable no se define o no es `false`.

## Contenido

- **Hub** (`/ecosistema`): tarjetas a cada portal y enlaces a capas inferiores.
- **Portales** con sidebar y placeholders: `/ecosistema/colaborador`, `/ecosistema/administrativo`, `/ecosistema/cliente`.
- **Administrativo**: enlaces reales a `/admin`, `/admin/comercial`, `/admin/contratacion` (nueva pestaña; requieren sesión y roles en la app real).
- **Núcleo / Automatización**: páginas informativas estáticas.

No hay llamadas a API ni persistencia desde este mock.
