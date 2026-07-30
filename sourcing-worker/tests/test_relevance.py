"""Tests de relevancia candidato vs criterios."""
from __future__ import annotations

import unittest

from scrapers.criterios_mapper import normalize_criterios, palabras_clave_ee, xray_variantes
from scrapers.relevance import merge_ee_filter_terms, passes_relevance


class RelevanceTests(unittest.TestCase):
    CRITERIA = {
        "cargo": "Arquitecto de Soluciones",
        "cargos_equivalentes": ["Arquitecto de software", "Arquitecto soluciones ia"],
        "skills": ["AWS", "GCP", "Docker", "API REST"],
        "keywords": ["Arquitectura de Soluciones", "Ingeniería de Sistemas"],
    }

    def test_rechaza_monitor_aprendiz(self):
        raw = {"nombre": "Emanuel", "cargo": "Monitor aprendiz", "resumen_perfil": "Estudiante"}
        self.assertFalse(passes_relevance(raw, **self.CRITERIA))

    def test_rechaza_residente_obra(self):
        raw = {"nombre": "Diego", "cargo": "Residente de obra", "resumen_perfil": "Construcción"}
        self.assertFalse(passes_relevance(raw, **self.CRITERIA))

    def test_acepta_arquitecto_soluciones(self):
        raw = {"nombre": "Juan", "cargo": "Arquitecto de soluciones", "resumen_perfil": "Cloud"}
        self.assertTrue(passes_relevance(raw, **self.CRITERIA))

    def test_acepta_cargo_equivalente_variante(self):
        raw = {"nombre": "John", "cargo": "Arquitecto soluciones ia", "resumen_perfil": "TI"}
        self.assertTrue(
            passes_relevance(
                raw,
                self.CRITERIA["cargo"],
                self.CRITERIA["skills"],
                self.CRITERIA["keywords"],
                self.CRITERIA["cargos_equivalentes"],
            )
        )

    def test_relax_acepta_un_token(self):
        raw = {"nombre": "Ana", "cargo": "Consultora cloud", "resumen_perfil": "soluciones AWS"}
        self.assertTrue(
            passes_relevance(
                raw,
                self.CRITERIA["cargo"],
                self.CRITERIA["skills"],
                self.CRITERIA["keywords"],
                self.CRITERIA["cargos_equivalentes"],
                relax=True,
            )
        )

    def test_acepta_por_skill_en_perfil(self):
        raw = {
            "nombre": "Ana",
            "cargo": "Ingeniera de software",
            "habilidades": ["AWS", "Kubernetes"],
        }
        self.assertTrue(passes_relevance(raw, **self.CRITERIA))

    def test_merge_ee_filter_terms_solo_skills_cortas(self):
        terms = merge_ee_filter_terms(
            ["AWS", "GCP", "Docker", "API REST"],
            limit=3,
        )
        self.assertEqual(terms, ["AWS", "GCP", "Docker"])

    def test_palabras_clave_ee_desde_criterios(self):
        crit = normalize_criterios({
            "skills_requeridas": ["AWS", "Arquitectura de Soluciones"],
            "palabras_clave_hv": ["AWS", "GCP"],
        })
        self.assertEqual(palabras_clave_ee(crit), ["AWS", "GCP"])

    def test_xray_variantes_incluye_equivalentes(self):
        crit = normalize_criterios({
            "cargo": "Arquitecto de Soluciones",
            "cargos_equivalentes": ["Arquitecto de software"],
        })
        variantes = xray_variantes(crit)
        self.assertIn("Arquitecto de Soluciones", variantes)
        self.assertIn("Arquitecto de software", variantes)


if __name__ == "__main__":
    unittest.main()
