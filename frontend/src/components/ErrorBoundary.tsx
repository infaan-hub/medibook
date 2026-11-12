import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

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
          <h2>{isChunkError ? i18n.t("common.newAppVersion") : i18n.t("common.somethingWentWrong")}</h2>
          {isChunkError && (
            <p style={{ color: "#666" }}>
              {i18n.t("common.reloadToContinue")}
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
            {isChunkError ? i18n.t("common.reloadApp") : i18n.t("common.goHome")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
