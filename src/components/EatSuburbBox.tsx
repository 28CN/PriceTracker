'use client';

import { X } from 'lucide-react';
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { filterSuburbs } from '@/lib/eat/suburbs';

type EatSuburbBoxProps = {
  id: string;
  value: string;
  suburbs: string[];
  onSelect: (name: string) => void;
  onNeedStores: () => void;
};

const EatSuburbBox = forwardRef<HTMLInputElement, EatSuburbBoxProps>(function EatSuburbBox(
  { id, value, suburbs, onSelect, onNeedStores },
  forwardedRef
) {
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const pointerInsideRef = useRef(false);

  const [inputText, setInputText] = useState(value);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setInputText(value);
    setDirty(false);
  }, [value]);

  const matches = useMemo(() => filterSuburbs(suburbs, dirty ? inputText : '', 8), [suburbs, dirty, inputText]);

  const safeActiveIndex = matches.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matches.length - 1);
  const activeOptionId = open && safeActiveIndex >= 0 ? `${listboxId}-opt-${safeActiveIndex}` : undefined;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        pointerInsideRef.current = false;
        setOpen(false);
        setDirty(false);
        setInputText(value);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, value]);

  const setInputRef = (node: HTMLInputElement | null) => {
    localInputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const commit = (name: string) => {
    setInputText(name);
    setDirty(false);
    setOpen(false);
    onSelect(name);
  };

  const clearInput = () => {
    setInputText('');
    setDirty(false);
    setActiveIndex(0);
    if (value) onSelect('');
    localInputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNeedStores();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (matches.length > 0) {
        setActiveIndex((current) => (current + 1) % matches.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onNeedStores();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, matches.length - 1));
      } else if (matches.length > 0) {
        setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
      }
      return;
    }

    if (event.key === 'Enter') {
      if (open && safeActiveIndex >= 0 && matches[safeActiveIndex]) {
        event.preventDefault();
        commit(matches[safeActiveIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (inputText) {
        event.preventDefault();
        setInputText('');
        setDirty(false);
        if (value) onSelect('');
      }
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
      setDirty(false);
      setInputText(value);
    }
  };

  return (
    <div ref={wrapRef} className="eat-combobox">
      <input
        ref={setInputRef}
        id={id}
        type="text"
        className="eat-suburb-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        placeholder="Suburb"
        autoComplete="off"
        spellCheck={false}
        value={inputText}
        onFocus={(event) => {
          // Opens on tap, typing or ArrowDown, not on focus alone (focus can be moved here by Near me).
          onNeedStores();
          setDirty(false);
          setActiveIndex(0);
          if (event.currentTarget.value) event.currentTarget.select();
        }}
        onPointerDown={() => {
          onNeedStores();
          setOpen(true);
        }}
        onBlur={(event) => {
          if (pointerInsideRef.current) return;
          if (wrapRef.current?.contains(event.relatedTarget as Node | null)) return;
          setOpen(false);
          setDirty(false);
          setInputText(value);
        }}
        onChange={(event) => {
          const next = event.target.value;
          onNeedStores();
          setInputText(next);
          setDirty(true);
          setOpen(true);
          setActiveIndex(0);
          if (!next && value) onSelect('');
        }}
        onKeyDown={handleKeyDown}
      />

      {inputText ? (
        <button
          type="button"
          className="eat-suburb-clear"
          aria-label="Clear suburb"
          onMouseDown={(event) => event.preventDefault()}
          onClick={clearInput}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}

      {open ? (
        <ul id={listboxId} role="listbox" aria-label="Suburbs" className="eat-suburb-list">
          {matches.length === 0 ? (
            <li className="eat-suburb-empty" role="presentation">
              No match
            </li>
          ) : (
            matches.map((name, index) => (
              <li
                key={name}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={name === value}
                className={`eat-suburb-option${index === safeActiveIndex ? ' is-active' : ''}${
                  name === value ? ' is-selected' : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={() => {
                  pointerInsideRef.current = true;
                }}
                onClick={() => {
                  pointerInsideRef.current = false;
                  commit(name);
                }}
              >
                {name}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
});

export default EatSuburbBox;
