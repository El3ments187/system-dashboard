import { useState, useCallback, useRef, useEffect } from "react";

interface PanelErrorInfo {
  timestamp: number;
  message: string;
  name: string;
  stack?: string;
  responseText?: string;
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  type: "network" | "http" | "parse" | "data" | "runtime" | "unknown";
}

interface UsePanelErrorHandlingReturn<T> {
  data: T | null;
  loading: boolean;
  error: PanelErrorInfo | null;
  retry: () => void;
  hasError: boolean;
  getFriendlyMessage: () => string;
}

/**
 * Hook that wraps panel data fetching with robust error handling.
 * Handles network failures, HTTP errors, JSON parse errors, data validation errors, and runtime errors.
 */
export function usePanelWithErrorHandling<T>(
  fetchFn: () => Promise<T>,
  panelName: string,
  deps: any[] = [],
): UsePanelErrorHandlingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PanelErrorInfo | null>(null);

  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      const errorInfo = classifyError(err, panelName);
      // eslint-disable-next-line no-console
      console.error(`[Panel Error] ${panelName}:`, errorInfo);
      setError(errorInfo);
    } finally {
      setLoading(false);
    }
  }, [panelName]);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [...deps, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    retry,
    hasError: error !== null,
    getFriendlyMessage: () => getFriendlyMessage(error, panelName),
  };
}

function classifyNetworkOrTimeout(
  msg: string,
  lower: string,
  err: Error,
  panelName: string,
  timestamp: number,
): PanelErrorInfo | null {
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("failed")
  ) {
    return {
      timestamp,
      message: msg,
      name: err.name || "NetworkError",
      stack: err.stack,
      type: "network",
      endpoint: panelName,
    };
  }
  if (lower.includes("timeout")) {
    return {
      timestamp,
      message: msg,
      name: "TimeoutError",
      stack: err.stack,
      type: "network",
      endpoint: panelName,
    };
  }
  return null;
}

function classifyHttpError(
  msg: string,
  err: Error,
  panelName: string,
  timestamp: number,
): PanelErrorInfo | null {
  const httpMatch = msg.match(/HTTP (\d+): (.+)/);
  if (!httpMatch) return null;
  const statusCode = parseInt(httpMatch[1], 10);
  const statusText = httpMatch[2];
  const type: PanelErrorInfo["type"] = statusCode >= 400 ? "http" : "unknown";
  return {
    timestamp,
    message: msg,
    name: `HTTP ${statusCode} Error`,
    stack: err.stack,
    statusCode,
    statusText,
    type,
    endpoint: panelName,
  };
}

function classifyErrorInstance(
  err: Error,
  panelName: string,
  timestamp: number,
): PanelErrorInfo {
  const msg = err.message || "";
  const lower = msg.toLowerCase();

  const networkResult = classifyNetworkOrTimeout(
    msg,
    lower,
    err,
    panelName,
    timestamp,
  );
  if (networkResult) return networkResult;

  const httpResult = classifyHttpError(msg, err, panelName, timestamp);
  if (httpResult) return httpResult;

  if (lower.includes("json") || lower.includes("parse")) {
    return {
      timestamp,
      message: msg,
      name: "ParseError",
      stack: err.stack,
      type: "parse",
      endpoint: panelName,
    };
  }

  if (
    lower.includes("cannot read") ||
    lower.includes("cannot convert") ||
    lower.includes("undefined")
  ) {
    return {
      timestamp,
      message: msg,
      name: "RuntimeError",
      stack: err.stack,
      type: "runtime",
      endpoint: panelName,
    };
  }

  return {
    timestamp,
    message: msg,
    name: err.name || "Error",
    stack: err.stack,
    type: "unknown",
    endpoint: panelName,
  };
}

function classifyError(err: any, panelName: string): PanelErrorInfo {
  const timestamp = Date.now();
  if (err instanceof Error)
    return classifyErrorInstance(err, panelName, timestamp);
  if (typeof err === "string")
    return {
      timestamp,
      message: err,
      name: "Error",
      type: "unknown",
      endpoint: panelName,
    };
  if (typeof err === "object" && err !== null)
    return {
      timestamp,
      message: JSON.stringify(err),
      name: "Error",
      type: "unknown",
      endpoint: panelName,
    };
  return {
    timestamp,
    message: "Unknown error occurred",
    name: "Error",
    type: "unknown",
    endpoint: panelName,
  };
}

/**
 * Generate a user-friendly error message based on the error type.
 */
function getFriendlyMessage(
  error: PanelErrorInfo | null,
  panelName: string,
): string {
  if (!error) return "";

  const label = panelName || "Panel";

  switch (error.type) {
    case "network":
      return `Unable to connect to the ${label} metrics service. Check your network connection or try again later.`;
    case "http":
      if (
        error.statusCode === 500 ||
        error.statusCode === 502 ||
        error.statusCode === 503
      ) {
        return `The ${label} backend server is temporarily unavailable. Please try again.`;
      }
      if (error.statusCode === 404) {
        return `The ${label} data endpoint is not available. The backend may need to be updated.`;
      }
      return `The ${label} endpoint returned an error (HTTP ${error.statusCode}). Please try again.`;
    case "parse":
      return `The ${label} data format is invalid. The backend may have changed its response format.`;
    case "data":
      return `The ${label} data returned unexpected values. Data may be incomplete.`;
    case "runtime":
      return `An error occurred while displaying ${label.toLowerCase()} data. Please try refreshing the panel.`;
    case "unknown":
    default:
      return `Unable to load ${label} data. Please try refreshing the panel.`;
  }
}
