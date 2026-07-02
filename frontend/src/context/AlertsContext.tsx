import { createContext, useContext, useCallback, useState } from "react";

export enum AlertSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error",
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  subsystem: string;
  message: string;
}

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
  unreadCount: number;
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
    await fetch("/api/alerts", { method: "DELETE" });
    setAlerts([]);
  }, []);

  const setAlertsValue = useCallback((alerts: Alert[]) => {
    setAlerts(alerts);
  }, []);

  const unreadCount = alerts.length;

  const value: AlertsContextValue = {
    alerts,
    addAlert,
    removeAlert,
    clearAlerts,
    setAlerts: setAlertsValue,
    unreadCount,
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
