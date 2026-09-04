# Patrón: filtros de listado (desplegable múltiple)

**Origen:** AUT-316 (Capital Humano). **Firma UX:** Sally. **Decisión:** Miguel — replicar en todo el portal.

Este archivo es la fuente versionada del patrón (`*.md` suelto en `docs/` no se sube). Cuando un listado filtre por listas (cliente, tipo, estado, etc.), no se inventa otra barra.

## Qué ve la persona

1. **Barra liviana, fija al scroll.** Botón **Filtros** (no «Filtros avanzados»). Buscador que ocupa el espacio. Sin chip de «Sin filtros activos».
2. **Panel lateral** al pulsar Filtros. Título del panel: **Filtros**.
3. **Cada lista es un desplegable.** Cerrado parece un select. Abierto, checkboxes para marcar varios.
4. **Chips quitables** debajo de la barra, uno por valor (o uno por rango de fechas). La X quita ese criterio sin reabrir el panel.

## El desplegable

| Estado | Texto del botón | Qué hay adentro |
| --- | --- | --- |
| Nada marcado | Todos | Hint: «Sin marcar = todos» |
| Un valor | Ese valor | Checkboxes |
| Varios | Primero +N (ej. Falabella +1) | Checkboxes |

- Clic fuera cierra el menú. **Escape** cierra solo ese desplegable, no el panel.
- Si hay más de ~8 opciones, arriba del menú va un **Buscar…**
- Tema claro y oscuro. Contraste de borde y texto como el resto del módulo.

## Qué no hacer

- Cajas de checkboxes siempre abiertas (alargan el panel).
- `<select multiple>` nativo.
- Chip resumen «N filtros activos» en lugar de chips quitables.
- Dejar el botón como «Filtros avanzados» en listados nuevos.

## Cómo copiarlo en otro módulo

1. Reutilizar `react-frontend/src/onboarding/FilterMultiSelect.jsx`. En la primera adopción **fuera de CH**, moverlo a esta carpeta (`shared/filters/`).
2. Barra: `OnboardingFiltersBar` con `compact` y `chips`, o el toolbar del módulo ya existente **adaptado** a liviano + chips.
3. El API debe aceptar **un valor o varios** (coma o array). En CH: `src/onboarding/personalListFilters.js`.
4. Chips: un ítem por valor; quitar uno no borra los demás.

Referencia viva: Capital Humano → Personal Activo / Staff / SENA / Bajas → Filtros.

## Pendiente en Capital Humano (no ahora)

Miguel (cierre AUT-316): **después** se replica el mismo patrón en el resto de listados del módulo. No entra en AUT-317 ni en las HUs de ficha/contratos.

Aún con la barra vieja:

- Próximos a ingresar
- En ingreso
- Licencias
- Extranjeros
- Novedades Zoho
- Cancelaciones / eliminaciones

