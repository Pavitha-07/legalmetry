import { useCallback, useState } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {
  useFonts,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import { Italiana_400Regular } from '@expo-google-fonts/italiana';
import {
  defaultBaseUrl,
  type Inspection,
  type Session,
  type ShotType,
} from './src/api';
import { ThemeProvider, useTheme } from './src/theme';
import { SCREEN_IN, SCREEN_OUT } from './src/ui/Reveal';
import { ToastProvider } from './src/ui/Toast';
import { Analysis } from './src/screens/Analysis';
import { Capture, type Asset } from './src/screens/Capture';
import { CameraShot } from './src/screens/CameraShot';
import { ComplianceLookup } from './src/screens/ComplianceLookup';
import { Inspections } from './src/screens/Inspections';
import { Landing } from './src/screens/Landing';
import { Register } from './src/screens/Register';
import { Report } from './src/screens/Report';
import { SignIn } from './src/screens/SignIn';
import { Supervisor } from './src/screens/Supervisor';

/**
 * The marketing front door only makes sense where someone can land on it
 * cold, e.g. a browser bookmark. A phone install already knows what the app
 * is, so it skips straight to Sign In.
 */
const SIGNED_OUT_HOME: 'landing' | 'signIn' = Platform.OS === 'web' ? 'landing' : 'signIn';

// Dev-only noise: expo's fetch polyfill warns once per session that
// Response.blob() (used when downloading report PDFs) goes through React
// Native's base64 blob store and suggests installing `expo-blob`. That
// package is a genuinely new native module not guaranteed to be bundled in
// Expo Go, so pulling it in risks a real crash to silence a warning that
// already has zero effect on release builds or on the download itself.
LogBox.ignoreLogs(["Response.blob() is using React Native's Blob"]);

export default function App() {
  // Screen titles render in this serif everywhere, so the app waits for it
  // rather than flashing system-sans titles for a frame then swapping.
  // Italiana is landing-page-only (a free stand-in for the licensed "Brown
  // Casalova" reference) but is loaded here too so it's ready before the
  // web-only landing screen ever mounts.
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    Italiana_400Regular,
  });

  return (
    // Gestures do nothing at all, with no error, if this is missing.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>{fontsLoaded ? <Shell /> : <View style={{ flex: 1 }} />}</ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { c, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ToastProvider>
        <Router />
      </ToastProvider>
    </View>
  );
}

type Home = 'inspections' | 'supervisor';

type Route =
  | { name: 'landing' | 'signIn' | 'register' | 'compliance-lookup' | 'capture' | Home }
  | { name: 'analysis'; inspection: Inspection; back: Home }
  | { name: 'report'; inspection: Inspection; back: Home };

const emptyShots: Record<ShotType, Asset | null> = { calibration: null, ocr: null };

/**
 * Screens crossfade rather than slide.
 *
 * A hand-rolled slide competes with the platform's own back gesture and ends
 * up looking like a different app than the one the user swiped in. Opacity is
 * also the correct reduced-motion behaviour, so there is one path to maintain.
 *
 * The camera is layered over the capture screen instead of replacing it, so
 * the form the inspector already filled in survives taking a photo.
 */
function Router() {
  const [base, setBase] = useState(defaultBaseUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route>({ name: SIGNED_OUT_HOME });
  const [shots, setShots] = useState(emptyShots);
  const [cameraTarget, setCameraTarget] = useState<ShotType | null>(null);

  const setShot = useCallback((target: ShotType, asset: Asset | null) => {
    setShots((prev) => ({ ...prev, [target]: asset }));
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setShots(emptyShots);
    setCameraTarget(null);
    setRoute({ name: SIGNED_OUT_HOME });
  }, []);

  const screen = () => {
    if (!session) {
      if (route.name === 'register') {
        return (
          <Register
            base={base}
            onRegistered={() => setRoute({ name: 'signIn' })}
            onCancel={() => setRoute({ name: SIGNED_OUT_HOME })}
          />
        );
      }
      if (route.name === 'landing') {
        return (
          <Landing
            onSignIn={() => setRoute({ name: 'signIn' })}
            onCreateAccount={() => setRoute({ name: 'register' })}
            onCheckCompliance={() => setRoute({ name: 'compliance-lookup' })}
          />
        );
      }
      if (route.name === 'compliance-lookup') {
        return <ComplianceLookup onBack={() => setRoute({ name: SIGNED_OUT_HOME })} />;
      }
      return (
        <SignIn
          base={base}
          setBase={setBase}
          onCreateAccount={() => setRoute({ name: 'register' })}
          onSignedIn={(next) => {
            setSession(next);
            setRoute({ name: next.role === 'supervisor' ? 'supervisor' : 'inspections' });
          }}
        />
      );
    }

    switch (route.name) {
      case 'inspections':
        return (
          <Inspections
            base={base}
            session={session}
            onNew={() => {
              setShots(emptyShots);
              setRoute({ name: 'capture' });
            }}
            onOpen={(inspection) =>
              setRoute({ name: 'analysis', inspection, back: 'inspections' })
            }
            onSignOut={signOut}
          />
        );

      case 'capture':
        return (
          <Capture
            base={base}
            session={session}
            shots={shots}
            setShot={setShot}
            onOpenCamera={setCameraTarget}
            onCancel={() => setRoute({ name: 'inspections' })}
            onSubmitted={(inspection) => {
              setShots(emptyShots);
              setRoute({ name: 'analysis', inspection, back: 'inspections' });
            }}
          />
        );

      case 'supervisor':
        return (
          <Supervisor
            base={base}
            session={session}
            onOpen={(inspection) =>
              setRoute({ name: 'analysis', inspection, back: 'supervisor' })
            }
            onSignOut={signOut}
          />
        );

      case 'analysis':
        return (
          <Analysis
            base={base}
            session={session}
            inspection={route.inspection}
            onBack={() => setRoute({ name: route.back })}
            onViewReport={(inspection) => setRoute({ name: 'report', inspection, back: route.back })}
          />
        );

      case 'report':
        return (
          <Report
            base={base}
            session={session}
            inspection={route.inspection}
            onBack={(updated) => setRoute({ name: 'analysis', inspection: updated, back: route.back })}
          />
        );
    }
  };

  const key =
    route.name === 'analysis' || route.name === 'report' ? `${route.name}:${route.inspection.id}` : route.name;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        key={key}
        entering={SCREEN_IN}
        exiting={SCREEN_OUT}
        style={StyleSheet.absoluteFill}
      >
        {screen()}
      </Animated.View>

      {!!cameraTarget && (
        <Animated.View
          entering={SCREEN_IN}
          exiting={SCREEN_OUT}
          style={StyleSheet.absoluteFill}
        >
          <CameraShot
            target={cameraTarget}
            onClose={() => setCameraTarget(null)}
            onSave={(asset) => {
              setShot(cameraTarget, asset);
              setCameraTarget(null);
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}
