import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from '@/App.jsx'
import '@/index.css'

// Inicialização do Sentry para Observabilidade e Monitoramento de Erros em Produção
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Rastreamento de performance
    tracesSampleRate: 1.0,
    // Replay de sessões em caso de erro
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event, hint) {
      // Captura automática de exceções para a Central de Pendências do SuperAdmin
      if (hint?.originalException) {
        import('@/services/issueTracker')
          .then(({ autoCaptureSentryEvent }) => {
            autoCaptureSentryEvent(event, hint);
          })
          .catch(() => {});
      }
      return event;
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
