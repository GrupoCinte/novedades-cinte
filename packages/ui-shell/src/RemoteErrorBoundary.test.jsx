import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { RemoteErrorBoundary } from './RemoteErrorBoundary.jsx';

afterEach(() => cleanup());

describe('RemoteErrorBoundary', () => {
  it('renderiza a los hijos si no hay errores', () => {
    render(
      <RemoteErrorBoundary>
        <div>Contenido del MFE</div>
      </RemoteErrorBoundary>
    );
    expect(screen.getByText('Contenido del MFE')).toBeInTheDocument();
  });

  it('atrapa errores de renderizado y muestra el fallback por defecto', () => {
    // Evitar ruido en la consola de test silenciando console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Broken = () => {
      throw new Error('Simulated MFE crash');
    };

    render(
      <RemoteErrorBoundary>
        <Broken />
      </RemoteErrorBoundary>
    );

    expect(screen.getByText('Módulo no disponible')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});
