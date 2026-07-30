"""Filtro de aspiración salarial (portado de ScrapingAT)."""
from __future__ import annotations

import re


def parsear_salario(texto: str | None) -> float | None:
    if not texto:
        return None
    t = str(texto).lower().strip()
    if any(x in t for x in ("convenir", "no especifica", "confidencial", "n/a")):
        return None
    numeros_raw = re.findall(r"[\d][\d\.,]*", t)
    if not numeros_raw:
        return None
    valores: list[float] = []
    for n in numeros_raw:
        if n.count(".") > 1 or (n.count(".") == 1 and len(n.split(".")[-1]) == 3):
            limpio = n.replace(".", "").replace(",", ".")
        else:
            limpio = n.replace(",", ".")
        try:
            val = float(limpio)
        except ValueError:
            continue
        valores.append(val)
    if not valores:
        return None
    tiene_millon = any(x in t for x in (" m ", "m,", "m cop", "mm", "millon", "millón")) or t.endswith("m")
    if tiene_millon:
        valores = [v * 1_000_000 if v < 1000 else v for v in valores]
    else:
        valores = [v * 1_000_000 if v < 100 else v for v in valores]
    return min(valores) if valores else None


def salario_max_from_criterios(criterios: dict) -> float | None:
    rangos = criterios.get("salario_rangos_cop") or []
    if not isinstance(rangos, list):
        return None
    for r in rangos:
        digits = re.sub(r"\D", "", str(r or ""))
        if digits:
            try:
                n = float(digits)
                if n > 0:
                    return n
            except ValueError:
                pass
    return None


def excede_aspiracion(salario_txt: str | None, salario_max: float | None) -> bool:
    if not salario_max:
        return False
    valor = parsear_salario(salario_txt)
    if valor is None:
        return True
    try:
        return valor > float(salario_max)
    except (TypeError, ValueError):
        return True
