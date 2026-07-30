"""Constantes y mapas de filtros El Empleo (panel empresas/buscar)."""
from __future__ import annotations

# Select2 / selects descubiertos en probe
EE_SORT_BY_UPDATE = "50"
EE_SEARCH_SCOPE = {
    "toda_hv": "0",
    "ultima_experiencia": "1",
    "estudios": "2",
}
EE_HV_ACTUALIZADA = {
    "ultimo_mes": "10",
    "ultimos_3_meses": "20",
    "ultimos_6_meses": "30",
    "ultimo_ano": "40",
}

# Placeholders UI (capturas + probe)
PLACEHOLDER_PALABRA = "Ej: Diseñador, Administrador"
PLACEHOLDER_CARGO_EQUIVALENTE = "Ej: Administrador, Asesor"
PLACEHOLDER_PROFESION = "Ej: Diseñador Gráfico"

SELECT_NAMES = {
    "sort": "SortByList.SelectedIds",
    "search_scope": "SearchInV2.SelectedIds",
    "hv_updated": "LastResumeeUpdateDates.SelectedIds",
    "work_area": "WorkAreas.SelectedIds",
    "location_type": "LocationByType.SelectedIds",
}

EXPERIENCE_SLIDER_MARKS = (0, 1, 3, 5, 10, 15)
