import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { Sentry } from "@/lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    console.error('ErrorBoundary caught error:', error);
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary - Uncaught error:', error, errorInfo);
    (Sentry as any).captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md">
            <Shield className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Noe gikk galt</h1>
            <p className="text-muted-foreground mb-4">
              Det oppstod en uventet feil. Prøv å laste siden på nytt.
            </p>
            {this.state.error && (
              <details className="text-left mb-4 p-4 bg-card rounded-lg border">
                <summary className="cursor-pointer font-medium mb-2">Tekniske detaljer</summary>
                <pre className="text-xs overflow-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <Button onClick={this.handleReset}>
              Last siden på nytt
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
