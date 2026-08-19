'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatWhen } from '@/lib/format';
import type { CrawlEventView } from '@/lib/types';

export default function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<CrawlEventView[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      const data = (await response.json()) as {
        events?: CrawlEventView[];
        unread?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Could not load notifications.');
      }

      setEvents(data.events || []);
      setUnread(data.unread || 0);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    setUnread(0);
    setEvents((current) => current.map((event) => ({ ...event, isRead: true })));
    await fetch('/api/notifications', { method: 'POST' }).catch(() => undefined);
  }

  return (
    <div className="panel-wrap">
      <button
        type="button"
        className="icon-button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) {
            void load();
          }
        }}
        aria-label="Crawler notifications"
        title="Crawler notifications"
      >
        {'\u2691'}
        {unread > 0 ? <span className="badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      {isOpen ? (
        <div className="panel">
          <div className="panel-title">
            <h2>Crawler notices</h2>
            {events.some((event) => !event.isRead) ? (
              <button type="button" className="button subtle" onClick={markAllRead}>
                Mark read
              </button>
            ) : null}
          </div>

          {error ? <p className="hint error">{error}</p> : null}

          {!error && events.length === 0 ? (
            <p className="hint">Nothing to report. Every link is behaving itself.</p>
          ) : null}

          {events.map((event) => (
            <div key={event.id} className={`event ${event.level}`}>
              <p>{event.message}</p>
              <time>{formatWhen(event.createdAt)}</time>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
