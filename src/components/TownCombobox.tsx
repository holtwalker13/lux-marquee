"use client";

import { filterServiceTowns } from "@/lib/filter-service-towns";
import type { ServiceTown } from "@/lib/service-towns";
import { SERVICE_TOWNS } from "@/lib/service-towns";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type TownComboboxProps = {
  value: string;
  onChange: (townId: string) => void;
  required?: boolean;
};

function formatDriveLabel(hours: number): string {
  if (hours < 1) {
    const mins = Math.max(5, Math.round(hours * 60));
    return `~${mins} min`;
  }
  return `~${hours} hr`;
}

function townOptionLabel(town: ServiceTown): string {
  return `${town.label} · ${formatDriveLabel(town.estimatedDriveHours)}`;
}

export function TownCombobox({ value, onChange, required }: TownComboboxProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedTown = useMemo(
    () => SERVICE_TOWNS.find((town) => town.id === value) ?? null,
    [value],
  );

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    if (selectedTown) {
      setQuery(townOptionLabel(selectedTown));
    } else if (!isOpen) {
      setQuery("");
    }
  }, [selectedTown, isOpen]);

  const suggestions = useMemo(
    () => filterServiceTowns(SERVICE_TOWNS, isOpen ? query : ""),
    [isOpen, query],
  );

  useEffect(() => {
    if (highlightedIndex >= suggestions.length) {
      setHighlightedIndex(Math.max(0, suggestions.length - 1));
    }
  }, [highlightedIndex, suggestions.length]);

  function openList() {
    setIsOpen(true);
    setHighlightedIndex(0);
  }

  function closeList() {
    setIsOpen(false);
    if (selectedTown) {
      setQuery(townOptionLabel(selectedTown));
    }
  }

  function selectTown(town: ServiceTown) {
    onChange(town.id);
    setQuery(townOptionLabel(town));
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function onInputChange(next: string) {
    setQuery(next);
    openList();
    if (value) onChange("");
  }

  function onInputFocus() {
    openList();
    if (selectedTown) {
      setQuery("");
      onChange("");
    }
  }

  function onInputBlur() {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) {
        closeList();
      }
    }, 120);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) openList();
      setHighlightedIndex((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) openList();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (!isOpen || suggestions.length === 0) return;
      e.preventDefault();
      const town = suggestions[highlightedIndex];
      if (town) selectTown(town);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
      inputRef.current?.blur();
    }
  }

  const activeDescendant =
    isOpen && suggestions[highlightedIndex]
      ? `${listboxId}-option-${suggestions[highlightedIndex].id}`
      : undefined;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-required={required || undefined}
          value={query}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onKeyDown={onKeyDown}
          placeholder="Type or select a town…"
          autoComplete="off"
          className="w-full rounded-2xl border border-[var(--blush)] bg-white py-3 pl-4 pr-11 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? "Close town list" : "Show all towns"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isOpen) {
              closeList();
              inputRef.current?.blur();
            } else {
              inputRef.current?.focus();
              openList();
            }
          }}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--cocoa-muted)] transition hover:bg-[var(--cream)] hover:text-[var(--cocoa)]"
        >
          <ChevronDown
            className={`size-4 transition ${isOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value={value}
          onChange={() => {}}
          required
        />
      ) : null}

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-[var(--blush)] bg-white py-1 shadow-lg shadow-[#c4a59a]/20"
        >
          {suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--cocoa-muted)]">
              No matching towns. Try a nearby city or mention yours in notes.
            </li>
          ) : (
            suggestions.map((town, index) => {
              const isSelected = town.id === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={town.id}
                  id={`${listboxId}-option-${town.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectTown(town)}
                  className={`cursor-pointer px-4 py-2.5 text-sm ${
                    isHighlighted || isSelected
                      ? "bg-[var(--blush)] text-[var(--cocoa)]"
                      : "text-[var(--cocoa)] hover:bg-[var(--cream)]"
                  }`}
                >
                  <span className="font-medium">{town.label}</span>
                  <span className="text-[var(--cocoa-muted)]">
                    {" "}
                    · {formatDriveLabel(town.estimatedDriveHours)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
