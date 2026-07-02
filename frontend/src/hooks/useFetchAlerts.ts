import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertSeverity, type Alert } from "../types/metrics";
import { useAlertsContext } from "../context/AlertsContext";

interface BackendAlert {
  id: number;
  severity: string;
  subsystem: string;
  message: string;
}

interface BackendAlertResponse {
  alerts: BackendAlert[];
}

function convertBackendAlert(ba: BackendAlert): Alert {
  return {
    id: `backend-${ba.id}`,
    timestamp: new Date().toISOString(),
    severity: ba.severity as AlertSeverity,
    subsystem: ba.subsystem,
    message: ba.message,
  };
}

export function useFetchAlerts() {
  const { setAlerts } = useAlertsContext();
  const prevDataRef = useRef<Alert[] | undefined>(undefined);

  const { data, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const json: BackendAlertResponse = await res.json();
      return json.alerts.map(convertBackendAlert);
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!data) return;
    const prev = prevDataRef.current;
    const changed =
      !prev ||
      prev.length !== data.length ||
      data.some((a, i) => a.id !== prev[i].id || a.message !== prev[i].message);
    if (changed) {
      prevDataRef.current = data;
      setAlerts(data);
    }
  }, [data, setAlerts]);

  return { alerts: data ?? [], refetch };
}
