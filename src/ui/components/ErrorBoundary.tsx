import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  onNewGame?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 32,
          fontFamily: 'system-ui, sans-serif', color: '#2c3e50',
        }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 24, maxWidth: 400, textAlign: 'center' }}>
            An unexpected error occurred. You can start a new game to recover.
          </p>
          {this.state.error && (
            <pre style={{
              padding: 12, backgroundColor: '#f8f9fa', borderRadius: 6,
              fontSize: 12, color: '#e74c3c', marginBottom: 24,
              maxWidth: '90vw', overflow: 'auto',
            }}>
              {this.state.error.message}
            </pre>
          )}
          {this.props.onNewGame && (
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onNewGame!();
              }}
              style={{
                padding: '10px 24px', fontSize: 14,
                backgroundColor: '#3498db', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Start New Game
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
