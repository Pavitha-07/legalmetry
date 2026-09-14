/**
 * Haptics are never the only feedback in this app; every call here sits beside
 * a visual change. Web support depends on the Vibration API and is absent on
 * desktop, so calls are skipped there rather than throwing into the console.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

const safe = (run: () => Promise<void>) => {
  if (!enabled) return;
  run().catch(() => {});
};

/** A value ticked past a step: panel tile, filter segment, theme switch. */
export const tapSelection = () => safe(() => Haptics.selectionAsync());

/** Something snapped home or a drag committed. */
export const tapLight = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** A heavy commit: the shutter firing. */
export const tapMedium = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const notifySuccess = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const notifyError = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
