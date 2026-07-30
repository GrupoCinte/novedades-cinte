"""Publicar post de vacante en LinkedIn personal."""
from __future__ import annotations

import asyncio

from config import LI_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import resolve_cookies


async def publicar_linkedin(texto_oferta: str) -> dict:
    cookies = resolve_cookies("linkedin", LI_COOKIES, ".linkedin.com")
    if not cookies:
        return {"status": "error", "mensaje": "Sesión LinkedIn no conectada"}

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=PLAYWRIGHT_HEADLESS)
        context = await browser.new_context()
        await context.add_cookies(cookies)
        page = await context.new_page()
        try:
            await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
            await asyncio.sleep(3)

            start_post = await page.query_selector(
                "button:has-text('Start a post'), button:has-text('Comenzar una publicación'), "
                ".share-box-feed-entry__trigger"
            )
            if start_post:
                await start_post.click()
                await asyncio.sleep(2)

            editor = await page.query_selector(
                "div[contenteditable='true'][role='textbox'], "
                "div.ql-editor, div.share-creation-state__text-editor"
            )
            if not editor:
                await browser.close()
                return {"status": "error", "mensaje": "No se encontró editor de publicación"}

            await editor.fill(texto_oferta[:2800])
            await asyncio.sleep(1)

            post_btn = await page.query_selector(
                "button:has-text('Publicar'), button:has-text('Post'), button.share-actions__primary-action"
            )
            if post_btn:
                await post_btn.click()
                await asyncio.sleep(3)
                await browser.close()
                return {"status": "ok", "url_publicada": page.url, "mensaje": "Post publicado en LinkedIn"}
            await browser.close()
            return {"status": "error", "mensaje": "No se encontró botón Publicar"}
        except Exception as exc:
            await browser.close()
            return {"status": "error", "mensaje": str(exc)[:400]}
