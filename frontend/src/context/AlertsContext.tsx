import { createContext, useContext, useCallback, useState } from "react";
import { AlertSeverity, type Alert } from "../types/metrics";

export { AlertSeverity, type Alert };

interface AlertsContextValue {
  alerts: Alert[];
  addAlert: (
    severity: AlertSeverity,
    subsystem: string,
    message: string,
  ) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => Promise<void>;
  setAlerts: (alerts: Alert[]) => void;
  alertCount: number;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const addAlert = useCallback(
    (severity: AlertSeverity, subsystem: string, message: string) => {
      // eslint-disable-next-line sonarjs/pseudo-random
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timestamp = new Date().toISOString();
      setAlerts((prev) => {
        const next = [...prev, { id, timestamp, severity, subsystem, message }];
        return next.length > 100 ? next.slice(-100) : next;
      });
    },
    [],
  );

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAlerts = useCallback(async () => {
    const response = await fetch("/api/alerts", { method: "DELETE" });
    if (response.ok) {
      setAlerts([]);
    }
  }, []);

  const setAlertsValue = useCallback((alerts: Alert[]) => {
    setAlerts(alerts);
  }, []);

  const alertCount = alerts.length;

  const value: AlertsContextValue = {
    alerts,
    addAlert,
    removeAlert,
    clearAlerts,
    setAlerts: setAlertsValue,
    alertCount,
  };

  return (
    <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
  );
}

export function useAlertsContext(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx)
    throw new Error("useAlertsContext must be used within AlertsProvider");
  return ctx;
}
