"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { StaffNameLink } from "@/components/rrhh/StaffNameLink";
import type { StaffMember } from "@/lib/crm/rrhh";

type StaffSearchFieldProps = {
  id?: string;
  label?: string;
  staff: StaffMember[];
  value: string;
  onChange: (personaId: string) => void;
  placeholder?: string;
};

/**
 * Buscador predictivo de trabajadores (skill UX: buscar, no desplegar).
 * Escribes y aparecen coincidencias debajo, estilo sugerencias de Google.
 */
export function StaffSearchField({
  id,
  label = "Trabajador",
  staff,
  value,
  onChange,
  placeholder = "Escribe un nombre…",
}: StaffSearchFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = staff.find((member) => member.id === value) ?? null;
  const [query, setQuery] = useState(selected?.nombre ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selected?.nombre ?? "");
  }, [selected?.nombre, value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff.slice(0, 8);
    return staff
      .filter((member) => {
        const haystack = [member.nombre, member.cargo, member.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [staff, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pick = (member: StaffMember) => {
    onChange(member.id);
    setQuery(member.nombre);
    setOpen(false);
  };

  const clearSelection = () => {
    onChange("");
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="form-field staff-search-field" ref={wrapRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className="staff-search-control">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && suggestions[activeIndex] ? `${listId}-opt-${suggestions[activeIndex].id}` : undefined
          }
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (selected && next.trim().toLowerCase() !== selected.nombre.toLowerCase()) {
              onChange("");
            }
          }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              setOpen(true);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && open && suggestions[activeIndex]) {
              event.preventDefault();
              pick(suggestions[activeIndex]);
            }
          }}
        />
        {value || query ? (
          <button
            type="button"
            className="staff-search-clear"
            onClick={clearSelection}
            aria-label="Quitar trabajador"
          >
            ×
          </button>
        ) : null}
      </div>
      {selected ? (
        <p className="form-help">
          <StaffNameLink id={selected.id}>Ver ficha de {selected.nombre}</StaffNameLink>
        </p>
      ) : null}

      {open ? (
        <ul id={listId} className="staff-search-list" role="listbox" aria-label="Sugerencias de trabajadores">
          {suggestions.length ? (
            suggestions.map((member, index) => (
              <li key={member.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-opt-${member.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`staff-search-option ${index === activeIndex ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(member)}
                >
                  <strong>{member.nombre}</strong>
                  {member.cargo ? <span>{member.cargo}</span> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="staff-search-empty" role="option" aria-selected="false">
              Ningún trabajador coincide
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
