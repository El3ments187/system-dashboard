import { useMetricsContext } from "../../context/MetricsContext";
import { MemoryStick } from "lucide-react";
import PanelErrorBoundary from "../common/PanelErrorBoundary";
import PanelErrorState from "../common/PanelErrorState";
import { useTooltip } from "../../components/common/TooltipProvider";
import { getMetricDescription } from "../../data/metricDescriptions";
import ProgressBar from "../shared/ProgressBar";
import { useProgressStatus } from "../../hooks/useProgressStatus";

interface CardProps {
  accent: { color: string; glow: string };
}

export default function MemoryCard({ accent }: CardProps) {
  const tooltip = useTooltip();
  const { memoryCurrentValues, memoryLoading, memoryError, retryMemory } =
    useMetricsContext();

  const currentValue = memoryCurrentValues[0];
  const usedValue = memoryCurrentValues[1];
  const totalValue = memoryCurrentValues[2];
  const swapUsedValue = memoryCurrentValues[3];
  const swapTotalValue = memoryCurrentValues[4];

  const { color: statusColor, label: statusLabel } =
    useProgressStatus(currentValue);

  if (memoryLoading) {
    return (
      <PanelErrorBoundary panelName="Memory">
        <div className="metric-card" style={{ opacity: 0.5 }}>
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MemoryStick size={16} style={{ color: accent.color }} />
              <span className="card-title">Memory</span>
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

  if (memoryError) {
    return (
      <PanelErrorBoundary panelName="Memory">
        <PanelErrorState
          panelName="Memory"
          error={new Error(memoryError)}
          errorInfo={null}
          onRetry={retryMemory}
        />
      </PanelErrorBoundary>
    );
  }

  return (
    <PanelErrorBoundary panelName="Memory">
      <div className="metric-card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MemoryStick size={16} style={{ color: accent.color }} />
            <span className="card-title">Memory</span>
          </div>
          <div className="card-status">
            <div className="status-dot" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <div className="card-value">
          {memoryLoading || currentValue === null ? "\u2014" : currentValue.toFixed(1)}
          <span className="card-unit">%</span>
        </div>
        <ProgressBar percent={currentValue ?? 0} />
        <div className="card-details">
          <div
            className="card-detail-item"
            onMouseEnter={(e) => {
              const desc = getMetricDescription("memory_used");
              if (desc)
                tooltip.setCardTooltip(
                  {
                    title: desc.title,
                    description: desc.description,
                    unit: desc.unit,
                  },
                  e,
                );
            }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Used</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {usedValue !== null ? `${usedValue.toFixed(1)} GB` : "\u2014"}
            </span>
          </div>
          <div
            className="card-detail-item"
            onMouseEnter={(e) => {
              const desc = getMetricDescription("memory_total");
              if (desc)
                tooltip.setCardTooltip(
                  {
                    title: desc.title,
                    description: desc.description,
                    unit: desc.unit,
                  },
                  e,
                );
            }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Total</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {totalValue !== null ? `${totalValue.toFixed(1)} GB` : "\u2014"}
            </span>
          </div>
          <div
            className="card-detail-item"
            onMouseEnter={(e) => {
              const desc = getMetricDescription("memory_swap_used");
              if (desc)
                tooltip.setCardTooltip(
                  {
                    title: desc.title,
                    description: desc.description,
                    unit: desc.unit,
                  },
                  e,
                );
            }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Swap Used</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {swapUsedValue !== null
                ? `${swapUsedValue.toFixed(1)} GB`
                : "\u2014"}
            </span>
          </div>
          <div
            className="card-detail-item"
            onMouseEnter={(e) => {
              const desc = getMetricDescription("memory_swap_total");
              if (desc)
                tooltip.setCardTooltip(
                  {
                    title: desc.title,
                    description: desc.description,
                    unit: desc.unit,
                  },
                  e,
                );
            }}
            onMouseLeave={() => tooltip.setCardTooltip(null)}
          >
            <span className="card-detail-label">Swap Total</span>
            <span className="card-detail-value" style={{ color: accent.color }}>
              {swapTotalValue !== null
                ? `${swapTotalValue.toFixed(1)} GB`
                : "\u2014"}
            </span>
          </div>
          <div className="card-filler" />
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
