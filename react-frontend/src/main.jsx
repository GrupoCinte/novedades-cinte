import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { UiThemeProvider } from './UiThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UiThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </UiThemeProvider>
  </StrictMode>,
)
