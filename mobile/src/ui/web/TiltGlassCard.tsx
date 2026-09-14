/**
 * 15-zone CSS-only 3D tilt glass card (Uiverse.io technique, via :has()),
 * ported near-verbatim from the reference landing design. Web-only raw DOM
 * — the :has() selector trick needs literal sibling <div class="part-N">
 * elements, which React Native's View doesn't give us a stable class name
 * for. See Scanner.tsx for why raw DOM is safe here.
 */
import * as React from 'react';

export interface TiltGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'glow' | 'subtle';
  angleX?: number;
  angleY?: number;
  className?: string;
  cardClassName?: string;
  style?: React.CSSProperties;
  cardStyle?: React.CSSProperties;
  showScanBeam?: boolean;
}

export function TiltGlassCard({
  children,
  variant = 'default',
  angleX = 14,
  angleY = 18,
  className = '',
  cardClassName = '',
  style,
  cardStyle,
  showScanBeam = true,
  onClick,
  ...rest
}: TiltGlassCardProps) {
  const variantClass = variant === 'glow' ? 'glass-card-glow' : variant === 'subtle' ? 'glass-card-subtle' : '';

  // `.card_container` is a flex column whose only in-flow child is `.card`
  // (the "part" hover grid is position:absolute and doesn't contribute to
  // layout) — but `perspective` + `transform-style:preserve-3d` on a CSS
  // Grid item can make some browsers under-report that intrinsic height back
  // to the grid's row-sizing pass, letting the next row start too early and
  // visually overlap. Mirroring cardStyle's own sizing hints onto the
  // container removes the ambiguity instead of relying on measured height.
  const sizeHints: React.CSSProperties = {};
  if (cardStyle?.minHeight != null) sizeHints.minHeight = cardStyle.minHeight;
  if (cardStyle?.height != null) sizeHints.height = cardStyle.height;

  return (
    <div
      className={`card_container ${className}`.trim()}
      style={{ '--angleX': `${angleX}deg`, '--angleY': `${angleY}deg`, width: '100%', ...sizeHints, ...style } as React.CSSProperties}
      onClick={onClick}
      {...rest}
    >
      <div className="card_hover" aria-hidden="true">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className={`part part-${i + 1}`} />
        ))}
      </div>

      <div className={`card glass-card ${variantClass} ${cardClassName}`.trim()} style={cardStyle}>
        {showScanBeam && <div className="metrology-scan-line" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}

export default TiltGlassCard;
