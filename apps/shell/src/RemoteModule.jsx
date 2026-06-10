import { lazy, Suspense } from 'react';
import { RemoteErrorBoundary, ModuleLoading, ModuleUnavailable } from '@cinte/ui-shell';


const remoteCache = new Map();

function getRemoteComponent(loader) {
  const key = loader.toString();
  if (!remoteCache.has(key)) {
    remoteCache.set(key, lazy(loader));
  }
  return remoteCache.get(key);
}

export function RemoteModule({ loader, auth, onLogout, token, ...rest }) {
  const Component = getRemoteComponent(loader);
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <RemoteErrorBoundary fallback={<ModuleUnavailable />}>
        <Suspense fallback={<ModuleLoading />}>
          <Component auth={auth} onLogout={onLogout} token={token} {...rest} />
        </Suspense>
      </RemoteErrorBoundary>
    </div>
  );
}
