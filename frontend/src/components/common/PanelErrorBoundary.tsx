import { Component, ErrorInfo, ReactNode } from 'react';
import PanelErrorState from './PanelErrorState';

interface PanelErrorBoundaryProps {
  children: ReactNode;
  panelName: string;
  onPanelError?: (panelName: string, error: Error, errorInfo: ErrorInfo) => void;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary for individual dashboard panels.
 * Catches render errors and displays a friendly error state
 * without crashing the dashboard or affecting adjacent panels.
 */
export default class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromProps(_nextProps: PanelErrorBoundaryProps) {
    // Reset error state when panel name changes (retry scenario)
    return { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console immediately (before React renders)
    console.error(`[Dashboard Error] ${this.props.panelName} panel failed:`, error);
    if (error.stack) {
      console.error(`[Dashboard Error] ${this.props.panelName} stack trace:`, error.stack);
    }

    // Notify parent handler if provided
    if (this.props.onPanelError) {
      this.props.onPanelError(this.props.panelName, error, errorInfo);
    }

    this.setState({
      hasError: true,
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="metric-card">
          <PanelErrorState
            panelName={this.props.panelName}
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return this.props.children;
  }

  private handleRetry = () => {
    // Force re-render by resetting error state
    // The parent component will re-fetch data via its own retry logic
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };
}
