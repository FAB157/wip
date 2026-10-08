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
    // PEZZO DI APP VECCHIO DOPO UN DEPLOY (07/10/2026): «Failed to fetch dynamically imported module
    // …/assets/AdminPanel-XXXX.js». La pagina aperta prima del deploy chiede un modulo lazy col nome vecchio,
    // che su Vercel non esiste più: «Qualcosa è andato storto» aprendo l'Admin. Non è un errore dell'app ma
    // della versione: si ricarica UNA volta da soli (segno in sessionStorage contro i cicli), senza registrarlo
    // come crash.
    const msg = String(error?.message || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|error loading dynamically imported module/i.test(msg)) {
      try {
        const chiave = 'wip_ricarica_modulo_vecchio';
        const quando = Number(sessionStorage.getItem(chiave) || 0);
        if (Date.now() - quando > 60_000) {
          sessionStorage.setItem(chiave, String(Date.now()));
          window.location.reload();
          return;
        }
      } catch { /* sessionStorage assente: si passa al registro e al tasto Ricarica */ }
    }
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
