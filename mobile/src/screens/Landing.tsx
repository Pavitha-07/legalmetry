import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Icon, type IconName } from '../ui/Icon';
import { FoldText } from '../ui/web/FoldText';
import { HandWrittenTitle } from '../ui/web/HandWrittenTitle';
import { LabelScanHeroSection } from '../ui/web/LabelScanHeroSection';
import { Scanner } from '../ui/web/Scanner';
import { TiltGlassCard } from '../ui/web/TiltGlassCard';
import { mountGovStyles } from '../ui/web/govStyles';

/**
 * Web-only front door (see App.tsx: gated behind Platform.OS === 'web').
 * A phone install goes straight to Sign In — an inspector already knows
 * what the app is; a browser visitor showing up at the bare login form does
 * not.
 *
 * This is a literal visual port of a government-portal reference design
 * (dark navy, WebGL scanning background, glassmorphism, 3D fold headings) —
 * built with raw DOM elements instead of React Native primitives, since
 * that's what the effects (a WebGL canvas, CSS `:has()` tilt, GSAP
 * ScrollTrigger) require. Safe here because this screen only ever mounts on
 * Platform.OS === 'web' (see App.tsx's router) — see src/ui/web/Scanner.tsx
 * for the full reasoning.
 *
 * Not ported: the reference's four demo modals (a fake 7-step product tour,
 * a duplicate retailer-lookup modal, an e-commerce cross-check with no real
 * backend, and a "request a demo" lead form with nowhere to send it). Their
 * buttons are rewired to this app's real screens instead — sign-in, account
 * creation, or the real compliance lookup (ComplianceLookup.tsx) — so every
 * button on this page does something real.
 */

const NAVY = '#1A3A5C';
const BLUE = '#2860A0';
const CYAN = '#5CE1E6';
const BG = '#0A131F';

type IconMap = Record<string, IconName>;
const I: IconMap = {
  shield: 'shield',
  camera: 'camera',
  read: 'search',
  measure: 'sliders',
  validate: 'check-circle',
  review: 'user-check',
  report: 'file-text',
  setup: 'database',
  coins: 'target',
  scale: 'sliders',
  mrp: 'dollar-sign',
  date: 'clock',
  care: 'phone',
  fontHeight: 'eye',
  building: 'briefcase',
  lock: 'lock',
  alert: 'alert-triangle',
  arrowRight: 'arrow-right',
  externalLink: 'external-link',
  layers: 'layers',
  store: 'shopping-bag',
  globe: 'globe',
  clock: 'clock',
  award: 'award',
  checkCircle: 'check-circle',
};

export function Landing({
  onSignIn,
  onCreateAccount,
  onCheckCompliance,
}: {
  onSignIn: () => void;
  onCreateAccount: () => void;
  onCheckCompliance: () => void;
}) {
  useEffect(() => {
    mountGovStyles();

    // The rest of this app scrolls via React Native's <ScrollView>, which
    // manages its own inner scroll region and relies on `body { overflow:
    // hidden }` (set in web/index.html) to stay put. This screen is a plain
    // DOM page instead, so it needs to own body/html scroll + background
    // itself while mounted — restored on unmount so no other screen is
    // affected.
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyBackground: body.style.background,
      htmlBackground: html.style.background,
    };
    body.style.overflow = 'auto';
    body.style.background = BG;
    html.style.background = BG;

    // Google Fonts load asynchronously. FoldText's ScrollTrigger instances
    // measure element positions at mount time — before the font swap — so
    // their trigger thresholds are stale after the swap changes line heights.
    // Refreshing ScrollTrigger after fonts are ready fixes headings that
    // stay invisible because their trigger point was never reached.
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        ScrollTrigger.refresh();
      });
    }

    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.background = prev.bodyBackground;
      html.style.background = prev.htmlBackground;
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="gov-landing" style={{ minHeight: '100vh', background: BG, color: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Top government bar ─────────────────────────────────────────── */}
      <header
        style={{
          background: 'rgba(10, 19, 31, 0.92)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div className="gov-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 'var(--space-3)', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                title="National Emblem Placeholder"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(8px)',
                  border: '1.5px dashed rgba(255,255,255,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={I.shield} size={20} color="rgba(255,255,255,0.85)" />
              </div>
              <div>
                <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  Legal Metrology Inspection Portal
                </div>
                <div style={{ color: 'rgba(255,255,255,0.60)', fontSize: '0.72rem', marginTop: 2 }}>
                  Department of Consumer Affairs, Government of India
                </div>
              </div>
            </div>

            <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
              <NavA label="Problem" onClick={() => scrollTo('problem')} />
              <NavA label="Process" onClick={() => scrollTo('process')} />
              <NavA label="Defensibility" onClick={() => scrollTo('why-different')} />
              <NavA label="Supervisors" icon={I.externalLink} onClick={onSignIn} />
              <NavA label="Retailers" onClick={onCheckCompliance} />

              <button
                type="button"
                onClick={onSignIn}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 16px',
                  background: 'rgba(40, 96, 160, 0.55)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.28)',
                  color: 'white',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                }}
              >
                <Icon name="log-in" size={13} color={CYAN} />
                Sign in to inspect
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero (3D box, no Scanner behind it, dark background) ────── */}
        <section style={{ position: 'relative', minHeight: '92vh', background: '#0E1B2A' }}>
          <LabelScanHeroSection focusX={0.75} scrim="left" style={{ minHeight: '92vh' } as React.CSSProperties} onBoxClick={onSignIn} onZoneClick={onSignIn}>
            <div style={{ display: 'flex', height: '100%', minHeight: '92vh', alignItems: 'center', padding: 'var(--space-10) var(--space-6)' }}>
              <div style={{ maxWidth: '42rem', pointerEvents: 'auto' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 14px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: 'var(--radius-full)',
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 'var(--space-6)',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                  }}
                >
                  <Icon name={I.shield} size={14} color={CYAN} />
                  Legal Metrology (Packaged Commodities) Rules, 2011
                </div>

                <HandWrittenTitle
                  title={'Compliance checking that used to take a shelf audit\nnow takes a photo.'}
                  subtitle="A computer-vision and rule-engine platform that helps Legal Metrology enforcement officers scan packaged commodities, verify mandatory declarations, and generate evidence-backed reports — in the field, in minutes."
                  textColor="#FFFFFF"
                  strokeColor="#E8192C"
                />

                <div style={{ marginTop: 'var(--space-8)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={onSignIn}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '13px 28px',
                      background: 'rgba(255, 255, 255, 0.96)',
                      color: NAVY,
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      border: '1px solid rgba(255, 255, 255, 0.8)',
                      cursor: 'pointer',
                      boxShadow: '0 8px 25px rgba(0,0,0,0.25), inset 0 1px 1px white',
                    }}
                  >
                    Sign in to inspect
                    <Icon name="chevron-right" size={16} color={NAVY} />
                  </button>
                  <button
                    type="button"
                    onClick={onCreateAccount}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '13px 24px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      color: 'rgba(255,255,255,0.92)',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    <Icon name="user-plus" size={15} color={CYAN} />
                    Create account
                  </button>
                </div>

                <div style={{ marginTop: 'var(--space-10)', paddingTop: 'var(--space-6)', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                  <SpecPill icon={I.coins} color="#F5A623" label="₹10 Coin Scale Ruler" />
                  <SpecPill icon={I.scale} color="#7ED321" label="First Schedule Tolerances" />
                  <SpecPill icon={I.lock} color={CYAN} label="SHA-256 Tamper-Evident Chain" />
                </div>
              </div>
            </div>
          </LabelScanHeroSection>
        </section>

        {/* ── Everything below: WebGL Scanner background ──────────────── */}
        <div style={{ position: 'relative', minHeight: '100vh' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100%' }}>
              <Scanner
                color1="#07111D"
                color2="#1A3A5C"
                color3={CYAN}
                speed={0.3}
                sweepSpeed={0.2}
                sweepWidth={1.8}
                sweepFalloff={5}
                scale={1.35}
                frequency={2.0}
                ripple={0.16}
                bandDensity={11}
                lineSharpness={5.2}
                glow={0.26}
                scanDirection="vertical"
                colorSpread={0.65}
                brightness={0.88}
                contrast={1.15}
                softness={1.5}
                vignette={0.45}
                scanline
                grain
                grainIntensity={0.035}
                opacity={0.82}
                mouseInteraction
                mouseRadius={0.5}
                mouseStrength={0.5}
              />
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* ── 1. Problem ──────────────────────────────────────────── */}
            <section id="problem" className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <Eyebrow icon={I.alert} color="#FF6B7A" bg="rgba(208, 2, 27, 0.12)" border="rgba(208, 2, 27, 0.3)">
                  The gap in enforcement today
                </Eyebrow>
                <Heading text="Manual inspection can't keep pace with the market." />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-10)', alignItems: 'start' }}>
                  <div style={{ maxWidth: '42rem' }}>
                    <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.75, margin: '0 0 var(--space-6)' }}>
                      Every packaged commodity sold in India — from a sachet of shampoo to a sack of fertilizer — must
                      carry mandatory declarations under the Legal Metrology (Packaged Commodities) Rules, 2011:
                      manufacturer details, net quantity, MRP, date of packing, consumer care information, and minimum
                      font-size requirements for readability. Enforcement officers currently verify all of this by
                      eye, one product at a time, with no way to prove a measurement after the fact if it's ever
                      challenged.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
                      {PROBLEM_FIELDS.map((f) => (
                        <TiltGlassCard key={f.label} cardStyle={{ padding: 'var(--space-5)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <MetrologyIcon icon={f.icon} />
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#FFFFFF' }}>{f.label}</div>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{f.desc}</div>
                        </TiltGlassCard>
                      ))}
                    </div>
                  </div>

                  <TiltGlassCard
                    variant="glow"
                    cardStyle={{ padding: 'var(--space-8)', borderLeft: `4px solid ${BLUE}`, borderTop: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-4)' }}>
                      <MetrologyIcon icon={I.shield} big />
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>How This Platform Resolves The Gap</h3>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
                      By combining ₹10 coin physical calibration with OpenCV computer vision and deterministic rule
                      data, enforcement officers generate millimetre-accurate findings in minutes rather than
                      squinting by eye.
                    </p>
                    <button
                      type="button"
                      onClick={onSignIn}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: BLUE, color: 'white', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(40,96,160,0.4)' }}
                    >
                      <Icon name="camera" size={16} color="#fff" />
                      Sign In &amp; Launch Field Inspection
                    </button>
                  </TiltGlassCard>
                </div>
              </div>
            </section>

            {/* ── 2. Process ──────────────────────────────────────────── */}
            <section id="process" className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <div style={{ maxWidth: 760, marginBottom: 'var(--space-12)' }}>
                  <Eyebrow icon={I.layers} color={CYAN} bg="rgba(40, 96, 160, 0.2)" border="rgba(40, 96, 160, 0.35)">
                    The 7-stage inspection pipeline
                  </Eyebrow>
                  <Heading text="Set up → Capture → Read → Measure → Validate → Review → Report" size="md" />
                  <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
                    Every step below is a real, working stage of the inspection engine.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)' }}>
                  {PROCESS_STEPS.map((step) => (
                    <TiltGlassCard key={step.n} cardStyle={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 240 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                          <IconBadge icon={step.icon} />
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(40, 96, 160, 0.2)', border: '1px solid rgba(40, 96, 160, 0.35)', color: CYAN }}>
                            STEP {step.n}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 var(--space-2)' }}>{step.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, margin: 0 }}>{step.text}</p>
                      </div>
                    </TiltGlassCard>
                  ))}
                </div>
              </div>
            </section>

            {/* ── 3. Differentiators ─────────────────────────────────── */}
            <section id="why-different" className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <div style={{ maxWidth: 680, marginBottom: 'var(--space-12)' }}>
                  <Eyebrow icon={I.award} color="#99E546" bg="rgba(126, 211, 33, 0.12)" border="rgba(126, 211, 33, 0.3)">
                    Core Differentiators
                  </Eyebrow>
                  <Heading text="Built to be defensible, not just automated." />
                  <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '1rem', lineHeight: 1.65, margin: 0 }}>
                    Every architectural decision is made so enforcement actions withstand judicial scrutiny under the
                    Legal Metrology Act, 2009.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 'var(--space-6)' }}>
                  {DIFFERENTIATORS.map((d) => (
                    <TiltGlassCard key={d.title} cardStyle={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 220 }}>
                      <div>
                        <IconBadge icon={d.icon} small />
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', margin: 'var(--space-4) 0 var(--space-3)', lineHeight: 1.3 }}>{d.title}</h3>
                        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.65, margin: 0 }}>{d.body}</p>
                      </div>
                    </TiltGlassCard>
                  ))}

                  <TiltGlassCard cardStyle={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 220 }}>
                    <div>
                      <IconBadge icon={I.store} small />
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', margin: 'var(--space-4) 0 var(--space-3)', lineHeight: 1.3 }}>Retailers aren't left exposed.</h3>
                      <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.65, margin: '0 0 1.25rem' }}>
                        A free, no-login compliance lookup lets any retailer check a manufacturer's confirmed status
                        before stocking a product — because under current enforcement, sellers get fined too.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onCheckCompliance}
                      style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFFFFF', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      Launch Retailer Lookup
                      <Icon name="arrow-right" size={12} color="#fff" />
                    </button>
                  </TiltGlassCard>
                </div>
              </div>
            </section>

            {/* ── 4. Trust & Transparency ─────────────────────────────── */}
            <section className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <div style={{ maxWidth: 780, margin: '0 auto', textAlign: 'center' }}>
                  <Eyebrow icon={I.shield} color="#FFFFFF" bg="rgba(255,255,255,0.1)" border="rgba(255,255,255,0.2)" center>
                    Trust &amp; Transparency
                  </Eyebrow>
                  <Heading text="What this system is — and isn't." center />
                  <div className="glass-card" style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.8, margin: '0 0 var(--space-4)', textAlign: 'left', padding: 'var(--space-8)' }}>
                    This is not an autonomous inspector, and it doesn't make legal findings on its own. It's a tool
                    that does the repetitive reading, locating, and measuring work fast and consistently — using OCR
                    and computer vision, not machine judgment — so an enforcement officer can spend their time on
                    decisions, not on squinting at font sizes or doing arithmetic on tolerance tables. Every
                    compliance outcome traces back to a specific, named rule. Every uncertain case goes to a human.
                    Evidence is hashed at capture for tamper-evidence — one part of a chain of custody, not a claim of
                    automatic court admissibility.
                  </div>
                </div>
              </div>
            </section>

            {/* ── 5. For Supervisors ──────────────────────────────────── */}
            <section className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-10)', alignItems: 'center' }}>
                  <div>
                    <Eyebrow icon="bar-chart" color={CYAN} bg="rgba(40, 96, 160, 0.2)" border="rgba(40, 96, 160, 0.35)">
                      For Supervisors
                    </Eyebrow>
                    <Heading text="One dashboard, every inspection." />
                    <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, margin: '0 0 var(--space-6)' }}>
                      Track inspections across your jurisdiction, see violations ranked by actual legal severity,
                      monitor the human-review queue, and manage improvement-notice and escalation cases from issue
                      to resolution — without waiting on paper to move up the chain.
                    </p>
                    <button
                      type="button"
                      onClick={onSignIn}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: BLUE, color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                    >
                      Sign In as Supervisor
                      <Icon name="external-link" size={16} color="#fff" />
                    </button>
                  </div>

                  <TiltGlassCard variant="glow" cardStyle={{ padding: 'var(--space-6)', color: 'white' }} onClick={onSignIn}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'var(--space-4)', borderBottom: '1px solid rgba(255,255,255,0.12)', marginBottom: 'var(--space-5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#7ED321', boxShadow: '0 0 10px #7ED321' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Sample Jurisdiction View</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: CYAN }}>Sign in to open dashboard →</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
                      <StatTile label="Scans Today" value="142" />
                      <StatTile label="Critical Flag" value="8" color="#FF5C6C" bg="rgba(208,2,27,0.15)" border="rgba(208,2,27,0.35)" />
                      <StatTile label="Review Queue" value="3" color="#FFBA3B" bg="rgba(245,166,35,0.15)" border="rgba(245,166,35,0.35)" />
                    </div>

                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>Active Escalation &amp; Improvement Notices</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <PreviewRow id="IN-2026-0891" item="Mustard Oil 1L (Font 1.2mm < 2.0mm)" status="Day 14 of 30 Window" color="#FFBA3B" />
                      <PreviewRow id="IN-2026-0884" item="Detergent 500g (Net Qty Shortage 12g)" status="Officer Action Required" color="#FF5C6C" />
                    </div>
                  </TiltGlassCard>
                </div>
              </div>
            </section>

            {/* ── 6. For Retailers ────────────────────────────────────── */}
            <section className="section-py" style={{ position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-10)', alignItems: 'center' }}>
                  <div>
                    <Eyebrow icon={I.store} color="#FFFFFF" bg="rgba(255,255,255,0.1)" border="rgba(255,255,255,0.2)">
                      For Retailers
                    </Eyebrow>
                    <Heading text="Know before you buy." />
                    <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, margin: '0 0 var(--space-6)' }}>
                      Search any manufacturer's confirmed compliance record — free, no account needed — before you
                      place an order. See whether their products currently meet Legal Metrology requirements, so a
                      labeling mistake you didn't make doesn't become a fine you have to pay.
                    </p>
                    <button
                      type="button"
                      onClick={onCheckCompliance}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: BLUE, color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                    >
                      <Icon name="search" size={16} color="#fff" />
                      Launch Retailer Compliance Lookup
                    </button>
                  </div>

                  <TiltGlassCard variant="glow" cardStyle={{ padding: 'var(--space-8)' }} onClick={onCheckCompliance}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
                      <MetrologyIcon icon={I.store} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: CYAN, textTransform: 'uppercase' }}>Public Registry Tool</span>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>Pre-Order Supplier Verification</h3>
                    <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: '0 0 1rem' }}>
                      Search registered manufacturers across India and verify active compliance records before
                      receiving stock.
                    </p>
                    <div style={{ color: CYAN, fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>Open compliance lookup →</div>
                  </TiltGlassCard>
                </div>
              </div>
            </section>

            {/* ── 7. Closing CTA ──────────────────────────────────────── */}
            <section className="section-py" style={{ textAlign: 'center', position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="gov-container" style={{ position: 'relative', zIndex: 1, maxWidth: 820 }}>
                <div style={{ margin: '0 0 var(--space-6)' }}>
                  <FoldText
                    text="Enforcement shouldn't depend on how sharp a shelf inspector's eyes are that day."
                    splitBy="word"
                    hinge="top"
                    trigger="scroll"
                    duration={0.65}
                    stagger={0.03}
                    fontSize="clamp(2rem, 3.8vw, 3.2rem)"
                    fontWeight={600}
                    color="#FFFFFF"
                    style={{ fontFamily: 'var(--font-serif-elegant)', lineHeight: 1.2, letterSpacing: '-0.015em' }}
                  />
                </div>
                <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, margin: '0 auto var(--space-8)', maxWidth: '36rem' }}>
                  Coin-calibrated OpenCV measurement, automated First Schedule tolerance checking, and tamper-evident
                  reporting — ready for the next inspection.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={onSignIn}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'white', color: NAVY, borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }}
                  >
                    Sign in
                    <Icon name="log-in" size={16} color={NAVY} />
                  </button>
                  <button
                    type="button"
                    onClick={onCreateAccount}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
                  >
                    Create account
                  </button>
                </div>
              </div>
            </section>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <footer style={{ background: 'rgba(7, 17, 29, 0.95)', backdropFilter: 'blur(16px)', color: '#FFFFFF', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="gov-container" style={{ paddingBlock: 'var(--space-12)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 'var(--space-2)' }}>Legal Metrology Inspection Portal</div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.60)', lineHeight: 1.6 }}>
                      Department of Consumer Affairs, Ministry of Consumer Affairs, Food &amp; Public Distribution,
                      Government of India.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.60)', marginBottom: 'var(--space-3)' }}>
                      Statutory References
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                      {STATUTORY_LINKS.map((l) => (
                        <li key={l.label}>
                          <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>
                            {l.label} →
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.60)', marginBottom: 'var(--space-3)' }}>
                      Enforcement Standards
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                      Designed for state &amp; central Legal Metrology controllers. Evidence hashing conforms to
                      Indian Evidence Act standards for digital chain of custody.
                    </div>
                  </div>
                </div>
                <div style={{ paddingTop: 'var(--space-6)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                  <div>© {new Date().getFullYear()} Department of Consumer Affairs, Government of India.</div>
                  <div>GIGW 3.0 Accessibility • W3C WCAG 2.1 AA Compliant</div>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PROBLEM_FIELDS: { icon: IconName; label: string; desc: string }[] = [
  { icon: I.building, label: 'Manufacturer Details', desc: 'Name, registered address, country of origin' },
  { icon: I.coins, label: 'Net Quantity & Unit', desc: 'First schedule weight/volume tolerance' },
  { icon: I.mrp, label: 'Maximum Retail Price (MRP)', desc: 'Inclusive of all taxes, uniform format' },
  { icon: I.date, label: 'Date of Packing / Import', desc: 'Month & year, batch traceability' },
  { icon: I.care, label: 'Consumer Care Info', desc: 'Name, address, phone & email of care officer' },
  { icon: I.fontHeight, label: 'Minimum Font-Height', desc: '1.0mm to 4.0mm based on packaging area' },
];

const PROCESS_STEPS: { n: string; icon: IconName; title: string; text: string }[] = [
  { n: '01', icon: I.setup, title: 'Set up', text: 'The inspector enters product, manufacturer, and commodity category details before scanning — this becomes ground truth to verify against, not something guessed from a photo.' },
  { n: '02', icon: I.camera, title: 'Capture', text: "Multiple package panels are photographed as needed. Each panel gets two shots: one with a ₹10 coin beside the label for scale, one clean shot for reading — so the coin never blocks the text it's measuring." },
  { n: '03', icon: I.read, title: 'Read', text: 'OCR extracts every declaration with a confidence score attached to every field — and cross-checks what it reads against what the inspector entered at setup, flagging any mismatch.' },
  { n: '04', icon: I.coins, title: 'Measure', text: 'The coin gives the system a real-world ruler. OpenCV converts font height from pixels into actual millimetres, correcting for camera tilt automatically.' },
  { n: '05', icon: I.scale, title: 'Validate', text: 'A structured, version-controlled rule engine checks every extracted fact against the exact Legal Metrology provision that applies — including net-quantity tolerance bands from the First Schedule.' },
  { n: '06', icon: I.review, title: 'Review', text: "Anything uncertain goes to the officer for confirmation before it's ever called a violation. Net quantity — which no photo can verify — is physically weighed and entered directly." },
  { n: '07', icon: I.report, title: 'Report', text: 'A complete, evidence-backed report — photos, bounding boxes, measurements, rule citations — generates in seconds.' },
];

const DIFFERENTIATORS: { icon: IconName; title: string; body: string }[] = [
  { icon: I.coins, title: 'Millimetre-accurate, not a guess.', body: "Font-size compliance is measured in real-world millimetres using a coin already in every inspector's pocket — not estimated from raw pixels." },
  { icon: I.setup, title: 'The rule engine is data, not code.', body: "Every provision — including the First Schedule's net-quantity tolerance table — lives as versioned rule data. A regulation change means updating a record, not rewriting code." },
  { icon: I.report, title: 'Every finding shows its work.', body: 'No black-box verdicts. Every violation shows the field, the exact rule it failed, the evidence photo, and a confidence score.' },
  { icon: I.scale, title: "What can't be measured by camera isn't faked.", body: 'Net quantity accuracy requires a real scale — the officer physically weighs the product and enters the result, rather than pretending a photo can do it.' },
  { icon: I.review, title: 'The officer always has the last word.', body: 'Low-confidence results, and any declared-vs-extracted mismatch, wait for a human to confirm — never silently auto-approved or auto-rejected.' },
  { icon: I.clock, title: 'Current with the law, not just the Rules.', body: 'The 2026 Improvement Notice reform is digitized — tracking rectification windows and escalating to a fine recommendation, exactly as the amended Act intends.' },
];

const STATUTORY_LINKS = [
  { label: 'Legal Metrology Act, 2009', url: 'https://consumeraffairs.nic.in/legal-metrology/acts-rules' },
  { label: 'LM (Packaged Commodities) Rules, 2011', url: 'https://consumeraffairs.nic.in/legal-metrology/acts-rules' },
  { label: 'Jan Vishwas (Amendment) Act, 2023', url: 'https://consumeraffairs.nic.in' },
];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function NavA({ label, icon, onClick }: { label: string; icon?: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.60)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.60)')}
    >
      {label}
      {!!icon && <Icon name={icon} size={11} color="currentColor" />}
    </button>
  );
}

function SpecPill({ icon, color, label }: { icon: IconName; color: string; label: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-full)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={14} color={color} />
      <span style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.88)' }}>{label}</span>
    </div>
  );
}

function Eyebrow({
  icon,
  color,
  bg,
  border,
  center,
  children,
}: {
  icon: IconName;
  color: string;
  bg: string;
  border: string;
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 14px',
        background: bg,
        backdropFilter: 'blur(12px)',
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-full)',
        color,
        fontSize: '0.74rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: 'var(--space-4)',
        ...(center ? { marginInline: 'auto' } : null),
      }}
    >
      <Icon name={icon} size={13} color={color} />
      {children}
    </div>
  );
}

function Heading({ text, size = 'lg', center }: { text: string; size?: 'lg' | 'md'; center?: boolean }) {
  return (
    <div style={{ marginBottom: 'var(--space-6)', maxWidth: '52rem', ...(center ? { marginInline: 'auto' } : null) }}>
      <FoldText
        text={text}
        splitBy="word"
        hinge="top"
        trigger="scroll"
        duration={0.65}
        stagger={size === 'lg' ? 0.035 : 0.03}
        fontSize={size === 'lg' ? 'clamp(2rem, 3.8vw, 3.2rem)' : 'clamp(1.7rem, 3.2vw, 2.5rem)'}
        fontWeight={600}
        color="#FFFFFF"
        style={{ fontFamily: 'var(--font-serif-elegant)', lineHeight: 1.15, letterSpacing: '-0.015em' }}
      />
    </div>
  );
}

function MetrologyIcon({ icon, big }: { icon: IconName; big?: boolean }) {
  const size = big ? 44 : 32;
  return (
    <div
      className="metrology-icon"
      style={{ width: size, height: size, borderRadius: 'var(--radius-md)', background: 'rgba(92, 225, 230, 0.15)', border: '1px solid rgba(92, 225, 230, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <Icon name={icon} size={big ? 26 : 16} color={CYAN} />
    </div>
  );
}

function IconBadge({ icon, small }: { icon: IconName; small?: boolean }) {
  const size = small ? 38 : 42;
  return (
    <div
      className="metrology-icon"
      style={{ width: size, height: size, borderRadius: 'var(--radius-lg)', background: 'rgba(40, 96, 160, 0.35)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: CYAN }}
    >
      <Icon name={icon} size={small ? 19 : 20} color={CYAN} />
    </div>
  );
}

function StatTile({ label, value, color, bg, border }: { label: string; value: string; color?: string; bg?: string; border?: string }) {
  return (
    <div className="glass-card-subtle" style={{ padding: 10, ...(border ? { borderColor: border } : null), ...(bg ? { background: bg } : null) }}>
      <div style={{ fontSize: '0.7rem', color: color ? `${color}CC` : 'rgba(255,255,255,0.65)' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 2, color: color ?? '#fff' }}>{value}</div>
    </div>
  );
}

function PreviewRow({ id, item, status, color }: { id: string; item: string; status: string; color: string }) {
  return (
    <div className="glass-card-subtle" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{item}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{id}</div>
      </div>
      <span style={{ color, fontWeight: 600, fontSize: '0.7rem' }}>{status}</span>
    </div>
  );
}
