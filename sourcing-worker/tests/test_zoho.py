"""Tests scraper Zoho (modo URL)."""
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from scrapers.zoho import buscar_zoho


class TestZohoScraper(unittest.TestCase):
    def test_buscar_zoho_requiere_callback_base(self):
        async def run():
            items, err = await buscar_zoho('', 'job-1', {'cargo': 'Dev'}, 10)
            self.assertEqual(items, [])
            self.assertTrue(err)

        import asyncio
        asyncio.run(run())

    def test_buscar_zoho_parsea_respuesta_api(self):
        async def run():
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = ''
            mock_response.json.return_value = {
                'candidatos': [{
                    'fuente': 'Zoho Recruit',
                    'nombre': 'Test User',
                    'url_perfil': 'https://zoho.com/c/1',
                    'perfil': {'cargo': 'Dev'}
                }]
            }

            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            with patch('scrapers.zoho.httpx.AsyncClient', return_value=mock_client):
                items, err = await buscar_zoho(
                    'http://localhost:3005',
                    'job-1',
                    {'cargo': 'Dev'},
                    10,
                    modo='busqueda',
                )
                self.assertIsNone(err)
                self.assertEqual(len(items), 1)
                self.assertEqual(items[0]['nombre'], 'Test User')

        import asyncio
        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
