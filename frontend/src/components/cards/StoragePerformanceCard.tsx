import { useMetricsContext } from "../../context/MetricsContext";
import { Activity } from "lucide-react";
import PanelErrorBoundary from "../common/PanelErrorBoundary";
import PanelErrorState from "../common/PanelErrorState";
import StorageHistoryChart from "../../charts/StorageHistoryChart";

export default function StoragePerformanceCard() {
  const {
    storageHistories,
    storageDevices,
    storageLoading,
    storageError,
    retryStorage,
  } = useMetricsContext();

  if (storageLoading) {
    return (
      <PanelErrorBoundary panelName="Storage Performance">
        <div
          className="metric-card"
          style={{ gridColumn: "1 / -1", opacity: 0.5 }}
        >
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={16} style={{ color: "var(--accent-primary)" }} />
              <span className="card-title">Storage Performance</span>
            </div>
          </div>
          <div
            style={{
              padding: 8,
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="skeleton" style={{ height: 200, width: "100%" }} />
          </div>
        </div>
      </PanelErrorBoundary>
    );
  }

  if (storageError) {
    return (
      <PanelErrorBoundary panelName="Storage Performance">
        <PanelErrorState
          panelName="Storage Performance"
          error={new Error(storageError)}
          errorInfo={null}
          onRetry={retryStorage}
        />
      </PanelErrorBoundary>
    );
  }

  const hasHistory = storageHistories.size > 0;
  if (!hasHistory && storageDevices.length === 0) {
    return null;
  }

  return (
    <PanelErrorBoundary panelName="Storage Performance">
      <div
        className="metric-card"
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={20} style={{ color: "var(--accent-primary)" }} />
            <span className="card-title">Storage Performance</span>
          </div>
          <span
            style={{
              color: "var(--text-muted)",
              fontWeight: 400,
              fontSize: "12px",
            }}
          >
            (Last 60s)
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <StorageHistoryChart data={storageHistories} />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
