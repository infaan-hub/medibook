import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MediBook ErrorBoundary]", error, info);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const errorMessage = this.state.error?.message ?? "";
      const isChunkError =
        this.state.error?.name === "ChunkLoadError" ||
        errorMessage.includes("ChunkLoadError") ||
        errorMessage.includes("Loading chunk") ||
        (errorMessage.includes("chunk") && errorMessage.includes("failed"));
      return (
        <div style={{ padding: 24, fontFamily: "system-ui" }}>
          <h2>{isChunkError ? "A new app version is available" : "Something went wrong"}</h2>
          {isChunkError && (
            <p style={{ color: "#666" }}>
              Reload the app to load its latest files and continue.
            </p>
          )}
          <p style={{ color: "#666" }}>{this.state.error?.message}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (isChunkError) window.location.reload();
              else window.location.href = "/";
            }}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "#09A99E",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {isChunkError ? "Reload app" : "Go to Home"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
