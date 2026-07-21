"""Envío automático de InMail LinkedIn vía Playwright."""
from __future__ import annotations

import asyncio

from config import LI_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import resolve_cookies


async def enviar_inmail(candidato_url: str, nombre: str, mensaje: str) -> dict:
    resultado = {"status": "error", "mensaje": ""}
    cookies = resolve_cookies("linkedin", LI_COOKIES, ".linkedin.com")
    if not cookies:
        resultado["mensaje"] = "Sin sesión LinkedIn"
        return resultado

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=PLAYWRIGHT_HEADLESS,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="es-CO",
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        await context.add_cookies(cookies)
        page = await context.new_page()
        try:
            await page.goto(candidato_url, wait_until="domcontentloaded")
            await asyncio.sleep(3)

            msg_btn = await page.query_selector(
                "button:has-text('Enviar mensaje'), button:has-text('Message'), "
                "button[aria-label*='mensaje'], button[aria-label*='Message']"
            )
            if not msg_btn:
                resultado["mensaje"] = "No se encontró botón de mensaje"
                await browser.close()
                return resultado

            await msg_btn.click()
            await asyncio.sleep(2)

            textarea = await page.query_selector(
                "div[contenteditable='true'], textarea[name='message'], "
                "div.msg-form__contenteditable"
            )
            if not textarea:
                resultado["mensaje"] = "No se encontró campo de mensaje"
                await browser.close()
                return resultado

            await textarea.fill(mensaje)
            await asyncio.sleep(1)

            send_btn = await page.query_selector(
                "button:has-text('Enviar'), button:has-text('Send'), button.msg-form__send-button"
            )
            if send_btn:
                await send_btn.click()
                await asyncio.sleep(2)
                resultado["status"] = "ok"
                resultado["mensaje"] = f"InMail enviado a {nombre}"
            else:
                resultado["mensaje"] = "No se encontró botón enviar"
        except Exception as exc:
            resultado["mensaje"] = str(exc)[:300]
        finally:
            await browser.close()

    return resultado
