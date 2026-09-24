'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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

type Zone = 'pinned' | 'other';

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

export default function CategoryList({ groups }: { groups: CategoryGroup[] }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const [otherOrder, setOtherOrder] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragRef = useRef<{
    zone: Zone;
    category: string;
    pointerId: number;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number | null;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const pinnedStackRef = useRef<HTMLDivElement>(null);
  const otherStackRef = useRef<HTMLDivElement>(null);
  const singleStackRef = useRef<HTMLDivElement>(null);
  const zoneSizesRef = useRef({ pinned: 0, other: 0 });

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

  function reorderWithinZone(zone: Zone, category: string, toIndex: number) {
    if (zone === 'pinned') {
      setPinned((current) => {
        const from = current.indexOf(category);
        if (from < 0) {
          return current;
        }
        const clamped = Math.max(0, Math.min(toIndex, current.length - 1));
        if (from === clamped) {
          return current;
        }
        const next = moveItem(current, from, clamped);
        writeStringList(PIN_STORAGE_KEY, next);
        return next;
      });
      return;
    }

    setOtherOrder((current) => {
      const from = current.indexOf(category);
      if (from < 0) {
        return current;
      }
      const clamped = Math.max(0, Math.min(toIndex, current.length - 1));
      if (from === clamped) {
        return current;
      }
      const next = moveItem(current, from, clamped);
      writeStringList(OTHER_ORDER_KEY, next);
      return next;
    });
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
    setIsReordering(false);
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const state = dragRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.activated) {
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX && state.timer != null) {
          window.clearTimeout(state.timer);
          state.timer = null;
        }
        return;
      }

      event.preventDefault();

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
    }, LONG_PRESS_MS);

    dragRef.current = {
      zone,
      category,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
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

  if (!useColumns) {
    return (
      <div className={stackClass} ref={singleStackRef}>
        {pinnedGroups.map((group) => renderGroup(group, 'pinned'))}
        {otherGroups.map((group) => renderGroup(group, 'other'))}
      </div>
    );
  }

  return (
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
  );
}
