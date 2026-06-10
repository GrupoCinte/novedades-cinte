import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { UiThemeProvider } from '@cinte/ui-shell';
import './index.css';
import DevRoot from './Module.jsx';

const mockAuth = { user: { role: 'super_admin', email: 'dev@local.test' } };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UiThemeProvider syncDocumentLightClass>
      <BrowserRouter>
        <DevRoot auth={mockAuth} onLogout={() => {}} token="" />
      </BrowserRouter>
    </UiThemeProvider>
  </StrictMode>
);
