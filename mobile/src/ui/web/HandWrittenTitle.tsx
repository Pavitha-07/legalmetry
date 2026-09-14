/**
 * Hero headline with an animated hand-drawn scribble loop, ported
 * near-verbatim from the reference landing design (framer-motion). Web-only
 * raw DOM — see Scanner.tsx for why that's safe here.
 */
import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface HandWrittenTitleProps {
  title?: string;
  subtitle?: string;
  textColor?: string;
  strokeColor?: string;
}

export function HandWrittenTitle({
  title = 'Hand Written',
  subtitle = 'Optional subtitle',
  textColor = '#FFFFFF',
  strokeColor = '#2860A0',
}: HandWrittenTitleProps) {
  const pathControls = useAnimation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const loopingRef = useRef(false);

  const PATH =
    'M 60 50 ' +
    'C 200 10, 700 5, 920 55 ' +
    'C 1020 80, 1030 170, 940 210 ' +
    'C 860 250, 600 265, 320 260 ' +
    'C 120 255, 20 230, 25 160 ' +
    'C 20 90, 60 50, 60 50';

  useEffect(() => {
    pathControls.start({
      pathLength: 1,
      opacity: 0.45,
      transition: {
        pathLength: { duration: 2.2, ease: [0.43, 0.13, 0.23, 0.96] },
        opacity: { duration: 0.6 },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLoop = () => {
    if (loopingRef.current) return;
    loopingRef.current = true;
    pathControls.start({
      pathLength: [0, 1],
      opacity: 1,
      transition: {
        pathLength: {
          duration: 1.6,
          ease: [0.43, 0.13, 0.23, 0.96] as [number, number, number, number],
          repeat: Infinity,
          repeatType: 'loop' as const,
          repeatDelay: 0.15,
        },
        opacity: { duration: 0.2 },
      },
    });
  };

  const stopLoop = () => {
    loopingRef.current = false;
    pathControls.stop();
    pathControls.start({
      pathLength: 1,
      opacity: 0.45,
      transition: {
        pathLength: { duration: 0.5, ease: 'easeOut' },
        opacity: { duration: 0.5 },
      },
    });
  };

  return (
    <div
      ref={wrapperRef}
      className="relative w-full"
      onMouseEnter={startLoop}
      onMouseLeave={stopLoop}
      onTouchStart={startLoop}
      onTouchEnd={stopLoop}
      style={{ cursor: 'default', position: 'relative', width: '100%' }}
    >
      <div
        className="absolute pointer-events-none select-none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: '-18px -16px -44px -16px', pointerEvents: 'none' }}
      >
        <motion.svg width="100%" height="100%" viewBox="0 0 1000 260" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          <title>Decorative loop</title>
          <motion.path
            d={PATH}
            fill="none"
            strokeWidth="4.5"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={pathControls}
            initial={{ pathLength: 0, opacity: 0 }}
          />
        </motion.svg>
      </div>

      <div className="relative z-10 flex flex-col items-start" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <motion.h1
          style={{
            color: textColor,
            fontSize: 'clamp(1.85rem, 3.4vw, 2.85rem)',
            fontWeight: 400,
            lineHeight: 1.2,
            letterSpacing: '-0.025em',
            margin: 0,
          }}
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {title.split('\n').map((line, i) => (
            <span
              key={i}
              style={{ display: 'block', fontWeight: i === 1 ? 800 : 400, color: i === 1 ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}
            >
              {line}
            </span>
          ))}
        </motion.h1>

        {!!subtitle && (
          <motion.p
            style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.925rem', lineHeight: 1.65, marginTop: '1.25rem', maxWidth: '38rem' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.8 }}
          >
            {subtitle}
          </motion.p>
        )}
      </div>
    </div>
  );
}

export default HandWrittenTitle;
