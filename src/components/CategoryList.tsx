'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import CategorySection from '@/components/CategorySection';
import {
  moveItem,
  sortCategoryGroups,
  syncOrderList,
  type CategoryGroup
} from '@/lib/productSort';

const PIN_STORAGE_KEY = 'pricetracker.pinnedCategories';
const OTHER_ORDER_KEY = 'pricetracker.otherCategoryOrder';
const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE_PX = 8;
const FLIP_MS = 200;

type Zone = 'pinned' | 'other';

type DragGhost = {
  category: string;
  label: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  toneClass: string;
};

function readStringList(key: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, value: string[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function indexFromRows(rows: HTMLElement[], clientY: number): number {
  if (rows.length === 0) {
    return 0;
  }
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return index;
    }
  }
  return rows.length - 1;
}

function captureRects(root: HTMLElement | null): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (!root) {
    return map;
  }
  root.querySelectorAll<HTMLElement>('[data-category]').forEach((node) => {
    const key = node.dataset.category;
    if (key) {
      map.set(key, node.getBoundingClientRect());
    }
  });
  return map;
}

function toneClassFor(name: string): string {
  const tones = [
    'tone-mint',
    'tone-sky',
    'tone-peach',
    'tone-lilac',
    'tone-sand',
    'tone-rose',
    'tone-teal'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return tones[hash % tones.length];
}

export default function CategoryList({ groups }: { groups: CategoryGroup[] }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const [otherOrder, setOtherOrder] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const dragRef = useRef<{
    zone: Zone;
    category: string;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    activated: boolean;
    timer: number | null;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const pinnedStackRef = useRef<HTMLDivElement>(null);
  const otherStackRef = useRef<HTMLDivElement>(null);
  const singleStackRef = useRef<HTMLDivElement>(null);
  const zoneSizesRef = useRef({ pinned: 0, other: 0 });
  const pendingFlipRef = useRef<Map<string, DOMRect> | null>(null);
  const ghostNodeRef = useRef<HTMLDivElement>(null);
  const ghostPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const names = groups.map((group) => group.category);
    const storedPinned = readStringList(PIN_STORAGE_KEY);
    const pinSet = new Set(storedPinned);
    const nextPinned = syncOrderList(
      storedPinned,
      names.filter((name) => pinSet.has(name))
    );
    const nextOther = syncOrderList(
      readStringList(OTHER_ORDER_KEY),
      names.filter((name) => !nextPinned.includes(name))
    );

    setPinned(nextPinned);
    setOtherOrder(nextOther);
    writeStringList(PIN_STORAGE_KEY, nextPinned);
    writeStringList(OTHER_ORDER_KEY, nextOther);
  }, [groups]);

  const ordered = useMemo(
    () => sortCategoryGroups(groups, pinned, otherOrder),
    [groups, pinned, otherOrder]
  );
  const pinnedGroups = ordered.filter((group) => pinned.includes(group.category));
  const otherGroups = ordered.filter((group) => !pinned.includes(group.category));
  const useColumns = pinnedGroups.length > 0 && otherGroups.length > 0;
  zoneSizesRef.current = { pinned: pinnedGroups.length, other: otherGroups.length };

  useLayoutEffect(() => {
    const first = pendingFlipRef.current;
    if (!first) {
      return;
    }
    pendingFlipRef.current = null;

    const roots = useColumns
      ? [pinnedStackRef.current, otherStackRef.current]
      : [singleStackRef.current];

    for (const root of roots) {
      if (!root) {
        continue;
      }
      root.querySelectorAll<HTMLElement>('[data-category]').forEach((node) => {
        const key = node.dataset.category;
        if (!key || key === dragging) {
          return;
        }
        const prev = first.get(key);
        if (!prev) {
          return;
        }
        const next = node.getBoundingClientRect();
        const dy = prev.top - next.top;
        if (Math.abs(dy) < 0.5) {
          return;
        }
        node.style.transition = 'none';
        node.style.transform = `translateY(${dy}px)`;
        void node.offsetHeight;
        node.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        node.style.transform = '';
      });
    }
  }, [pinned, otherOrder, dragging, useColumns]);

  function togglePin(category: string) {
    setPinned((current) => {
      if (current.includes(category)) {
        const next = current.filter((name) => name !== category);
        writeStringList(PIN_STORAGE_KEY, next);
        setOtherOrder((others) => {
          const prepended = [category, ...others.filter((name) => name !== category)];
          writeStringList(OTHER_ORDER_KEY, prepended);
          return prepended;
        });
        return next;
      }

      const next = [...current, category];
      writeStringList(PIN_STORAGE_KEY, next);
      setOtherOrder((others) => {
        const trimmed = others.filter((name) => name !== category);
        writeStringList(OTHER_ORDER_KEY, trimmed);
        return trimmed;
      });
      return next;
    });
  }

  function activeStack(zone: Zone): HTMLElement | null {
    if (useColumns) {
      return zone === 'pinned' ? pinnedStackRef.current : otherStackRef.current;
    }
    return singleStackRef.current;
  }

  function reorderWithinZone(zone: Zone, category: string, toIndex: number) {
    const stack = activeStack(zone);
    const before = captureRects(stack);

    const apply = (current: string[]) => {
      const from = current.indexOf(category);
      if (from < 0) {
        return current;
      }
      const clamped = Math.max(0, Math.min(toIndex, current.length - 1));
      if (from === clamped) {
        return current;
      }
      pendingFlipRef.current = before;
      const next = moveItem(current, from, clamped);
      writeStringList(zone === 'pinned' ? PIN_STORAGE_KEY : OTHER_ORDER_KEY, next);
      return next;
    };

    if (zone === 'pinned') {
      setPinned(apply);
      return;
    }
    setOtherOrder(apply);
  }

  function moveGhost(clientX: number, clientY: number) {
    const state = dragRef.current;
    const current = ghostNodeRef.current;
    if (!state || !current) {
      return;
    }
    // Keep latest ghost metrics on the element dataset after first paint.
    const offsetX = Number(current.dataset.offsetX || 0);
    const offsetY = Number(current.dataset.offsetY || 0);
    const x = clientX - offsetX;
    const y = clientY - offsetY;
    ghostPosRef.current = { x, y };
    current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function endDrag() {
    const state = dragRef.current;
    if (state?.timer != null) {
      window.clearTimeout(state.timer);
    }
    if (state?.activated) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setDragging(null);
    setGhost(null);
    setIsReordering(false);
    pendingFlipRef.current = null;
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (!state.activated) {
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX && state.timer != null) {
          window.clearTimeout(state.timer);
          state.timer = null;
        }
        return;
      }

      event.preventDefault();
      moveGhost(event.clientX, event.clientY);

      if (useColumns) {
        const stack =
          state.zone === 'pinned' ? pinnedStackRef.current : otherStackRef.current;
        const rows = stack
          ? [...stack.querySelectorAll<HTMLElement>('[data-category]')]
          : [];
        reorderWithinZone(state.zone, state.category, indexFromRows(rows, event.clientY));
        return;
      }

      const stack = singleStackRef.current;
      const allRows = stack
        ? [...stack.querySelectorAll<HTMLElement>('[data-category]')]
        : [];
      const pinnedCount = zoneSizesRef.current.pinned;

      if (state.zone === 'pinned') {
        const rows = allRows.slice(0, pinnedCount);
        reorderWithinZone('pinned', state.category, indexFromRows(rows, event.clientY));
        return;
      }

      const rows = allRows.slice(pinnedCount);
      if (rows[0] && event.clientY < rows[0].getBoundingClientRect().top) {
        reorderWithinZone('other', state.category, 0);
        return;
      }
      reorderWithinZone('other', state.category, indexFromRows(rows, event.clientY));
    }

    function onPointerUp(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }
      endDrag();
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [useColumns]);

  function startPress(category: string, zone: Zone, event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest('.category-pin')) {
      return;
    }

    const timer = window.setTimeout(() => {
      const state = dragRef.current;
      if (!state || state.category !== category) {
        return;
      }

      state.activated = true;
      setIsReordering(true);
      setDragging(category);

      // Wait one frame so rows collapse to single-line height before measuring.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const live = dragRef.current;
          if (!live || !live.activated || live.category !== category) {
            return;
          }
          const source = document.querySelector<HTMLElement>(
            `[data-category="${CSS.escape(category)}"]`
          );
          const rect = source?.getBoundingClientRect();
          if (!rect) {
            return;
          }

          const pointerX = live.lastX;
          const pointerY = live.lastY;
          const offsetX = Math.min(Math.max(pointerX - rect.left, 16), rect.width - 16);
          const offsetY = Math.min(Math.max(pointerY - rect.top, 12), rect.height - 12);
          const x = pointerX - offsetX;
          const y = pointerY - offsetY;
          ghostPosRef.current = { x, y };
          setGhost({
            category,
            label: category,
            width: rect.width,
            height: Math.max(rect.height, 44),
            offsetX,
            offsetY,
            x,
            y,
            toneClass: toneClassFor(category)
          });
        });
      });
    }, LONG_PRESS_MS);

    dragRef.current = {
      zone,
      category,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      activated: false,
      timer
    };
  }

  function renderGroup(group: CategoryGroup, zone: Zone) {
    const isPinned = zone === 'pinned';
    const hasDeal = group.products.some(
      (product) =>
        product.targetPrice !== null &&
        product.lowestPrice !== null &&
        product.lowestPrice <= product.targetPrice
    );

    return (
      <CategorySection
        key={group.category}
        category={group.category}
        products={group.products}
        defaultOpen={!isReordering && (isPinned || hasDeal)}
        isPinned={isPinned}
        onTogglePin={() => togglePin(group.category)}
        isReordering={isReordering}
        isDragging={dragging === group.category}
        dragHandleProps={{
          onPointerDown: (event) => startPress(group.category, zone, event),
          onClickCapture: (event) => {
            if (suppressClickRef.current || isReordering) {
              event.preventDefault();
              event.stopPropagation();
            }
          },
          style: { touchAction: isReordering ? 'none' : undefined }
        }}
      />
    );
  }

  const boardClass = `category-board${isReordering ? ' is-reordering' : ''}`;
  const stackClass = `category-stack${isReordering ? ' is-reordering' : ''}`;

  const ghostLayer = ghost ? (
    <div
      ref={ghostNodeRef}
      className={`category-drag-ghost ${ghost.toneClass}`}
      data-offset-x={ghost.offsetX}
      data-offset-y={ghost.offsetY}
      style={{
        width: ghost.width,
        height: ghost.height,
        transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)`
      }}
    >
      <span className="category-drag-ghost-name">{ghost.label}</span>
    </div>
  ) : null;

  if (!useColumns) {
    return (
      <>
        <div className={stackClass} ref={singleStackRef}>
          {pinnedGroups.map((group) => renderGroup(group, 'pinned'))}
          {otherGroups.map((group) => renderGroup(group, 'other'))}
        </div>
        {ghostLayer}
      </>
    );
  }

  return (
    <>
      <div className={boardClass}>
        <div className="category-column">
          <p className="category-column-label">Pinned</p>
          <div className={stackClass} ref={pinnedStackRef}>
            {pinnedGroups.map((group) => renderGroup(group, 'pinned'))}
          </div>
        </div>
        <div className="category-column">
          <p className="category-column-label">Everything else</p>
          <div className={stackClass} ref={otherStackRef}>
            {otherGroups.map((group) => renderGroup(group, 'other'))}
          </div>
        </div>
      </div>
      {ghostLayer}
    </>
  );
}
