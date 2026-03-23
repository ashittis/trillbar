/**
 * Hook: subscribe to a job SSE stream URL.
 * Calls onEvent for each JSON message. Closes on done/failed.
 */
import { useEffect, useRef } from "react";

export interface JobSSEEvent {
  job_id: string;
  job_type: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
}

export function useJobSSE(url: string | null, onEvent: (e: JobSSEEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as JobSSEEvent;
        onEventRef.current(data);
        if (data.status === "done" || data.status === "failed") {
          es.close();
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => es.close();
  }, [url]);
}
