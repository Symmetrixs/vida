import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import api from "../api/axios.js";

const OTHER = "__other__";
const NONE = [];

export default function LocationPicker({ buildingId, floor, value, onChange, publicForm = false, extraOptions = NONE, disabled = false, otherPlaceholder = "Describe the location" }) {
  const [rooms, setRooms] = useState({ key: "", names: [] });
  const [otherFor, setOtherFor] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const key = buildingId && floor ? `${buildingId}|${floor}` : "";
  const otherOn = !!key && otherFor === key;

  useEffect(() => {
    if (!key) return;
    let live = true;
    const url = publicForm ? `/public/buildings/${buildingId}/rooms` : `/buildings/${buildingId}/rooms`;
    api.get(url, { params: { floor } })
      .then(r => { if (live) setRooms({ key, names: (r.data || []).map(x => x.name) }); })
      .catch(() => { if (live) setRooms({ key, names: [] }); });
    return () => { live = false; };
  }, [key, buildingId, floor, publicForm]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const loaded = rooms.key === key;
  const names = useMemo(() => [...(loaded ? rooms.names : []), ...extraOptions], [loaded, rooms.names, extraOptions]);
  const inList = !!value && names.some(n => n.toLowerCase() === value.toLowerCase());
  const showOther = otherOn || (loaded && !!value && !inList);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = names.filter(n => !q || n.toLowerCase().includes(q));
    return [...list, OTHER];
  }, [names, query]);

  const choose = (option) => {
    setOpen(false);
    setQuery("");
    if (option === OTHER) {
      setOtherFor(key);
      if (inList) onChange("");
      return;
    }
    setOtherFor("");
    onChange(option);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); choose(options[active] ?? OTHER); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const blocked = disabled || !key;
  const display = open ? query : showOther ? "Other" : value || "";

  return (
    <div className="space-y-2" ref={box}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
        <input
          className="input pl-8 pr-8"
          value={display}
          disabled={blocked}
          placeholder={blocked ? "Select a building and floor first" : names.length ? "Type to search rooms" : "No rooms listed, choose Other"}
          onFocus={() => { setOpen(true); setActive(0); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
        {open && !blocked && (
          <ul className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1" role="listbox">
            {options.map((option, i) => (
              <li
                key={option}
                role="option"
                aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); choose(option); }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2 text-sm cursor-pointer ${i === active ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-slate-700 dark:text-slate-200"} ${option === OTHER ? "border-t border-slate-100 dark:border-slate-800" : ""}`}
              >
                {option === OTHER ? "Other (type it in)" : option}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showOther && !blocked && (
        <input
          className="input"
          value={otherOn || !inList ? value || "" : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={otherPlaceholder}
          maxLength={200}
          autoFocus={otherOn}
        />
      )}
    </div>
  );
}
