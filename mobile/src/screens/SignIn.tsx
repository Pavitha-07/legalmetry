import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { css } from 'react-native-reanimated';
import { api, type Session } from '../api';
import { tapLight } from '../haptics';
import { cssEase, r, sp, SERIF_ITALIC, tintedShadow, useTheme } from '../theme';
import { Button } from '../ui/Button';
import { Disclosure, Field } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';
import { ThemeToggle } from '../ui/Screen';
import { T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

type Reach = 'checking' | 'online' | 'offline';

const BRAND_FEATURES: { icon: 'target' | 'book-open' | 'user-check'; label: string }[] = [
  { icon: 'target', label: 'Coin-calibrated, millimetre-accurate measurement' },
  { icon: 'book-open', label: 'Deterministic rule engine — every finding cites its rule' },
  { icon: 'user-check', label: 'Human-in-the-loop review before anything is a violation' },
];

const dot = css.create({
  base: {
    width: 8,
    height: 8,
    borderRadius: 4,
    transitionProperty: 'backgroundColor',
    transitionDuration: '260ms',
    transitionTimingFunction: cssEase.out,
  },
});

export function SignIn({
  base,
  setBase,
  onSignedIn,
  onCreateAccount,
}: {
  base: string;
  setBase: (value: string) => void;
  onSignedIn: (session: Session) => void;
  onCreateAccount?: () => void;
}) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const split = isWeb && width >= 780;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [reach, setReach] = useState<Reach>('checking');

  /**
   * On a phone the API address is the single most common reason nothing works,
   * so the app checks it instead of waiting for a failed sign-in to say so.
   * `generation` guards against an earlier, slower probe resolving last and
   * reporting a stale verdict.
   */
  const generation = useRef(0);
  const probe = useCallback(
    (address: string) => {
      const mine = ++generation.current;
      setReach('checking');
      api
        .health(address)
        .then(() => {
          if (mine === generation.current) setReach('online');
        })
        .catch(() => {
          if (mine === generation.current) setReach('offline');
        });
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => probe(base), 400);
    return () => clearTimeout(timer);
  }, [base, probe]);

  useEffect(() => {
    // Surface the connection controls exactly when they are the problem.
    if (reach === 'offline') setShowConnection(true);
  }, [reach]);

  const reachColor = { checking: c.textFaint, online: c.pass, offline: c.fail }[reach];
  const reachLabel = { checking: 'Checking', online: 'Reachable', offline: 'No response' }[reach];

  const submit = async () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your official email address.';
    else if (!email.includes('@')) next.email = 'That does not look like an email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      setBusy(true);
      const session = await api.login(base, email.trim(), password);
      tapLight();
      onSignedIn(session);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in failed.');
      if (reach === 'offline') setShowConnection(true);
    } finally {
      setBusy(false);
    }
  };

  const brandPanel = (
    <View
      style={
        split
          ? { flex: 1, padding: sp.xxxl, justifyContent: 'center', gap: sp.lg, backgroundColor: c.accent, overflow: 'hidden' }
          : {
              borderRadius: r.container,
              backgroundColor: c.accentFill,
              padding: sp.xl,
              gap: sp.lg,
              ...tintedShadow(c.accent, { alpha: isDark ? 0.32 : 0.16, y: 10, blur: 22 }),
            }
      }
    >
      {split && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(255,255,255,0.05)', top: -120, right: -100 }} />
          <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.045)', bottom: -80, left: -60 }} />
          <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', bottom: 40, right: 20 }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#0B1F5C',
            borderWidth: 2,
            borderColor: '#D4AF37',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="shield" size={14} color="#D4AF37" />
        </View>
        <T
          v="monoMicro"
          color={split ? 'rgba(255,255,255,0.75)' : undefined}
          tone={split ? undefined : 'faint'}
          style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}
        >
          Government of India · भारत सरकार
        </T>
      </View>
      <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: '#FF9933' }} />
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, backgroundColor: '#138808' }} />
      </View>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: r.container,
          backgroundColor: split ? 'rgba(255,255,255,0.18)' : c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <T style={{ fontFamily: SERIF_ITALIC, fontSize: 28, color: split ? '#FFFFFF' : c.accentOn }}>LM</T>
      </View>
      <View style={{ gap: sp.xs }}>
        <T v="display" color={split ? '#FFFFFF' : undefined}>
          Legal Metrology
        </T>
        <T v="body" color={split ? 'rgba(255,255,255,0.82)' : undefined} tone={split ? undefined : 'dim'}>
          A compliance tool for enforcement under the Legal Metrology Act, 2009. Reads, measures,
          and cites the rule. You confirm the finding.
        </T>
      </View>

      {split && (
        <View style={{ gap: sp.md, marginTop: sp.sm }}>
          {BRAND_FEATURES.map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: sp.md }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={f.icon} size={14} color="#FFFFFF" />
              </View>
              <T v="label" color="rgba(255,255,255,0.88)" style={{ flex: 1 }}>
                {f.label}
              </T>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const formPanel = (
    <View style={split ? { flex: 1, padding: sp.xxxl, justifyContent: 'center', gap: sp.xl } : { gap: sp.xl }}>
      <View style={{ gap: sp.lg }}>
        <Field
          label="Officer / Supervisor email"
          icon="mail"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="name@example.gov.in"
          returnKeyType="next"
        />
        <Field
          label="Password"
          icon="lock"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
          secureTextEntry
          autoComplete="current-password"
          placeholder="Enter your password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      <View style={{ gap: sp.lg }}>
        <Button label="Sign in" onPress={submit} loading={busy} full icon="log-in" />

        {!!onCreateAccount && (
          <Button label="Create account" variant="ghost" onPress={onCreateAccount} full />
        )}

        <Disclosure
          label="Connection"
          open={showConnection}
          onToggle={() => setShowConnection((open) => !open)}
          detail={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Animated.View style={[dot.base, { backgroundColor: reachColor }]} />
              <T v="label" color={reachColor}>
                {reachLabel}
              </T>
            </View>
          }
        >
          <Field
            label="API address"
            icon="server"
            value={base}
            onChangeText={setBase}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.10:8000"
            helper={
              Platform.OS === 'web'
                ? 'The browser talks to the backend directly.'
                : 'A phone cannot reach your laptop through localhost. Use the laptop Wi-Fi address.'
            }
          />
          <Button
            label="Test connection"
            variant="secondary"
            size="md"
            icon="activity"
            onPress={() => probe(base)}
            loading={reach === 'checking'}
          />
        </Disclosure>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: isWeb ? c.fill : c.bg }}>
      <View
        style={{
          position: 'absolute',
          top: insets.top + sp.xs,
          right: sp.sm,
          zIndex: 1,
        }}
      >
        <ThemeToggle />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: isWeb ? 'center' : undefined,
            justifyContent: 'center',
            paddingHorizontal: sp.xl,
            paddingTop: insets.top + sp.huge,
            paddingBottom: insets.bottom + sp.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Reveal>
            <View style={isWeb ? { width: '100%', maxWidth: split ? 880 : 420 } : undefined}>
              {split ? (
                <View
                  style={{
                    flexDirection: 'row',
                    borderRadius: 28,
                    overflow: 'hidden',
                    backgroundColor: c.surface,
                    ...tintedShadow(c.accent, { alpha: isDark ? 0.3 : 0.14, y: 16, blur: 40 }),
                  }}
                >
                  {brandPanel}
                  {formPanel}
                </View>
              ) : isWeb ? (
                <View
                  style={{
                    borderRadius: r.container,
                    backgroundColor: c.surface,
                    padding: sp.xxl,
                    gap: sp.xl,
                    ...tintedShadow(c.accent, { alpha: isDark ? 0.3 : 0.14, y: 16, blur: 40 }),
                  }}
                >
                  {brandPanel}
                  {formPanel}
                </View>
              ) : (
                <View style={{ gap: sp.xl }}>
                  {brandPanel}
                  {formPanel}
                </View>
              )}
            </View>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
