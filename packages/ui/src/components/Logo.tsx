import logoPng from '../assets/logo.png';

/** The Gokul Oils round logo (forest green, yellow G, amber oil drop). `badge` adds a small P / O mark so the two apps can be told apart. */
export function Logo({ size = 22, badge, className }: { size?: number; badge?: string; className?: string }) {
  return (
    <span data-overflow-ok className={`relative inline-flex shrink-0 ${className ?? ''}`} style={{ width: size, height: size }}>
      <img src={logoPng} width={size} height={size} alt="Gokul Oils" draggable={false} className="h-full w-full select-none rounded-full" />
      {badge && (
        <span
          className="absolute -bottom-0.5 -right-1 flex items-center justify-center rounded-full bg-yellow font-bold leading-none text-forest-950 ring-2 ring-chrome"
          style={{ width: Math.max(12, size * 0.4), height: Math.max(12, size * 0.4), fontSize: Math.max(8, size * 0.24) }}
        >{badge}</span>
      )}
    </span>
  );
}
