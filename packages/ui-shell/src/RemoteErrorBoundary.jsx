import React from 'react';

export function ModuleLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 font-body text-sm text-slate-500">
      Cargando módulo…
    </div>
  );
}

export function ModuleUnavailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center font-body">
      <p className="text-sm font-semibold text-slate-800">Módulo no disponible</p>
      <p className="max-w-md text-xs text-slate-500">
        No se pudo cargar el microfrontend. Verifica que todos los servicios de desarrollo estén en ejecución.
      </p>
    </div>
  );
}

export class RemoteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[RemoteErrorBoundary] Fallo de renderizado en módulo remoto:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ModuleUnavailable />;
    }
    return this.props.children;
  }
}
