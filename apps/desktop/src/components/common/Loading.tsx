import type { CSSProperties } from 'react';

// Shimmering placeholder block shown while real content is on its way.
export function Skeleton({
  width = '100%',
  height = 10,
  radius = 3,
  className = '',
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

// Small inline spinner for short actions (loading a map, checking for updates, exporting…).
export function Spinner({ size = 12, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
