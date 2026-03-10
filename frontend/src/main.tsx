import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App.tsx'
import './index.css'
import { DisplaySettingsProvider } from './context/DisplaySettingsContext'
import { TimerProvider } from './context/TimerContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DisplaySettingsProvider>
      <TimerProvider>
        <App />
      </TimerProvider>
    </DisplaySettingsProvider>
  </React.StrictMode>,
)
