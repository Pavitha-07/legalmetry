/**
 * Hero visual: an interactive 3D cardboard product box with a scanning
 * label, ported near-verbatim from the reference landing design
 * (framer-motion + raw CSS 3D transforms). Web-only raw DOM — see
 * Scanner.tsx for why that's safe here.
 *
 * CSS 3D box geometry rules (all faces share the parent's transform-style:preserve-3d):
 *  Front/Back : translateZ(±D/2)
 *  Left/Right : center face (left:(W-D)/2), then rotateY(±90deg) translateZ(W/2)
 *  Top/Bottom : center face (top:(H-D)/2),  then rotateX(±90deg) translateZ(H/2)
 */
import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'framer-motion';

export interface Zone {
  label: string;
  mm: string;
  yFraction: number;
  rule?: string;
  detail?: string;
  status?: 'compliant' | 'warning' | 'violation';
}

export interface LabelScanHeroSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  rotateSpeed?: number;
  scanSpeed?: number;
  tiltX?: number;
  beamColor?: string;
  zones?: Zone[];
  focusX?: number;
  scrim?: 'none' | 'left' | 'right';
  scrimStrength?: number;
  paused?: boolean;
  interactive?: boolean;
  onZoneClick?: (zone: Zone) => void;
  onBoxClick?: () => void;
  children?: React.ReactNode;
}

const DEFAULT_ZONES: Zone[] = [
  { label: 'MRP', mm: '2.1mm', yFraction: 0.2, rule: 'Rule 6(1)(e)', detail: 'Declared ₹249.00 (incl. all taxes) • Font 2.1mm ≥ 2.0mm min', status: 'compliant' },
  { label: 'Net Quantity', mm: '1.8mm', yFraction: 0.38, rule: 'Rule 6(1)(d)', detail: 'Declared 500g • Font 1.8mm ≥ 1.5mm min (First Schedule)', status: 'compliant' },
  { label: 'Manufacturer Address', mm: '1.4mm', yFraction: 0.57, rule: 'Rule 6(1)(a)', detail: 'Full Name, Address, PIN code & Consumer Care helpline', status: 'compliant' },
  { label: 'Mfg. Date', mm: '1.6mm', yFraction: 0.75, rule: 'Rule 6(1)(b)', detail: 'Month & Year (09/2026) in prominent high-contrast text', status: 'compliant' },
];

const W = 200;
const H = 240;
const D = 120;

const K = {
  front: '#D4A96A',
  frontDk: '#C29050',
  side: '#B07838',
  sideL: '#C28848',
  top: '#E0C070',
  btm: '#9A6428',
  crease: 'rgba(0,0,0,0.12)',
  edge: 'rgba(0,0,0,0.18)',
};

export function LabelScanHeroSection({
  rotateSpeed = 16,
  scanSpeed = 3.5,
  tiltX = 10,
  beamColor = '#2860A0',
  zones = DEFAULT_ZONES,
  focusX = 0.75,
  scrim = 'left',
  scrimStrength = 0.55,
  paused = false,
  interactive = true,
  onZoneClick,
  onBoxClick,
  className = '',
  children,
  ...rest
}: LabelScanHeroSectionProps) {
  const reduced = useRef(false);
  const [activeZone, setActiveZone] = useState<number | null>(null);
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  const rotX = useMotionValue(tiltX);
  const rotY = useMotionValue(-25);
  const beamY = useMotionValue(0);

  const isHoveredRef = useRef(false);
  const isDraggingRef = useRef(false);
  const mouseDelta = useRef({ x: 0, y: 0 });
  const baseRotY = useRef(-25);
  const dragStart = useRef({ x: 0, y: 0, rotX: tiltX, rotY: -25 });
  const hasDragged = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
      reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const go = !reduced.current && !paused;

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!isHoveredRef.current && !isDraggingRef.current && go) {
        const speedDegPerSec = 360 / rotateSpeed;
        baseRotY.current = (baseRotY.current + speedDegPerSec * dt) % 360;

        const currY = rotY.get();
        const currX = rotX.get();

        rotY.set(currY + (baseRotY.current - currY) * 0.12);
        rotX.set(currX + (tiltX - currX) * 0.1);
      } else if (isHoveredRef.current && !isDraggingRef.current) {
        const targetX = tiltX - mouseDelta.current.y * 18;
        const targetY = baseRotY.current + mouseDelta.current.x * 24;

        const currY = rotY.get();
        const currX = rotX.get();
        rotY.set(currY + (targetY - currY) * 0.15);
        rotX.set(currX + (targetX - currX) * 0.15);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [rotateSpeed, tiltX, go, rotX, rotY]);

  useEffect(() => {
    if (reduced.current || paused) return;
    let id: number;
    const checkProximity = () => {
      if (hoveredZone === null) {
        const y = beamY.get();
        let hit: number | null = null;
        zones.forEach((z, i) => {
          if (Math.abs(y - z.yFraction) < 0.07) hit = i;
        });
        setActiveZone(hit);
      }
      id = requestAnimationFrame(checkProximity);
    };
    id = requestAnimationFrame(checkProximity);
    return () => cancelAnimationFrame(id);
  }, [beamY, zones, paused, hoveredZone]);

  const handlePointerEnter = useCallback(() => {
    if (!interactive) return;
    isHoveredRef.current = true;
    setIsHovered(true);
  }, [interactive]);

  const handlePointerLeave = useCallback(() => {
    isHoveredRef.current = false;
    setIsHovered(false);
    mouseDelta.current = { x: 0, y: 0 };
    setHoveredZone(null);
    setHoveredFeature(null);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {}
      isDraggingRef.current = true;
      setIsDragging(true);
      hasDragged.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY, rotX: rotX.get(), rotY: rotY.get() };
    },
    [interactive, rotX, rotY],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;

      const elem = boxRef.current;
      if (elem) {
        const rect = elem.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const nx = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width * 0.75)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height * 0.75)));
        mouseDelta.current = { x: nx, y: ny };
      }

      if (isDraggingRef.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.hypot(dx, dy) > 4) {
          hasDragged.current = true;
          setUserInteracted(true);
        }
        const newRotY = dragStart.current.rotY + dx * 0.7;
        const newRotX = Math.max(-50, Math.min(50, dragStart.current.rotX - dy * 0.5));
        rotY.set(newRotY);
        rotX.set(newRotX);
        baseRotY.current = newRotY;
      }
    },
    [interactive, rotX, rotY],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleBoxClick = useCallback(() => {
    if (hasDragged.current) return;
    onBoxClick?.();
  }, [onBoxClick]);

  const handleResetRotation = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      rotX.set(tiltX);
      rotY.set(-25);
      baseRotY.current = -25;
      setUserInteracted(false);
    },
    [tiltX, rotX, rotY],
  );

  const effectiveActiveZone = hoveredZone !== null ? hoveredZone : activeZone;

  const LBL_TOP = 14;
  const LBL_H = H - 28;
  const LBL_SIDE = 14;

  const scrimBg =
    scrim === 'left'
      ? `linear-gradient(to right, rgba(14,27,42,${scrimStrength}) 0%, rgba(14,27,42,0.15) 48%, transparent 100%)`
      : scrim === 'right'
        ? `linear-gradient(to left,  rgba(14,27,42,${scrimStrength}) 0%, rgba(14,27,42,0.15) 48%, transparent 100%)`
        : 'none';

  return (
    <div className={`relative isolate h-full w-full overflow-hidden ${className}`} style={{ position: 'relative', isolation: 'isolate', height: '100%', width: '100%', overflow: 'hidden', background: '#0E1B2A' }} {...rest}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
          radial-gradient(ellipse 50% 60% at ${focusX * 100}% 48%, rgba(212,169,106,0.14) 0%, transparent 60%),
          radial-gradient(ellipse 60% 45% at ${focusX * 100}% 52%, rgba(40,96,160,0.10) 0%, transparent 65%)
        `,
        }}
      />

      {scrim !== 'none' && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', background: scrimBg }} />
      )}

      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '9%',
          left: `${focusX * 100}%`,
          transform: 'translateX(-50%)',
          width: `${W * (isHovered ? 1.55 : 1.4)}px`,
          height: isHovered ? '24px' : '20px',
          background: isHovered
            ? 'radial-gradient(ellipse, rgba(40,96,160,0.4) 0%, rgba(0,0,0,0.55) 45%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 70%)',
          filter: isHovered ? 'blur(10px)' : 'blur(8px)',
          borderRadius: '50%',
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        }}
      />

      <div style={{ position: 'absolute', inset: 0, perspective: '1000px', perspectiveOrigin: `${focusX * 100}% 50%`, zIndex: 12, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: `calc(50% - ${H / 2 + 38}px)`, left: `${focusX * 100}%`, transform: 'translateX(-50%)', zIndex: 25, pointerEvents: 'auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              background: isHovered ? 'rgba(14, 27, 42, 0.92)' : 'rgba(14, 27, 42, 0.65)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: isHovered ? '1px solid rgba(92, 225, 230, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '9999px',
              boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.45), 0 0 16px rgba(92,225,230,0.25)' : '0 4px 12px rgba(0,0,0,0.25)',
              color: 'white',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.03em',
              transition: 'all 0.25s ease',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isHovered ? '#5CE1E6' : '#2860A0',
                boxShadow: isHovered ? '0 0 8px #5CE1E6' : 'none',
                transition: 'all 0.25s ease',
              }}
            />
            <span style={{ color: isHovered ? '#E2E8F0' : 'rgba(255,255,255,0.75)' }}>
              {isDragging ? 'Rotating in 3D...' : isHovered ? '✦ Hover & tilt active • Drag to rotate 360°' : '✦ 3D Package • Hover to inspect'}
            </span>
            {userInteracted && (
              <button
                type="button"
                onClick={handleResetRotation}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  marginLeft: '4px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'rgba(92, 225, 230, 0.18)',
                  border: '1px solid rgba(92, 225, 230, 0.35)',
                  color: '#5CE1E6',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Reset 3D rotation"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {(hoveredZone !== null || hoveredFeature !== null) && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute',
                top: `calc(50% + ${H / 2 + 16}px)`,
                left: `${focusX * 100}%`,
                transform: 'translateX(-50%)',
                zIndex: 25,
                pointerEvents: 'none',
                width: 'max-content',
                maxWidth: '340px',
              }}
            >
              <div
                style={{
                  background: 'rgba(10, 20, 32, 0.96)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(92, 225, 230, 0.4)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5), 0 0 14px rgba(92,225,230,0.2)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#E2E8F0',
                }}
              >
                <div>
                  {hoveredZone !== null && zones[hoveredZone] && (
                    <>
                      <div style={{ fontWeight: 800, color: '#5CE1E6', fontSize: '11px' }}>
                        {zones[hoveredZone].rule || 'Legal Metrology Rule'} — {zones[hoveredZone].label}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        {zones[hoveredZone].detail || `Font height verified at ${zones[hoveredZone].mm}`}
                      </div>
                    </>
                  )}
                  {hoveredFeature === 'coin' && (
                    <>
                      <div style={{ fontWeight: 800, color: '#F5E090', fontSize: '11px' }}>Physical Calibration Standard (₹10 Coin)</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        Standard reference coin calibrates computer-vision pixel-to-millimetre ratio.
                      </div>
                    </>
                  )}
                  {hoveredFeature === 'barcode' && (
                    <>
                      <div style={{ fontWeight: 800, color: '#5CE1E6', fontSize: '11px' }}>GS1 EAN-13 Barcode</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        Valid GTIN-13 registered product identifier with compliant quiet zone spacing.
                      </div>
                    </>
                  )}
                  {hoveredFeature === 'qr' && (
                    <>
                      <div style={{ fontWeight: 800, color: '#5CE1E6', fontSize: '11px' }}>Digital Product Passport (QR)</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        Direct digital access to mandatory consumer redressal & compliance certificate.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleBoxClick}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${focusX * 100}%`,
            width: `${W + 80}px`,
            height: `${H + 80}px`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
          }}
        >
          <motion.div
            ref={boxRef}
            style={{
              width: W,
              height: H,
              position: 'relative',
              transformStyle: 'preserve-3d',
              rotateX: rotX,
              rotateY: rotY,
              scale: isHovered ? 1.04 : 1,
              transition: 'scale 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {/* FRONT FACE */}
            <div
              style={{
                position: 'absolute',
                width: W,
                height: H,
                left: 0,
                top: 0,
                transform: `translateZ(${D / 2}px)`,
                background: `linear-gradient(160deg, ${K.front} 0%, ${K.frontDk} 100%)`,
                backfaceVisibility: 'hidden',
                boxShadow: isHovered ? `inset 0 0 0 1.5px rgba(92,225,230,0.5), 0 0 25px rgba(92,225,230,0.2)` : `inset 0 0 0 1px ${K.edge}`,
                overflow: 'hidden',
                transition: 'box-shadow 0.25s ease',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: K.crease }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: K.crease }} />

              <div
                style={{
                  position: 'absolute',
                  top: `${LBL_TOP}px`,
                  left: `${LBL_SIDE}px`,
                  right: `${LBL_SIDE}px`,
                  height: `${LBL_H}px`,
                  background: '#FFFFFF',
                  borderRadius: '4px',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.18)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ background: '#1A3A5C', padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: '11px', letterSpacing: '0.1em', fontFamily: 'sans-serif' }}>LMIP</span>
                  <span style={{ background: 'white', color: '#1A3A5C', fontSize: '7px', fontWeight: 800, padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.08em', flexShrink: 0 }}>INSPECTION</span>
                </div>

                <div style={{ padding: '5px 10px 4px', borderBottom: '1px solid #E8ECF0', flexShrink: 0 }}>
                  <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>Direct Metrology Label Check</div>
                  <div style={{ fontSize: '6.5px', color: '#64748B', marginTop: '2px', fontFamily: 'monospace' }}>AWB No: LM-2026-09-001234</div>
                </div>

                <div style={{ flex: 1, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                  {zones.map((zone, i) => {
                    const active = effectiveActiveZone === i;
                    const isZoneHovered = hoveredZone === i;
                    return (
                      <div
                        key={zone.label}
                        onPointerEnter={(e) => {
                          e.stopPropagation();
                          setHoveredZone(i);
                        }}
                        onPointerLeave={(e) => {
                          e.stopPropagation();
                          setHoveredZone(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onZoneClick?.(zone);
                        }}
                        style={{
                          position: 'relative',
                          background: isZoneHovered ? 'rgba(40,96,160,0.14)' : active ? 'rgba(40,96,160,0.07)' : i % 2 === 0 ? '#F8FAFC' : '#FFF',
                          border: isZoneHovered ? '1px solid #2860A0' : active ? '1px solid rgba(40,96,160,0.3)' : '1px solid #EEF1F4',
                          borderRadius: '3px',
                          padding: '4px 6px',
                          transition: 'all 0.18s ease',
                          cursor: 'pointer',
                          boxShadow: isZoneHovered ? '0 2px 8px rgba(40,96,160,0.2)' : 'none',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '6px',
                            fontWeight: 700,
                            color: active ? '#2860A0' : '#94A3B8',
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            marginBottom: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{zone.label}</span>
                          {isZoneHovered && <span style={{ fontSize: '6px', color: '#2860A0', fontWeight: 800 }}>INSPECT</span>}
                        </div>
                        <div
                          style={{
                            height: '5px',
                            borderRadius: '2px',
                            width: active ? '72%' : `${52 + i * 10}%`,
                            background: active ? `linear-gradient(90deg, ${beamColor}99, ${beamColor}44)` : 'linear-gradient(90deg,#CBD5E1,#E2E8F0)',
                            transition: 'all 0.2s ease',
                          }}
                        />
                        <AnimatePresence>
                          {active && (
                            <motion.div
                              key="badge"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '6px',
                                fontWeight: 800,
                                color: beamColor,
                                background: isZoneHovered ? 'rgba(40,96,160,0.22)' : 'rgba(40,96,160,0.12)',
                                padding: '1px 5px',
                                borderRadius: '2px',
                                fontFamily: 'monospace',
                                border: isZoneHovered ? '0.5px solid rgba(40,96,160,0.3)' : 'none',
                              }}
                            >
                              {zone.mm}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid #E8ECF0', padding: '5px 10px 6px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div
                    onPointerEnter={(e) => {
                      e.stopPropagation();
                      setHoveredFeature('barcode');
                    }}
                    onPointerLeave={(e) => {
                      e.stopPropagation();
                      setHoveredFeature(null);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      background: hoveredFeature === 'barcode' ? 'rgba(40,96,160,0.1)' : 'transparent',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '1px', alignItems: 'flex-end' }}>
                      {Array.from({ length: 30 }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            width: i % 5 === 0 ? '3px' : i % 3 === 0 ? '2px' : '1.5px',
                            height: `${9 + (i % 4) * 3}px`,
                            background: hoveredFeature === 'barcode' ? '#2860A0' : '#111',
                            borderRadius: '0.5px',
                            flexShrink: 0,
                            transition: 'background 0.18s ease',
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: '5px', color: hoveredFeature === 'barcode' ? '#2860A0' : '#475569', fontWeight: hoveredFeature === 'barcode' ? 700 : 400, letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                      1234567890123
                    </span>
                  </div>

                  <div
                    onPointerEnter={(e) => {
                      e.stopPropagation();
                      setHoveredFeature('qr');
                    }}
                    onPointerLeave={(e) => {
                      e.stopPropagation();
                      setHoveredFeature(null);
                    }}
                    style={{
                      width: '26px',
                      height: '26px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5,1fr)',
                      gap: '1px',
                      padding: '2px',
                      background: 'white',
                      border: hoveredFeature === 'qr' ? '1px solid #2860A0' : '1px solid #E2E8F0',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      boxShadow: hoveredFeature === 'qr' ? '0 0 8px rgba(40,96,160,0.3)' : 'none',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          background: [0, 1, 5, 6, 4, 9, 10, 14, 15, 16, 20, 24, 19, 18, 22].includes(i) ? (hoveredFeature === 'qr' ? '#2860A0' : '#111') : '#FFF',
                          borderRadius: '0.5px',
                          transition: 'background 0.18s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div
                title="₹10 coin — calibration reference"
                onPointerEnter={(e) => {
                  e.stopPropagation();
                  setHoveredFeature('coin');
                }}
                onPointerLeave={(e) => {
                  e.stopPropagation();
                  setHoveredFeature(null);
                }}
                style={{
                  position: 'absolute',
                  bottom: '6px',
                  left: '18px',
                  width: hoveredFeature === 'coin' ? '20px' : '18px',
                  height: hoveredFeature === 'coin' ? '20px' : '18px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 38% 35%, #F5E090, #C8A030)',
                  border: '1.5px solid rgba(200,168,44,0.7)',
                  boxShadow: hoveredFeature === 'coin' ? '0 0 10px rgba(245,224,144,0.7), 0 3px 6px rgba(0,0,0,0.4)' : '0 2px 5px rgba(0,0,0,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 5,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                }}
              >
                <span style={{ fontSize: '6px', fontWeight: 900, color: '#7A5000', lineHeight: 1 }}>₹</span>
              </div>

              {go && (
                <motion.div
                  style={{
                    position: 'absolute',
                    left: `${LBL_SIDE}px`,
                    right: `${LBL_SIDE}px`,
                    height: '2px',
                    borderRadius: '1px',
                    background: `linear-gradient(90deg, transparent 0%, ${beamColor}44 8%, ${beamColor}CC 38%, ${beamColor} 50%, ${beamColor}CC 62%, ${beamColor}44 92%, transparent 100%)`,
                    boxShadow: `0 0 8px 4px ${beamColor}40, 0 0 20px 8px ${beamColor}18`,
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                  animate={{ y: [LBL_TOP, LBL_TOP + LBL_H - 2] }}
                  transition={{ repeat: Infinity, repeatType: 'loop', duration: scanSpeed, ease: 'linear' }}
                  onUpdate={(latest) => {
                    const y = latest.y as number;
                    const frac = (y - LBL_TOP) / (LBL_H - 2);
                    beamY.set(Math.max(0, Math.min(1, frac)));
                  }}
                />
              )}
            </div>

            {/* BACK FACE */}
            <div
              style={{
                position: 'absolute',
                width: W,
                height: H,
                left: 0,
                top: 0,
                transform: `rotateY(180deg) translateZ(${D / 2}px)`,
                background: `linear-gradient(160deg, ${K.side} 0%, ${K.btm} 100%)`,
                backfaceVisibility: 'hidden',
                boxShadow: `inset 0 0 0 1px ${K.edge}`,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ border: '1.5px solid rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: '3px' }}>
                  <span style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em' }}>FRAGILE</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: '14px', lineHeight: 1 }}>↑↑</div>
                  <span style={{ fontSize: '6px', fontWeight: 700 }}>THIS SIDE UP</span>
                </div>
              </div>

              <div style={{ alignSelf: 'center', border: '2px dashed rgba(0,0,0,0.22)', borderRadius: '4px', padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.08em' }}>LEGAL METROLOGY ACT</div>
                <div style={{ fontSize: '6px', color: 'rgba(0,0,0,0.3)', marginTop: '2px', fontFamily: 'monospace' }}>STANDARD PACK: IS-11434</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '6.5px', color: 'rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>RECYCLABLE KRAFT</span>
                <span style={{ fontSize: '6.5px', color: 'rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>LOT: LM-8492</span>
              </div>
            </div>

            {/* RIGHT FACE */}
            <div
              style={{
                position: 'absolute',
                width: D,
                height: H,
                left: `${(W - D) / 2}px`,
                top: 0,
                transform: `rotateY(90deg) translateZ(${W / 2}px)`,
                background: `linear-gradient(180deg, ${K.sideL} 0%, ${K.side} 60%, ${K.btm} 100%)`,
                backfaceVisibility: 'hidden',
                overflow: 'hidden',
                boxShadow: `inset -4px 0 12px rgba(0,0,0,0.18)`,
              }}
            >
              {[0.28, 0.55, 0.72].map((f) => (
                <div key={f} style={{ position: 'absolute', top: `${f * 100}%`, left: 0, right: 0, height: '1px', background: K.crease }} />
              ))}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(90deg)', fontSize: '7px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Legal Metrology
              </div>
            </div>

            {/* LEFT FACE */}
            <div
              style={{
                position: 'absolute',
                width: D,
                height: H,
                left: `${(W - D) / 2}px`,
                top: 0,
                transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
                background: `linear-gradient(180deg, ${K.front} 0%, ${K.sideL} 50%, ${K.side} 100%)`,
                backfaceVisibility: 'hidden',
                overflow: 'hidden',
                boxShadow: `inset 4px 0 10px rgba(255,255,255,0.06)`,
              }}
            >
              {[0.28, 0.55, 0.72].map((f) => (
                <div key={f} style={{ position: 'absolute', top: `${f * 100}%`, left: 0, right: 0, height: '1px', background: K.crease }} />
              ))}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(-90deg)', fontSize: '6.5px', fontWeight: 700, color: 'rgba(0,0,0,0.22)', letterSpacing: '0.12em', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                BATCH B-2026-X
              </div>
            </div>

            {/* TOP FACE */}
            <div
              style={{
                position: 'absolute',
                width: W,
                height: D,
                left: 0,
                top: `${(H - D) / 2}px`,
                transform: `rotateX(90deg) translateZ(${H / 2}px)`,
                background: `linear-gradient(135deg, ${K.top} 0%, ${K.front} 100%)`,
                backfaceVisibility: 'hidden',
                overflow: 'hidden',
                boxShadow: `inset 0 -6px 16px rgba(0,0,0,0.14)`,
              }}
            >
              <div style={{ position: 'absolute', top: '44%', left: '8%', right: '8%', height: '2px', background: K.crease, borderRadius: '1px' }} />
              <div style={{ position: 'absolute', top: 'calc(44% + 3px)', left: '20%', right: '20%', height: '1px', background: K.crease }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '10%', width: '1px', background: K.crease }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: '10%', width: '1px', background: K.crease }} />
              <div
                style={{
                  position: 'absolute',
                  top: '40%',
                  left: 0,
                  right: 0,
                  height: '14px',
                  background: 'rgba(40,96,160,0.12)',
                  borderTop: '1px dashed rgba(40,96,160,0.3)',
                  borderBottom: '1px dashed rgba(40,96,160,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '6px', fontWeight: 800, color: 'rgba(40,96,160,0.6)', letterSpacing: '0.15em' }}>LM VERIFIED SEAL</span>
              </div>
            </div>

            {/* BOTTOM FACE */}
            <div
              style={{
                position: 'absolute',
                width: W,
                height: D,
                left: 0,
                top: `${(H - D) / 2}px`,
                transform: `rotateX(-90deg) translateZ(${H / 2}px)`,
                background: `linear-gradient(135deg, ${K.btm} 0%, ${K.side} 100%)`,
                backfaceVisibility: 'hidden',
              }}
            />
          </motion.div>
        </div>
      </div>

      {!!children && <div className="relative z-10 h-full w-full pointer-events-none" style={{ position: 'relative', zIndex: 10, height: '100%', width: '100%', pointerEvents: 'none' }}>{children}</div>}
    </div>
  );
}

export default LabelScanHeroSection;
