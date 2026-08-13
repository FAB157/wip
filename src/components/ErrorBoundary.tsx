import React, { ErrorInfo, ReactNode } from 'react';
import { logSystemError } from '../lib/errorLogger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Lo stack tecnico NON va mostrato all'utente: finisce solo nella tabella
    // system_errors (tab admin "Errori di sistema") tramite errorLogger.
    logSystemError(error?.message || 'React render crash', {
      level: 'critical',
      stack: `${error?.stack || ''}\n\nComponent stack:${errorInfo?.componentStack || ''}`,
      context: { source: 'ErrorBoundary' },
    });
  }

  private handleReload = () => {
    // Ricarica pulita: risolve la maggior parte dei crash di rendering
    // (stato incoerente, chunk lazy non caricato) senza intervento tecnico.
    try {
      window.location.reload();
    } catch {
      (this as any).setState({ hasError: false });
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', backgroundColor: '#f8f5f0', color: '#1e3a8a', height: '100vh', width: '100vw', zIndex: 99999, position: 'fixed', top: 0, left: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>😕</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Qualcosa è andato storto</h1>
          <p style={{ fontSize: '15px', maxWidth: '320px', lineHeight: 1.5, opacity: 0.8, marginBottom: '24px' }}>
            Si è verificato un errore imprevisto. Ricarica l'app per continuare: i tuoi dati sono al sicuro.
          </p>
          <button
            onClick={this.handleReload}
            style={{ backgroundColor: '#1e3a8a', color: '#ffffff', fontWeight: 800, fontSize: '15px', padding: '14px 32px', borderRadius: '16px', border: 'none', cursor: 'pointer' }}
          >
            Ricarica
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
