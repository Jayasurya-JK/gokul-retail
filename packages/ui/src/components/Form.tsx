import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import * as RCheckbox from '@radix-ui/react-checkbox';
import * as RSwitch from '@radix-ui/react-switch';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../cn';
import { Kbd } from './Display';

const fieldBase =
  'w-full rounded-control border bg-surface text-ink placeholder:text-subtle transition-colors duration-100 ' +
  'border-line-strong hover:border-subtle focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-surface-3 disabled:opacity-60';

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
  kbd?: string;
  /** Short text inside the box on the left (for example the rupee sign), centred on the box, same size as the value */
  leading?: string;
  size?: 'sm' | 'md' | 'lg';
}
const inputSizes = { sm: 'h-7 text-sm', md: 'h-8 text-sm', lg: 'h-11 text-md' };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, kbd, leading, size = 'md', className, ...rest }, ref,
) {
  const control = (
    <div className="relative flex items-center">
      {icon && <span className="pointer-events-none absolute left-2.5 text-subtle">{icon}</span>}
      {leading && !icon && <span className={cn('pointer-events-none absolute left-2.5 flex h-full items-center leading-none text-subtle', size === 'lg' ? 'text-md' : 'text-sm')}>{leading}</span>}
      <input
        ref={ref}
        className={cn(fieldBase, inputSizes[size], icon ? 'pl-8' : leading ? 'pl-7 pr-2.5' : 'px-2.5', kbd ? 'pr-12' : icon ? 'pr-2.5' : '', !!error && 'border-danger focus:border-danger focus:ring-danger/25', className)}
        {...rest}
      />
      {kbd && <span className="pointer-events-none absolute right-2"><Kbd>{kbd}</Kbd></span>}
    </div>
  );
  if (!label && !hint && !error) return control;
  return <Field label={label} hint={hint} error={error}>{control}</Field>;
});

export function SearchInput(props: InputProps) {
  return <Input icon={<Search size={15} />} {...props} />;
}

/** Numeric text input: right-aligned, tabular, only allows digits and one dot. */
export interface NumberInputProps extends Omit<InputProps, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (v: string) => void;
  decimals?: number;
  prefix?: string;
}
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, decimals = 2, prefix, className, ...rest }, ref,
) {
  const input = (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      leading={prefix}
      className={cn('text-right num', className)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '');
        const parts = raw.split('.');
        const next = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, decimals)}` : raw;
        onValueChange(decimals === 0 ? next.replace('.', '') : next);
      }}
      {...rest}
    />
  );
  return input;
});

export interface SelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'onChange' | 'value'> {
  label?: ReactNode;
  options: { value: string; label: string }[];
  value?: string;
  /** Same shape as a native select's change event, so `(e) => e.target.value` keeps working. */
  onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void;
  size?: 'sm' | 'md';
}
/** A drop-down list drawn by the app (a floating card), not the operating system's own select popup. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select({ label, options, value, onChange, size = 'md', className, disabled, onKeyDown, ...rest }, ref) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options.find((o) => o.value === value);
  const openList = () => {
    if (disabled) return;
    const r = wrap.current?.getBoundingClientRect();
    setUp(!!r && r.bottom + Math.min(260, options.length * 32 + 12) > window.innerHeight && r.top > window.innerHeight - r.bottom);
    setHi(idx); setOpen(true);
  };
  const pick = (o: { value: string }) => { setOpen(false); if (o.value !== value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } }); };
  useEffect(() => {
    if (!open) return undefined;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => { if (open) listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [open, hi]);

  const keys = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
    else if (e.key === 'End') { e.preventDefault(); setHi(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (options[hi]) pick(options[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = typed.current; const now = Date.now();
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase(); t.at = now;
      const at = options.findIndex((o) => o.label.toLowerCase().includes(`: ${t.text}`) || o.label.toLowerCase().startsWith(t.text));
      if (at >= 0) setHi(at);
    }
  };

  const control = (
    <div ref={wrap} className="relative">
      <button
        ref={ref} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={keys}
        className={cn(fieldBase, 'flex items-center pl-2.5 pr-8 text-left text-sm', size === 'sm' ? 'h-7' : 'h-8', className)}
        {...rest}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
      </button>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle" />
      {open && (
        <ul
          ref={listRef} role="listbox"
          className={cn('g-overlay g-popover absolute left-0 z-[70] max-h-60 min-w-full w-max max-w-[360px] overflow-auto bg-surface p-1', up ? 'bottom-full mb-2' : 'top-full mt-2')}
        >
          {options.map((o, i) => (
            <li
              key={o.value} role="option" aria-selected={o.value === value}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={cn('flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink', i === hi && 'bg-primary-soft')}
            >
              <span className="min-w-0 flex-1 truncate" title={o.label}>{o.label}</span>
              {o.value === value && <Check size={14} className="shrink-0 text-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return label ? <Field label={label}>{control}</Field> : control;
});

/* ---------- Checkbox / Switch ---------- */
export function Checkbox({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (c: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-ink', disabled && 'opacity-50')}>
      <RCheckbox.Root
        checked={checked} disabled={disabled} onCheckedChange={(c) => onCheckedChange(c === true)}
        className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-line-strong bg-surface transition-colors hover:border-subtle focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <RCheckbox.Indicator><Check size={12} strokeWidth={3} className="text-primary-fg" /></RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}

export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (c: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink">
      <RSwitch.Root
        checked={checked} onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 rounded-full bg-line-strong transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=checked]:bg-primary"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
      {label}
    </label>
  );
}

/* ---------- Combobox (type to filter, arrows + Enter) ---------- */
export interface ComboOption { value: string; label: string; hint?: string }
export function Combobox({ options, value, onChange, placeholder, label }: {
  options: ComboOption[]; value: string | null; onChange: (v: string) => void; placeholder?: string; label?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(t)) : options;
  }, [options, q]);
  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const pick = (o: ComboOption) => { onChange(o.value); setOpen(false); setQ(''); };
  const control = (
    <div ref={wrap} className="relative">
      <Input
        role="combobox" aria-expanded={open} aria-controls={id}
        icon={<Search size={14} />}
        placeholder={selected?.label ?? placeholder}
        value={open ? q : selected?.label ?? ''}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {open && (
        <ul id={id} role="listbox" className="g-overlay g-popover absolute left-0 right-0 top-full z-[70] mt-2 max-h-60 overflow-auto bg-surface p-1">
          {filtered.length === 0 && <li className="px-2.5 py-2 text-sm text-subtle">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value} role="option" aria-selected={o.value === value}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={cn('flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm', i === hi ? 'bg-primary-soft text-ink' : 'text-ink')}
            >
              <span className="min-w-0 truncate" title={o.label}>{o.label}</span>
              {o.hint && <span className="shrink-0 whitespace-nowrap pl-2 text-xs text-subtle">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return label ? <Field label={label}>{control}</Field> : control;
}
