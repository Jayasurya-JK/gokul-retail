import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { Kbd } from './Display';
import { Tooltip } from './Overlay';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  /** Key hint chip, e.g. "F12" or "Ctrl+N" */
  kbd?: string;
  block?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-3 hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-sm gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-11 px-5 text-md gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, kbd, block, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors duration-100',
        'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {kbd && <Kbd tone={variant === 'primary' || variant === 'danger' ? 'inverse' : 'default'}>{kbd}</Kbd>}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Shortcut shown in the tooltip */
  kbd?: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, kbd, size = 'md', active, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <Tooltip label={label} kbd={kbd}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center rounded-control text-muted transition-colors duration-100',
          'hover:bg-surface-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-45 disabled:pointer-events-none',
          size === 'sm' ? 'h-7 w-7' : 'h-8 w-8', active && 'bg-surface-3 text-ink', className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
