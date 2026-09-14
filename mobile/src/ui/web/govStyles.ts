/**
 * Raw CSS for the Landing page's government-portal visual system, ported
 * near-verbatim from the reference design's globals.css (glassmorphism
 * cards, CSS-only 15-zone tilt via :has(), FoldText's 3D hinge pieces) plus
 * Scanner.css. React Native has no concept of CSS classes, :has() selectors,
 * or @keyframes, so this is injected as a real <style> tag — see mount.ts.
 * Landing.tsx and its web-only children (Scanner, FoldText, TiltGlassCard,
 * HandWrittenTitle, LabelScanHeroSection) read these custom properties and
 * class names directly, exactly like the reference's own components do.
 */
export const GOV_CSS = `
.gov-landing, .gov-landing * { box-sizing: border-box; }

:root {
  --color-primary-navy: #1A3A5C;
  --color-secondary-blue: #2860A0;
  --color-accent-gold: #B8860B;
  --color-critical: #D0021B;
  --color-moderate: #F5A623;
  --color-minor: #7ED321;
  --color-needs-review: #B8860B;
  --color-bg-white: #FFFFFF;
  --color-surface: #F2F6FA;
  --color-surface-dark: #0E1B2A;
  --color-text-primary: #0F172A;
  --color-text-secondary: #334155;
  --color-text-muted: #64748B;
  --color-text-on-dark: #FFFFFF;
  --color-text-on-dark-muted: rgba(255,255,255,0.60);
  --color-border: #DDE4EE;
  --font-serif-elegant: 'Bodoni Moda', 'Cormorant Garamond', 'Playfair Display', Georgia, serif;
  --font-script: 'Pinyon Script', cursive;
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.25rem; --space-6: 1.5rem; --space-8: 2rem; --space-10: 2.5rem;
  --space-12: 3rem; --space-16: 4rem; --space-20: 5rem; --space-24: 6rem;
  --radius: 0.5rem; --radius-sm: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem;
  --radius-xl: 1rem; --radius-2xl: 1.5rem; --radius-full: 9999px;
}

.gov-container { width: 100%; max-width: 1280px; margin-inline: auto; padding-inline: var(--space-6); }
.section-py { padding-top: var(--space-20); padding-bottom: var(--space-20); }

.gov-card, .glass-card, .glass-card-dark {
  position: relative;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(12, 24, 38, 0.72);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  box-shadow: 0 18px 45px -8px rgba(0, 0, 0, 0.52), inset 0 1px 1px 0 rgba(255, 255, 255, 0.28), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.25);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.28s cubic-bezier(0.16, 1, 0.3, 1), background 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.glass-card-hover { cursor: pointer; }
.glass-card-hover:hover {
  transform: translateY(-5px);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.04) 100%), rgba(15, 30, 48, 0.82);
  border-color: rgba(92, 225, 230, 0.5);
  box-shadow: 0 26px 55px -10px rgba(0, 0, 0, 0.65), 0 0 25px -2px rgba(92, 225, 230, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.45);
}
.glass-card-glow {
  background: linear-gradient(145deg, rgba(92, 225, 230, 0.08) 0%, rgba(40, 96, 160, 0.09) 45%, rgba(255, 255, 255, 0.02) 100%), rgba(12, 25, 41, 0.78);
  border: 1px solid rgba(92, 225, 230, 0.35);
  box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.55), 0 0 30px -4px rgba(92, 225, 230, 0.2), inset 0 1px 1px 0 rgba(255, 255, 255, 0.35);
}
.glass-card-glow:hover {
  border-color: rgba(92, 225, 230, 0.65);
  box-shadow: 0 28px 60px -10px rgba(0, 0, 0, 0.7), 0 0 36px -2px rgba(92, 225, 230, 0.35), inset 0 1px 1px 0 rgba(255, 255, 255, 0.55);
}
.glass-card-subtle {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 100%), rgba(10, 20, 32, 0.6);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.18);
}
.glass-modal {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(10, 19, 31, 0.88);
  backdrop-filter: blur(28px) saturate(200%);
  -webkit-backdrop-filter: blur(28px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-2xl);
  box-shadow: 0 35px 80px -15px rgba(0, 0, 0, 0.75), 0 0 40px -10px rgba(92, 225, 230, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.35);
}

/* ── Uiverse.io 15-zone CSS-only tilt (MuhammadHasann), Legal Metrology calibration accents ── */
.card_container {
  --X: 0deg; --Y: 0deg; --Z: 0deg; --angleX: 14deg; --angleY: 18deg;
  cursor: pointer; position: relative; perspective: 1000px; transform-style: preserve-3d;
  display: flex; flex-direction: column;
}
.card_hover { position: absolute; z-index: 15; inset: 0; display: flex; flex-wrap: wrap; width: 100%; height: 100%; pointer-events: none; }
.card_hover .part { width: 20%; height: calc(100% / 3); background-color: transparent; pointer-events: auto; }
.card_container:has(.part-1:hover)  { --X: var(--angleX); --Y: calc(var(--angleY) * -1); }
.card_container:has(.part-2:hover)  { --X: var(--angleX); --Y: calc((var(--angleY) / 2) * -1); }
.card_container:has(.part-3:hover)  { --X: var(--angleX); --Y: 0deg; }
.card_container:has(.part-4:hover)  { --X: var(--angleX); --Y: calc(var(--angleY) / 2); }
.card_container:has(.part-5:hover)  { --X: var(--angleX); --Y: var(--angleY); }
.card_container:has(.part-6:hover)  { --X: 0deg; --Y: calc(var(--angleY) * -1); }
.card_container:has(.part-7:hover)  { --X: 0deg; --Y: calc((var(--angleY) / 2) * -1); }
.card_container:has(.part-8:hover)  { --X: 0deg; --Y: 0deg; }
.card_container:has(.part-9:hover)  { --X: 0deg; --Y: calc(var(--angleY) / 2); }
.card_container:has(.part-10:hover) { --X: 0deg; --Y: var(--angleY); }
.card_container:has(.part-11:hover) { --X: calc(var(--angleX) * -1); --Y: calc(var(--angleY) * -1); }
.card_container:has(.part-12:hover) { --X: calc(var(--angleX) * -1); --Y: calc((var(--angleY) / 2) * -1); }
.card_container:has(.part-13:hover) { --X: calc(var(--angleX) * -1); --Y: 0deg; }
.card_container:has(.part-14:hover) { --X: calc(var(--angleX) * -1); --Y: calc(var(--angleY) / 2); }
.card_container:has(.part-15:hover) { --X: calc(var(--angleX) * -1); --Y: var(--angleY); }
.card_container .card {
  position: relative; width: 100%; height: 100%; transform-origin: center;
  transform: rotateX(var(--X)) rotateY(var(--Y)) rotateZ(var(--Z));
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.26s ease, border-color 0.26s ease;
  transform-style: preserve-3d;
}
.card_container:hover .card {
  border-color: rgba(92, 225, 230, 0.55);
  box-shadow: 0 28px 65px -10px rgba(0, 0, 0, 0.7), 0 0 32px -2px rgba(92, 225, 230, 0.28), inset 0 1px 1px 0 rgba(255, 255, 255, 0.45);
}
.card_container .card a, .card_container .card button, .card_container .card input { position: relative; z-index: 20; pointer-events: auto; }
.card_container .metrology-icon, .card_container .card .metrology-icon {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  transform-origin: 50% 65%; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s ease;
  will-change: transform, filter;
}
.card_container:hover .metrology-icon, .card_container:hover .card .metrology-icon {
  transform: scale(1.18) translateZ(28px);
  filter: drop-shadow(0 0 12px rgba(92, 225, 230, 0.9)) drop-shadow(0 0 24px rgba(40, 96, 160, 0.6));
  animation: metrology-scale-balance 1.1s ease-in-out infinite alternate;
}
@keyframes metrology-scale-balance {
  0% { transform: scale(1.18) translateZ(28px) rotate(-8deg); }
  50% { transform: scale(1.22) translateZ(32px) rotate(0deg); }
  100% { transform: scale(1.18) translateZ(28px) rotate(8deg); }
}
.card_container .metrology-scan-line {
  position: absolute; inset-inline: 0; height: 2px;
  background: linear-gradient(90deg, transparent 0%, rgba(92, 225, 230, 0.25) 15%, rgba(92, 225, 230, 0.95) 50%, rgba(92, 225, 230, 0.25) 85%, transparent 100%);
  box-shadow: 0 0 10px 2px rgba(92, 225, 230, 0.8), 0 0 20px 4px rgba(40, 96, 160, 0.5);
  top: -5%; opacity: 0; pointer-events: none; z-index: 18;
}
.card_container:hover .metrology-scan-line { animation: metrology-beam-sweep 1.6s ease-in-out infinite; }
@keyframes metrology-beam-sweep {
  0% { top: -2%; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: 102%; opacity: 0; }
}

/* ── FoldText: 3D hinge-fold heading pieces ── */
.fold-text { display: inline-block; color: var(--fold-text-color, currentColor); font-size: var(--fold-text-font-size, inherit); font-weight: var(--fold-text-font-weight, inherit); line-height: 0.95; letter-spacing: -0.04em; white-space: pre-wrap; user-select: text; }
.fold-text-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.fold-text-visual { display: inline; }
.fold-text-line { display: block; }
.fold-text-whitespace { display: inline; }
.fold-text-segment { display: inline-block; line-height: inherit; perspective: var(--fold-perspective, 700px); transform-style: preserve-3d; vertical-align: baseline; }
.fold-text-segment[data-fold-split='line'] { display: block; }
.fold-text-piece { position: relative; display: inline-block; color: inherit; line-height: inherit; transform-style: preserve-3d; backface-visibility: hidden; will-change: transform, opacity; }
.fold-text-piece::after { content: ''; position: absolute; inset: -0.08em -0.02em; pointer-events: none; opacity: var(--fold-crease, 0); mix-blend-mode: multiply; border-radius: 0.08em; }
.fold-text-piece[data-fold-hinge='top']::after { background: linear-gradient(180deg, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 42%, rgba(255,255,255,0.26) 100%); }
@media (prefers-reduced-motion: reduce) {
  .fold-text-piece { transform: none !important; }
  .fold-text-piece::after { opacity: 0 !important; }
}

.scanner-container { position: relative; width: 100%; height: 100%; overflow: hidden; }
`;

export const GOV_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;0,6..96,700;0,6..96,800;1,6..96,400&family=Pinyon+Script&display=swap';

let mounted = false;

/** Injects the stylesheet + Google Fonts link into <head> exactly once per page load. */
export function mountGovStyles() {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;

  const style = document.createElement('style');
  style.setAttribute('data-gov-styles', 'true');
  style.textContent = GOV_CSS;
  document.head.appendChild(style);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = GOV_FONTS_HREF;
  document.head.appendChild(link);
}
