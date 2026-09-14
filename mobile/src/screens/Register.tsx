import { useState } from 'react';
import { Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api';
import { r, sp, tintedShadow, useTheme } from '../theme';
import { ActionBar, Button, IconButton } from '../ui/Button';
import { Field } from '../ui/Field';
import { Reveal } from '../ui/Reveal';
import { Screen, ThemeToggle } from '../ui/Screen';
import { Segmented } from '../ui/Segmented';
import { T } from '../ui/primitives';
import { useToast } from '../ui/Toast';

/**
 * Self-serve account creation is inspector-only, matching the backend:
 * POST /auth/register always creates an INSPECTOR. The one supervisor
 * account is seeded from environment variables, not created here. The
 * Inspector/Supervisor toggle below is layout only — both options submit
 * the same request — so the caption under it says so rather than letting
 * someone believe picking "Supervisor" grants elevated access.
 */
export function Register({
  base,
  onRegistered,
  onCancel,
}: {
  base: string;
  onRegistered: () => void;
  onCancel: () => void;
}) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const centered = isWeb && width >= 560;

  const [role, setRole] = useState<'inspector' | 'supervisor'>('inspector');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    if (!email.includes('@')) next.email = 'Enter a valid email address.';
    if (password.length < 12) next.password = 'Use at least 12 characters.';
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      setBusy(true);
      await api.register(base, { email: email.trim(), full_name: fullName.trim(), password });
      toast.success('Account created. Sign in below.');
      onRegistered();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <View style={{ gap: sp.lg }}>
      <View style={{ gap: sp.xs }}>
        <T v="label" tone="dim">
          Register as
        </T>
        <Segmented
          segments={[
            { value: 'inspector', label: 'Inspector' },
            { value: 'supervisor', label: 'Supervisor' },
          ]}
          value={role}
          onChange={setRole}
        />
        <T v="label" tone="faint">
          Both create an inspector account today — supervisor access is granted separately.
        </T>
      </View>

      <Field
        label="Full name"
        icon="user"
        value={fullName}
        onChangeText={(value) => {
          setFullName(value);
          if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
        }}
        error={errors.fullName}
        placeholder="As it should appear on reports"
        returnKeyType="next"
      />
      <Field
        label="Official email"
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
        autoComplete="new-password"
        placeholder="At least 12 characters"
        returnKeyType="next"
      />
      <Field
        label="Confirm password"
        icon="lock"
        value={confirm}
        onChangeText={(value) => {
          setConfirm(value);
          if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        error={errors.confirm}
        secureTextEntry
        autoComplete="new-password"
        placeholder="Re-enter the password"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
    </View>
  );

  if (!isWeb) {
    return (
      <Screen
        title="Create account"
        onBack={onCancel}
        subtitle="Registers a new inspector. Supervisor accounts are issued separately."
        footer={
          <ActionBar inset={insets.bottom}>
            <Button label="Create account" icon="user-plus" onPress={submit} loading={busy} full />
          </ActionBar>
        }
      >
        <Reveal>
          <View style={{ marginTop: sp.md }}>{form}</View>
        </Reveal>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.fill }}>
      <View style={{ position: 'absolute', top: insets.top + sp.xs, left: sp.sm, zIndex: 1 }}>
        <IconButton name="chevron-left" onPress={onCancel} label="Back" />
      </View>
      <View style={{ position: 'absolute', top: insets.top + sp.xs, right: sp.sm, zIndex: 1 }}>
        <ThemeToggle />
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: sp.xl,
          paddingTop: insets.top + sp.huge,
          paddingBottom: insets.bottom + sp.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Reveal>
          <View
            style={{
              width: '100%',
              maxWidth: centered ? 460 : 420,
              borderRadius: r.container,
              backgroundColor: c.surface,
              padding: sp.xxl,
              gap: sp.xl,
              ...tintedShadow(c.accent, { alpha: isDark ? 0.3 : 0.14, y: 16, blur: 40 }),
            }}
          >
            <View style={{ gap: sp.xs }}>
              <T v="display">Create account</T>
              <T v="body" tone="dim">
                Registers a new inspector. Supervisor accounts are issued separately.
              </T>
            </View>

            {form}

            <Button label="Create account" icon="user-plus" onPress={submit} loading={busy} full />

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: sp.xs }}>
              <T v="label" tone="dim">
                Already have an account?
              </T>
              <T v="labelStrong" tone="accent" onPress={onCancel}>
                Sign in
              </T>
            </View>
          </View>
        </Reveal>
      </ScrollView>
    </View>
  );
}
