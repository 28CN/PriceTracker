'use client';

import { LoaderCircle, Radar, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

type RefreshButtonProps = {
  productId?: string;
  linkId?: string;
};

export default function RefreshButton({ productId, linkId }: RefreshButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function handleRefresh() {
    const startedAt = performance.now();
    setIsLoading(true);
    setMessage(null);
    let nextMessage = 'Refresh queued.';

    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, linkId })
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Could not start the refresh.');
      }

      nextMessage = data.message || 'Refresh queued.';
    } catch (error) {
      nextMessage = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      const remaining = 900 - (performance.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      setIsLoading(false);
      setMessage(nextMessage);
    }
  }

  return (
    <div className="panel-wrap">
      <button
        type="button"
        className="icon-button"
        onClick={handleRefresh}
        disabled={isLoading}
        aria-label="Refresh prices now"
        title="Refresh prices now"
      >
        {isLoading ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <RefreshCw size={18} aria-hidden="true" />
        )}
      </button>
      {isLoading || message ? (
        <div className="panel refresh-panel" role="status" aria-live="polite">
          {isLoading ? (
            <div className="refresh-activity">
              <span className="refresh-radar" aria-hidden="true">
                <Radar size={23} />
                <i />
              </span>
              <span>
                <strong>Checking retailer pages…</strong>
                <small>Preparing a fresh price scan</small>
              </span>
            </div>
          ) : (
            <p className="hint">{message}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
