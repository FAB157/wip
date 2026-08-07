import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', height: '100vh', width: '100vw', zIndex: 99999, position: 'fixed', top: 0, left: 0 }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Si è verificato un errore imprevisto.</h1>
          <p style={{ marginTop: '10px' }}>Invia uno screenshot di questa schermata a Nicky.</p>
          <pre style={{ marginTop: '20px', whiteSpace: 'pre-wrap', backgroundColor: '#fecaca', padding: '10px', borderRadius: '5px', fontSize: '12px' }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
