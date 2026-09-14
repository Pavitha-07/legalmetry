import { useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { ShotType } from '../api';
import { tapLight, tapMedium } from '../haptics';
import { ease, r, sp, useTheme } from '../theme';
import { Button, IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { usePhotoEnter } from '../ui/Reveal';
import { Bleed } from '../ui/Screen';
import { PressScale, T } from '../ui/primitives';
import type { Asset } from './Capture';

const guide = {
  calibration: {
    badge: 'SHOT A',
    line: 'Fill the ring with the ten rupee coin, flat on the label and clear of any text.',
  },
  ocr: {
    badge: 'SHOT B',
    line: 'Same distance and zoom as shot A, with the coin out of frame.',
  },
} as const;

export function CameraShot({
  target,
  onSave,
  onClose,
}: {
  target: ShotType;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [taken, setTaken] = useState<Asset | null>(null);
  const entering = usePhotoEnter();

  // The camera's own shutter animation is switched off so the confirmation is
  // the same flash on every platform and matches the app's timing elsewhere.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  const snap = async () => {
    if (busy) return;
    try {
      setBusy(true);
      flash.set(
        withSequence(
          withTiming(0.9, { duration: 60, easing: ease.out }),
          withTiming(0, { duration: 240, easing: ease.out }),
        ),
      );
      tapMedium();
      const picture = await camera.current?.takePictureAsync({ quality: 1 });
      if (picture) {
        setTaken({ uri: picture.uri, fileName: `${target}.jpg`, mimeType: 'image/jpeg' });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <Bleed>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </Bleed>
    );
  }

  if (!permission.granted) {
    return <PermissionGate onRequest={requestPermission} onClose={onClose} />;
  }

  // Review before commit. The backend accepts exactly one photo per shot type
  // per panel, so a blurry frame is expensive to discover later.
  if (taken) {
    return (
      <Bleed>
        <Animated.View key={taken.uri} entering={entering} style={{ flex: 1 }}>
          <Image
            source={{ uri: taken.uri }}
            style={{ flex: 1 }}
            resizeMode="contain"
            accessibilityLabel="Photo just taken"
          />
        </Animated.View>
        <View
          style={{
            paddingHorizontal: sp.lg,
            paddingTop: sp.lg,
            paddingBottom: Math.max(insets.bottom, sp.lg),
            gap: sp.md,
            backgroundColor: '#000000',
          }}
        >
          <T v="label" color="rgba(255,255,255,0.66)" style={{ textAlign: 'center' }}>
            {target === 'calibration'
              ? 'Is the whole coin visible, in focus, and off the text?'
              : 'Is every declaration readable at this distance?'}
          </T>
          <View style={{ flexDirection: 'row', gap: sp.md }}>
            <Button
              label="Retake"
              icon="rotate-ccw"
              variant="secondary"
              onPress={() => setTaken(null)}
              style={{ flex: 1, borderColor: 'rgba(255,255,255,0.28)' }}
            />
            <View style={{ flex: 1 }}>
              <Button
                label="Use photo"
                icon="check"
                onPress={() => {
                  tapLight();
                  onSave(taken);
                }}
                full
              />
            </View>
          </View>
        </View>
      </Bleed>
    );
  }

  return (
    <Bleed>
      <CameraView
        ref={camera}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        facing="back"
        enableTorch={torch}
        animateShutter={false}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' },
          flashStyle,
        ]}
      />

      <View style={{ flex: 1, paddingTop: insets.top + sp.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: sp.md,
            gap: sp.sm,
          }}
        >
          <PressScale
            onPress={onClose}
            accessibilityLabel="Cancel"
            style={{
              width: 40,
              height: 40,
              borderRadius: r.pill,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={20} color="#FFFFFF" />
          </PressScale>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: 'rgba(0,0,0,0.45)',
                borderRadius: r.pill,
                paddingHorizontal: sp.md,
                paddingVertical: 5,
              }}
            >
              <T v="micro" color="#FFFFFF">
                {guide[target].badge}
              </T>
            </View>
          </View>

          <PressScale
            onPress={() => {
              setTorch((on) => !on);
              tapLight();
            }}
            accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            accessibilityState={{ selected: torch }}
            style={{
              width: 40,
              height: 40,
              borderRadius: r.pill,
              backgroundColor: torch ? '#FFFFFF' : 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="zap" size={19} color={torch ? '#16181D' : '#FFFFFF'} />
          </PressScale>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {target === 'calibration' ? <CoinReticle /> : <LabelFrame />}
        </View>

        <View
          style={{
            paddingHorizontal: sp.xl,
            paddingBottom: Math.max(insets.bottom, sp.lg) + sp.sm,
            gap: sp.xl,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: r.control,
              paddingHorizontal: sp.lg,
              paddingVertical: sp.md,
              maxWidth: 320,
            }}
          >
            <T v="label" color="#FFFFFF" style={{ textAlign: 'center' }}>
              {guide[target].line}
            </T>
          </View>

          <Shutter busy={busy} onPress={snap} />
        </View>
      </View>
    </Bleed>
  );
}

/**
 * Placement guide, not a measurement. Filling the ring puts the coin at a
 * working distance where its outline is large enough for the ellipse fit to
 * resolve tilt, which is where the millimetre scale comes from.
 */
function CoinReticle() {
  return (
    <View style={{ alignItems: 'center', gap: sp.md }} pointerEvents="none">
      <View
        style={{
          width: 132,
          height: 132,
          borderRadius: r.pill,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.92)',
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View
        style={{
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: r.pill,
          paddingHorizontal: sp.md,
          paddingVertical: 4,
        }}
      >
        <T v="monoMicro" color="#FFFFFF">
          10 RUPEE  ·  27 MM
        </T>
      </View>
    </View>
  );
}

/** Corner marks only. A full box over a label competes with the text. */
function LabelFrame() {
  const corner = {
    position: 'absolute' as const,
    width: 26,
    height: 26,
    borderColor: 'rgba(255,255,255,0.85)',
  };
  return (
    <View
      style={{ width: '78%', aspectRatio: 1.35, maxWidth: 340 }}
      pointerEvents="none"
    >
      <View style={[corner, { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 8 }]} />
      <View style={[corner, { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 8 }]} />
      <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 8 }]} />
      <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 8 }]} />
    </View>
  );
}

function Shutter({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <PressScale
      onPress={onPress}
      disabled={busy}
      accessibilityLabel="Take photo"
      style={{
        width: 74,
        height: 74,
        borderRadius: r.pill,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: r.pill,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy && <ActivityIndicator color="#16181D" />}
      </View>
    </PressScale>
  );
}

function PermissionGate({
  onRequest,
  onClose,
}: {
  onRequest: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingHorizontal: sp.xl,
        paddingTop: insets.top + sp.xl,
        paddingBottom: insets.bottom + sp.xl,
        justifyContent: 'center',
        gap: sp.lg,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: r.container,
          backgroundColor: c.accentFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="camera" size={22} tone="accent" />
      </View>
      <T v="title">Camera access is needed</T>
      <T v="body" tone="dim">
        Panel photos are the evidence behind every finding, so they are taken in the app rather
        than imported. You can still attach an existing photo from the gallery instead.
      </T>
      <View style={{ gap: sp.md, marginTop: sp.sm }}>
        <Button label="Allow camera" icon="camera" onPress={onRequest} full />
        <Button label="Back" variant="secondary" onPress={onClose} full />
      </View>
    </View>
  );
}
