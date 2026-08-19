'use client';

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
    setIsLoading(true);
    setMessage(null);

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

      setMessage(data.message || 'Refresh queued.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
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
        {isLoading ? '...' : '\u21bb'}
      </button>
      {message ? (
        <div className="panel" role="status">
          <p className="hint">{message}</p>
        </div>
      ) : null}
    </div>
  );
}
