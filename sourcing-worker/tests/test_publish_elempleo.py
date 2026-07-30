"""Tests helpers de publicación El Empleo (sin Playwright)."""
import unittest

from publish.elempleo import (
    _extract_offer_id,
    _is_concrete_offer_url,
    _is_new_offer_id,
    _normalize_title,
    _title_matches,
    _urls_for_offer_id,
)


class TestPublishElempleoHelpers(unittest.TestCase):
    def test_normalize_title(self):
        self.assertEqual(_normalize_title("  Gerente   de Proyectos "), "gerente de proyectos")

    def test_extract_offer_id(self):
        self.assertEqual(
            _extract_offer_id("https://www.elempleo.com/co/empresas/buscar/oferta/1886741364"),
            "1886741364",
        )
        self.assertEqual(
            _extract_offer_id("https://www.elempleo.com/co/ofertas-trabajo-1886741364"),
            "1886741364",
        )
        self.assertEqual(
            _extract_offer_id("https://www.elempleo.com/co/empresas/ofertas/editar/1886741364"),
            "1886741364",
        )
        self.assertEqual(
            _extract_offer_id("https://www.elempleo.com/co/empresas/ofertas/por-ver"),
            "",
        )

    def test_concrete_offer_url(self):
        self.assertTrue(
            _is_concrete_offer_url("https://www.elempleo.com/co/empresas/buscar/oferta/1886741364")
        )
        self.assertTrue(
            _is_concrete_offer_url("https://www.elempleo.com/co/ofertas-trabajo-1886741364")
        )
        self.assertFalse(
            _is_concrete_offer_url("https://www.elempleo.com/co/empresas/ofertas/por-ver")
        )
        self.assertFalse(
            _is_concrete_offer_url("https://www.elempleo.com/co/empresas/ofertas")
        )
        self.assertFalse(
            _is_concrete_offer_url("https://www.elempleo.com/co/empresas")
        )

    def test_urls_for_offer_id(self):
        urls = _urls_for_offer_id("1886741364")
        self.assertEqual(urls["url_empresas"], "https://www.elempleo.com/co/empresas/buscar/oferta/1886741364")
        self.assertEqual(urls["url_publicada"], "https://www.elempleo.com/co/ofertas-trabajo-1886741364")

    def test_title_matches(self):
        self.assertTrue(_title_matches("Gerente de Proyectos", "Gerente de Proyectos - Bogotá"))
        self.assertFalse(_title_matches("Gerente de Proyectos", "Auxiliar Administrativo"))

    def test_is_new_offer_id(self):
        self.assertTrue(_is_new_offer_id("1886741364", 1886736412))
        self.assertFalse(_is_new_offer_id("1886736412", 1886736412))
        self.assertFalse(_is_new_offer_id("1886736412", 1886741364))
        self.assertFalse(_is_new_offer_id("", 10))


if __name__ == "__main__":
    unittest.main()
