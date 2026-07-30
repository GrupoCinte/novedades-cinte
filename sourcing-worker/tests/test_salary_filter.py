"""Tests filtro salario."""
import unittest

from scrapers.salary_filter import parsear_salario, excede_aspiracion, salario_max_from_criterios


class TestSalaryFilter(unittest.TestCase):
    def test_parse_millones(self):
        self.assertAlmostEqual(parsear_salario("4,5 M COP") or 0, 4_500_000, delta=1)

    def test_excede(self):
        self.assertTrue(excede_aspiracion("$8.000.000", 5_000_000))
        self.assertFalse(excede_aspiracion("$4.000.000", 5_000_000))

    def test_criterios_max(self):
        self.assertEqual(salario_max_from_criterios({"salario_rangos_cop": ["5000000"]}), 5000000.0)


if __name__ == "__main__":
    unittest.main()
