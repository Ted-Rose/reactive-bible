import {
  AppShell,
  MantineProvider,
  ColorSchemeProvider,
  ColorScheme,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { useLocalStorage, useWindowEvent } from "@mantine/hooks";
import BibleSelector from "./components/BibleSelector";
import MyHeader from "./components/MyHeader";
import MainMenu from "./components/MainMenu";
import BottomNav from "./components/BottomNav";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppRoutes } from "./routes";
import { clearExpiredAudioUrls } from "./utils/cacheManager";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAuthStore } from "./stores/authStore";
import { ErrorBoundary } from "./components/ErrorBoundary";
import VerseActionToolbar from "./components/VerseActionToolbar";
import { useBibleStore } from "./store";

export default function App() {
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  const toggleColorScheme = () =>
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));
  
  // BibleSelector state
  const [bibleSelectorOpened, setBibleSelectorOpened] = useState(false);
  
  // MainMenu state
  const [mainMenuOpened, setMainMenuOpened] = useState(false);
  
  const navigate = useNavigate();

  // Check authentication on app load
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  useEffect(() => {
    // Check if user is authenticated from localStorage
    checkAuth();
    // Clean up expired audio URLs
    clearExpiredAudioUrls();
  }, [checkAuth]);

  useEffect(() => {
    const prefetchReadingPositions = useBibleStore.getState()
      .prefetchReadingPositions;
    
    if (isAuthenticated) {
      prefetchReadingPositions();
    }
  }, [isAuthenticated]);
  
  // Check if we're on an auth page (login/register)
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' ||
                     location.pathname === '/register';
  const isSearchPage = location.pathname === '/search';
  const isBibleView = location.pathname.startsWith('/bible');
  useWindowEvent("keydown", (event) => {
    const tag = (event.target as HTMLElement).tagName;
    if (
      event.key === "/" &&
      tag !== "INPUT" &&
      tag !== "TEXTAREA"
    ) {
      event.preventDefault();
      navigate("/search");
    }
  });
  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
    >
      <MantineProvider
        theme={{ colorScheme }}
        withGlobalStyles
        withNormalizeCSS
      >
        <ModalsProvider>
        <Notifications position="top-right" zIndex={2077} />
        <AppShell
          padding={0}
          navbar={
            isBibleView ? (
              <BibleSelector
                opened={bibleSelectorOpened}
                setOpened={setBibleSelectorOpened}
              />
            ) : undefined
          }
          header={
            <MyHeader
              menuOpened={mainMenuOpened}
              setMenuOpened={setMainMenuOpened}
            />
          }
          footer={
            isBibleView ? (
              <BottomNav setBibleSelectorOpened={setBibleSelectorOpened} />
            ) : undefined
          }
          styles={(theme) => ({
            main: {
              backgroundColor:
                theme.colorScheme === "dark"
                  ? theme.colors.dark[8]
                  : theme.colors.gray[0],
              height: "100vh",
              // Allow scrolling on auth and search pages
              overflow: (isAuthPage || isSearchPage) ? "auto" : "hidden",
            },
          })}
        >
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
          {isBibleView && <VerseActionToolbar />}
          <MainMenu
            opened={mainMenuOpened}
            onClose={() => setMainMenuOpened(false)}
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          />
        </AppShell>
        <Analytics />
        <SpeedInsights />
        </ModalsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
