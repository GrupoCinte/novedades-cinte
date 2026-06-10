import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';

afterEach(() => cleanup());

describe('AdminModuleSidebarBrand', () => {
  it('renderiza moduleContext en sidebar expandido', () => {
    render(
      <AdminModuleSidebarBrand
        variant="rail-expanded"
        isLight={false}
        asideHeaderBorder="border-b"
        moduleContext={<span>Subtítulo módulo</span>}
      />
    );
    expect(screen.getByText('Subtítulo módulo')).toBeInTheDocument();
  });

  it('oculta moduleContext en rail colapsado', () => {
    render(
      <AdminModuleSidebarBrand
        variant="rail-collapsed"
        isLight={false}
        asideHeaderBorder="border-b"
        moduleContext={<span>Subtítulo módulo</span>}
      />
    );
    expect(screen.queryByText('Subtítulo módulo')).not.toBeInTheDocument();
  });
});
