"""Tests scraper postulaciones."""
import unittest

from scrapers.postulaciones import _validar_url_empresas


class TestPostulaciones(unittest.TestCase):
    def test_url_empresas_valida(self):
        self.assertTrue(_validar_url_empresas('https://www.elempleo.com/co/empresas/ofertas/123'))

    def test_url_publica_invalida(self):
        self.assertFalse(_validar_url_empresas('https://www.elempleo.com/co/ofertas-trabajo/dev'))


if __name__ == '__main__':
    unittest.main()
