import { LOGO_COLORS, LOGO_RADIUS, LOGO_SIZE, logoShapes } from "@/utils/logo";

interface LogoProps {
  /** Rendered size in CSS pixels; 32 and under draws the simpler mark. */
  size: number;
  className?: string;
}

/** The Sequill mark on its ground tile, drawn from the same shapes as the app icons. */
export function Logo({ size, className }: LogoProps) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}
      width={size}
      height={size}
      aria-hidden
      className={className}
    >
      <rect width={LOGO_SIZE} height={LOGO_SIZE} rx={LOGO_RADIUS} fill={LOGO_COLORS.ground} />
      {logoShapes(size).map((shape) => (
        <path key={shape.d} d={shape.d} fill={shape.fill} />
      ))}
    </svg>
  );
}
