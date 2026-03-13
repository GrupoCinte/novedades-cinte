import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
    // Excluir carpeta e2e/ de Vitest (la corre Playwright aparte)
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
    include: ['src/test/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      // Solo medir cobertura en módulos de lógica de negocio (.js puros)
      include: ['src/cognitoAuth.js', 'src/novedadRules.js'],
      exclude: [
        'src/test/**',
        'src/main.jsx',
        'src/index.css',
        'src/App.css',
        'src/**/*.jsx',
      ],
      thresholds: {
        // Umbrales sobre módulos JS de negocio (cognitoAuth + novedadRules)
        lines: 90,
        functions: 72,
        branches: 90,
        statements: 85,
      },
    },
  },
});
