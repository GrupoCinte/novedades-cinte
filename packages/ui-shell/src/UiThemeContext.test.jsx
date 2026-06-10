import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import {
  CINTE_UI_THEME_EVENT,
  UiThemeProvider,
  useUiTheme,
  resetUiThemeForTests
} from './UiThemeContext.jsx';

function ThemeReadout() {
  const { theme, toggleTheme } = useUiTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

function ThemeReadoutWithoutProvider() {
  return <ThemeReadout />;
}

beforeEach(() => {
  resetUiThemeForTests();
});

afterEach(() => cleanup());

describe('UiThemeContext store global', () => {
  it('toggleTheme actualiza clase html.cinte-ui-light', () => {
    render(
      <UiThemeProvider>
        <ThemeReadout />
      </UiThemeProvider>
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('cinte-ui-light')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('cinte-ui-light')).toBe(true);
  });

  it('sincroniza segundo árbol sin Provider (simula remote MFE)', () => {
    render(
      <UiThemeProvider>
        <ThemeReadout />
      </UiThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    cleanup();

    render(<ThemeReadoutWithoutProvider />);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('cinte-ui-light')).toBe(true);
  });

  it('reacciona a evento cinte-ui-theme-change en la misma ventana', () => {
    render(<ThemeReadoutWithoutProvider />);
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    act(() => {
      localStorage.setItem('cinte_ui_theme', 'light');
      window.dispatchEvent(new CustomEvent(CINTE_UI_THEME_EVENT, { detail: 'light' }));
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('cinte-ui-light')).toBe(true);
  });
});
