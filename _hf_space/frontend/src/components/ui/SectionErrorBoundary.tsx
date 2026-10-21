import React from 'react';
import { ErrorState } from './ErrorState';

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ClimateShield section error]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title={this.props.label || 'Section failed'}
          detail={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
