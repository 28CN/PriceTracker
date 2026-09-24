'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatWhen } from '@/lib/format';
import type { CrawlEventView } from '@/lib/types';

const SESSION_GAP_MS = 20 * 60 * 1000;

type NoticeGroup = {
  id: string;
  title: string;
  startedAt: string;
  events: CrawlEventView[];
  unread: number;
  worst: string;
};

function eventTone(event: CrawlEventView): string {
  const level = (event.level || 'info').toLowerCase();
  const msg = event.message.toLowerCase();
  if (level === 'error' || msg.includes('would not load') || msg.includes('looks dead')) {
    return 'error';
  }
  if (level === 'success' || (msg.includes('crawl finished') && msg.includes('no failures'))) {
    return 'success';
  }
  if (msg.includes('blocked') || msg.includes('akamai') || msg.includes('bot')) {
    return 'blocked';
  }
  if (msg.includes('unavailable')) {
    return 'stock';
  }
  if (level === 'warning' || msg.includes('could not find a price') || msg.includes('had trouble')) {
    return 'warning';
  }
  if (msg.startsWith('crawl started')) {
    return 'session';
  }
  return level === 'info' ? 'info' : level;
}

function groupTitle(events: CrawlEventView[]): string {
  const start = events.find((event) => event.message.toLowerCase().startsWith('crawl started'));
  if (start) {
    const when = formatWhen(start.createdAt);
    if (/github/i.test(start.message)) {
      return `Online crawl · ${when}`;
    }
    if (/this pc|local/i.test(start.message)) {
      return `Local crawl · ${when}`;
    }
    return `Crawl · ${when}`;
  }
  return `Notices · ${formatWhen(events[0]?.createdAt || '')}`;
}

function worstTone(events: CrawlEventView[]): string {
  const order = ['error', 'blocked', 'warning', 'stock', 'success', 'session', 'info'];
  let best = 'info';
  let bestRank = order.length;
  for (const event of events) {
    const tone = eventTone(event);
    const rank = order.indexOf(tone);
    if (rank >= 0 && rank < bestRank) {
      best = tone;
      bestRank = rank;
    }
  }
  return best;
}

function groupEvents(events: CrawlEventView[]): NoticeGroup[] {
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const groups: CrawlEventView[][] = [];

  for (const event of sorted) {
    const stamp = new Date(event.createdAt).getTime();
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push([event]);
      continue;
    }
    const anchor = new Date(current[current.length - 1].createdAt).getTime();
    if (Math.abs(anchor - stamp) <= SESSION_GAP_MS) {
      current.push(event);
    } else {
      groups.push([event]);
    }
  }

  return groups.map((items, index) => {
    const chronological = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return {
      id: chronological[0]?.id || `group-${index}`,
      title: groupTitle(chronological),
      startedAt: chronological[0]?.createdAt || '',
      events: chronological,
      unread: chronological.filter((event) => !event.isRead).length,
      worst: worstTone(chronological)
    };
  });
}

export default function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<CrawlEventView[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const wrapRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const node = wrapRef.current;
      if (node && !node.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const groups = useMemo(() => groupEvents(events), [events]);

  useEffect(() => {
    if (!isOpen || groups.length === 0) {
      return;
    }
    setExpanded((current) => {
      if (Object.keys(current).length > 0) {
        return current;
      }
      const first = groups[0];
      return first ? { [first.id]: true } : {};
    });
  }, [isOpen, groups]);

  async function markAllRead() {
    setUnread(0);
    setEvents((current) => current.map((event) => ({ ...event, isRead: true })));
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => undefined);
  }

  async function markOneRead(id: string) {
    const target = events.find((event) => event.id === id);
    if (!target || target.isRead) {
      return;
    }

    setEvents((current) =>
      current.map((event) => (event.id === id ? { ...event, isRead: true } : event))
    );
    setUnread((count) => Math.max(0, count - 1));
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).catch(() => undefined);
  }

  return (
    <div className="panel-wrap" ref={wrapRef}>
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
        aria-expanded={isOpen}
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

          {groups.map((group) => {
            const open = Boolean(expanded[group.id]);
            return (
              <div key={group.id} className={`notice-group ${group.worst}`}>
                <button
                  type="button"
                  className="notice-group-head"
                  onClick={() => {
                    setExpanded((current) => ({ ...current, [group.id]: !open }));
                  }}
                  aria-expanded={open}
                >
                  <span className="notice-group-title">{group.title}</span>
                  <span className="notice-group-meta">
                    {group.unread > 0 ? (
                      <span className="notice-group-unread">{group.unread}</span>
                    ) : null}
                    <span className="notice-group-count">{group.events.length}</span>
                    <span className="notice-group-chevron" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                  </span>
                </button>

                {open
                  ? group.events.map((event) => {
                      const tone = eventTone(event);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          className={`event ${tone}${event.isRead ? ' is-read' : ''}`}
                          onClick={() => void markOneRead(event.id)}
                          title={event.isRead ? 'Already read' : 'Mark as read'}
                        >
                          <p>{event.message}</p>
                          <time>{formatWhen(event.createdAt)}</time>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
