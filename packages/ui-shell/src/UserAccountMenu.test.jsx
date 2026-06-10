import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserAccountMenu from './UserAccountMenu.jsx';
import { UiThemeProvider } from './UiThemeContext.jsx';

vi.mock('@cinte/shared/comercialAccess.js', () => ({
  userHasNovedadesAdminAccess: () => true
}));

function renderMenu(props = {}) {
  return render(
    <MemoryRouter>
      <UiThemeProvider>
        <UserAccountMenu
          auth={{ user: { email: 'qa@test.com', name: 'QA User' } }}
          onLogout={vi.fn()}
          surface="header"
          {...props}
        />
      </UiThemeProvider>
    </MemoryRouter>
  );
}

afterEach(() => cleanup());

describe('UserAccountMenu', () => {
  it('muestra un solo menú de cuenta al abrir (sin duplicar ítems)', () => {
    renderMenu();
    fireEvent.click(screen.getByTitle('Menú de cuenta'));
    expect(screen.getAllByRole('menuitem', { name: /cerrar sesión/i })).toHaveLength(1);
    expect(screen.getAllByRole('menuitem', { name: /mi perfil/i })).toHaveLength(1);
  });
});
