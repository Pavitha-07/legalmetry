import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { dur, ease, r, sp, spring, toneColors, useTheme, type Tone } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressScale, T } from './primitives';
import { notifyError, notifySuccess, tapLight } from '../haptics';

type Toast = { id: number; message: string; tone: Tone; icon: IconName; ttl: number };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastCtx = createContext<ToastApi>({ success: () => {}, error: () => {}, info: () => {} });
export const useToast = () => useContext(ToastCtx);

/**
 * Replaces every `Alert.alert` in the app. A modal alert stops the officer,
 * steals the frame, and looks like the operating system rather than the tool.
 * A toast reports the same thing without taking the screen away.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: Tone, icon: IconName, ttl: number) => {
    seq.current += 1;
    setToast({ id: seq.current, message, tone, icon, ttl });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        notifySuccess();
        push(message, 'pass', 'check-circle', 3200);
      },
      error: (message) => {
        notifyError();
        push(message, 'fail', 'alert-circle', 5000);
      },
      info: (message) => push(message, 'busy', 'info', 3600),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {!!toast && (
        <ToastView key={toast.id} toast={toast} onDismiss={() => setToast(null)} />
      )}
    </ToastCtx.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { fg, bg } = toneColors(c, toast.tone);
  const y = useSharedValue(0);
  const start = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.ttl);
    return () => clearTimeout(timer);
  }, [toast.ttl, onDismiss]);

  // It entered from the bottom, so it leaves toward the bottom. Entering from
  // below and exiting sideways reads as two unrelated elements.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onStart(() => {
          start.set(y.get());
        })
        .onUpdate((event) => {
          const next = start.get() + event.translationY;
          // Downward is free; dragging up past rest resists instead of stopping dead.
          y.set(next >= 0 ? next : next * 0.22);
        })
        .onEnd((event) => {
          // Where the finger would come to rest, so a quick flick is enough
          // and a slow long drag is not.
          const projected = y.get() + ((event.velocityY / 1000) * 0.998) / (1 - 0.998);
          if (projected > 70) {
            y.set(
              withTiming(220, { duration: 180, easing: ease.out }, (finished) => {
                if (finished) scheduleOnRN(onDismiss);
              }),
            );
          } else {
            y.set(withSpring(0, { ...spring, velocity: event.velocityY }));
            scheduleOnRN(tapLight);
          }
        }),
    [onDismiss, start, y],
  );

  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    // Outer view owns the entrance so the layout animation's transform does
    // not fight the gesture's transform on the same node.
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(300).easing(ease.out)}
      exiting={reduced ? undefined : FadeOutDown.duration(dur.exit).easing(ease.out)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: sp.lg,
        right: sp.lg,
        bottom: Math.max(insets.bottom, sp.md) + sp.md,
      }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={drag}>
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: sp.md,
              backgroundColor: c.surface,
              borderColor: c.line,
              borderWidth: 1,
              borderRadius: r.container,
              paddingVertical: sp.md,
              paddingLeft: sp.md,
              paddingRight: sp.sm,
              // Tinted to the surface rather than pure black, so it reads as
              // depth in dark mode instead of a smudge.
              shadowColor: c.bg,
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: r.pill,
                backgroundColor: bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={toast.icon} size={15} color={fg} />
            </View>
            <T v="label" style={{ flex: 1 }}>
              {toast.message}
            </T>
            <PressScale onPress={onDismiss} accessibilityLabel="Dismiss" style={{ padding: sp.sm }}>
              <Icon name="x" size={16} tone="faint" />
            </PressScale>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
