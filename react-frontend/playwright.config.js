/**
 * @file playwright.config.js
 * @description Configuración de Playwright para tests E2E de novedades-cinte.
 *              Cubre flujos críticos del portal de radicación y del dashboard administrativo.
 */

// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Directorio donde viven los tests E2E
  testDir: './e2e',

  // Tiempo máximo por test (60s para flujos con uploads)
  timeout: 60_000,

  // Tiempo de aserción global
  expect: { timeout: 10_000 },

  // Retries en CI para flakiness
  retries: process.env.CI ? 2 : 0,

  // Paralelismo – desactivado por defecto para evitar conflictos de DB
  workers: process.env.CI ? 1 : 1,

  // Reporter: HTML para ver capturas
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['line'],
  ],

  use: {
    // URL base del frontend en dev
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5175',

    // Captura de trazas en caso de fallo
    trace: 'on-first-retry',

    // Screenshot en fallo
    screenshot: 'only-on-failure',

    // Video en fallo
    video: 'on-first-retry',

    // Viewport estándar
    viewport: { width: 1280, height: 800 },

    // Locale en español Colombia
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Levantar el servidor de desarrollo automáticamente
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
