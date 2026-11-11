import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from '@/App.jsx'
import '@/index.css'

// Inicialização do Sentry para Observabilidade e Monitoramento de Erros em Produção
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_APP_ENV || (import.meta.env.PROD ? 'production' : 'development'),
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
      // Evita recursão infinita para mensagens já disparadas pelo próprio issueTracker
      const msg = String(event?.message || hint?.originalException?.message || '');
      const alreadyTagged = /^\[(SENTRY|CHECKOUT|WEBHOOK|PRINTER|MANUAL)\]/i.test(msg.trim());
      if (hint?.originalException && !alreadyTagged && !event?.tags?.from_issue_tracker) {
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
