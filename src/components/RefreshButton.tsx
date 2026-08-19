'use client';

import { useState } from 'react';

type RefreshButtonProps = {
  productId?: string;
  linkId?: string;
  label?: string;
};

export default function RefreshButton({
  productId,
  linkId,
  label = 'Manual refresh'
}: RefreshButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId,
          linkId
        })
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger refresh.');
      }

      setMessage(data.message || 'Refresh queued. Check back in a minute or two.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown error';
      setMessage(text);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid #d0d7de',
          background: isLoading ? '#f6f8fa' : '#111827',
          color: isLoading ? '#6b7280' : '#ffffff',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          width: 'fit-content'
        }}
      >
        {isLoading ? 'Submitting...' : label}
      </button>
      {message ? (
        <p style={{ margin: 0, fontSize: 14, color: '#4b5563' }}>{message}</p>
      ) : null}
    </div>
  );
}

