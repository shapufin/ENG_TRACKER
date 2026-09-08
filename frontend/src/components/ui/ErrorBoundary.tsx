import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "./button";
import { GlassCard } from "./GlassCard";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  // fallow-ignore-next-line complexity
  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-6 text-center">
          <GlassCard className="max-w-md border-rose-500/20 bg-rose-500/5 p-8">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-rose-500/10 p-3">
                <AlertCircle className="h-8 w-8 text-rose-500" />
              </div>
            </div>
            <h2 className="mb-2 text-xl font-bold tracking-tight">Something went wrong</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              An unexpected error occurred in this component. We've been notified and are looking
              into it.
            </p>
            {isDev && this.state.error && (
              <pre className="mb-6 max-h-40 overflow-auto rounded bg-muted p-3 text-left font-mono text-[10px] text-muted-foreground">
                {this.state.error.toString()}
              </pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={this.handleReset} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}
