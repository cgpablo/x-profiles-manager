/**
 * ProfileCombobox - Selector de perfil con búsqueda al escribir, agrupado en Online / Favorites / Others
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BrowserProfile } from '@xpm/core';
import ProfileAvatar from './ProfileAvatar';
import './ProfileCombobox.css';

interface ProfileComboboxProps {
  profiles: BrowserProfile[];
  activeStatuses: Map<string, boolean>;
  value: string | null;
  onChange: (profileId: string | null) => void;
}

export default function ProfileCombobox({ profiles, activeStatuses, value, onChange }: ProfileComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = profiles.find((p) => p.id === value) || null;

  // Online primero, luego favoritos y por último el resto
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = profiles.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.xAccount?.toLowerCase().includes(q)
    );
    return [
      { key: 'online', label: 'Online', profiles: visible.filter((p) => activeStatuses.get(p.id)) },
      { key: 'favorites', label: 'Favorites', profiles: visible.filter((p) => !activeStatuses.get(p.id) && p.starred) },
      { key: 'others', label: 'Others', profiles: visible.filter((p) => !activeStatuses.get(p.id) && !p.starred) },
    ].filter((g) => g.profiles.length > 0);
  }, [profiles, activeStatuses, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.profiles), [groups]);

  useEffect(() => setHighlight(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const select = (profile: BrowserProfile) => {
    onChange(profile.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && flat[highlight]) {
        e.preventDefault();
        select(flat[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let index = -1;

  return (
    <div className="pc-root" ref={rootRef}>
      <div className="pc-field">
        {selected && !open && (
          <ProfileAvatar profile={selected} className="pc-selected-avatar" />
        )}
        <input
          ref={inputRef}
          type="text"
          className={`pc-input${selected && !open ? ' pc-input-with-avatar' : ''}`}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={selected && !open ? selected.name : 'Search a profile...'}
          value={open ? query : selected ? selected.name : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {selected && (
          <button
            type="button"
            className="pc-clear"
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="pc-list" role="listbox" ref={listRef}>
          {flat.length === 0 ? (
            <div className="pc-empty">No profiles found.</div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="pc-group-label">
                  {group.label} <span>{group.profiles.length}</span>
                </div>
                {group.profiles.map((p) => {
                  index += 1;
                  const isHighlighted = index === highlight;
                  return (
                    <div
                      key={p.id}
                      role="option"
                      aria-selected={p.id === value}
                      data-highlighted={isHighlighted}
                      className={`pc-option${isHighlighted ? ' pc-option-highlighted' : ''}${p.id === value ? ' pc-option-selected' : ''}`}
                      onMouseEnter={() => setHighlight(flat.indexOf(p))}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(p)}
                    >
                      <ProfileAvatar profile={p} className="pc-option-avatar" />
                      <span className="pc-option-name">{p.name}</span>
                      {p.xAccount && <span className="pc-option-account">{p.xAccount}</span>}
                      {activeStatuses.get(p.id) && <span className="pc-dot" />}
                      {p.starred && <span className="pc-star">★</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
