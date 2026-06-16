import { createContext, useContext, useCallback, useState } from 'react';

interface LiveDataControlsContextValue {
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
}

const LiveDataControlsContext = createContext<LiveDataControlsContextValue | null>(null);

export function LiveDataControlsProvider({ children }: { children: React.ReactNode }) {
  const [isPaused, setIsPaused] = useState(false);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);
  const toggle = useCallback(() => setIsPaused(prev => !prev), []);

  const value: LiveDataControlsContextValue = { isPaused, pause, resume, toggle };

  return (
    <LiveDataControlsContext.Provider value={value}>
      {children}
    </LiveDataControlsContext.Provider>
  );
}

export function useLiveDataControlsContext(): LiveDataControlsContextValue {
  const ctx = useContext(LiveDataControlsContext);
  if (!ctx) throw new Error('useLiveDataControlsContext must be used within LiveDataControlsProvider');
  return ctx;
}
