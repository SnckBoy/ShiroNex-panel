import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const VALID_APPEARANCES = new Set(["dark", "light", "system"]);
const VALID_THEMES = new Set(["aurora", "midnight", "nebula", "cyber", "royal-purple", "ocean", "emerald", "crimson"]);
const VALID_ACCENTS = new Set(["purple", "indigo", "blue", "cyan", "emerald", "pink", "red"]);
const VALID_BACKGROUND_EFFECTS = new Set(["none", "aurora", "animated-gradient", "grid", "nebula", "starfield"]);

const safeChoice = (value: unknown, allowed: Set<string>, fallback: string) =>
  typeof value === "string" && allowed.has(value) ? value : fallback;

const getSystemAppearance = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

export const SettingsContext = createContext<any>(null);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [panelName, setPanelName] = useState<string>("ShiroNex");
  const [panelLogo, setPanelLogo] = useState<string>("");
  const [panelBackgroundImage, setPanelBackgroundImage] = useState<string>("");
  const [panelBackgroundBlur, setPanelBackgroundBlur] = useState<number>(10);
  const [enablePlayit, setEnablePlayit] = useState<boolean>(false);
  const [enableTutorial, setEnableTutorial] = useState<boolean>(true);
  const [enableLoginAnimation, setEnableLoginAnimation] = useState<boolean>(true);
  const [enableRegistration, setEnableRegistration] = useState<boolean>(true);
  const [theme, setTheme] = useState<string>("aurora");
  const [appearance, setAppearance] = useState<string>("dark");
  const [accent, setAccent] = useState<string>("purple");
  const [backgroundEffect, setBackgroundEffect] = useState<string>("aurora");
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [enableGoogleLogin, setEnableGoogleLogin] = useState<boolean>(false);
  const [firebaseApiKey, setFirebaseApiKey] = useState<string>("");
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState<string>("");
  const [firebaseProjectId, setFirebaseProjectId] = useState<string>("");
  const [firebaseStorageBucket, setFirebaseStorageBucket] = useState<string>("");
  const [firebaseMessagingSenderId, setFirebaseMessagingSenderId] = useState<string>("");
  const [firebaseAppId, setFirebaseAppId] = useState<string>("");

  const applyVisualSettings = () => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const resolvedAppearance = appearance === "system" ? getSystemAppearance() : safeChoice(appearance, VALID_APPEARANCES, "dark");
    const resolvedTheme = safeChoice(theme, VALID_THEMES, "aurora");
    const resolvedAccent = safeChoice(accent, VALID_ACCENTS, "purple");
    const resolvedBackground = safeChoice(backgroundEffect, VALID_BACKGROUND_EFFECTS, "aurora");

    root.dataset.theme = resolvedAppearance;
    root.dataset.themePreset = resolvedTheme;
    root.dataset.appearance = resolvedAppearance;
    root.dataset.accent = resolvedAccent;
    root.dataset.backgroundEffect = resolvedBackground;
    root.classList.toggle("reduce-motion", reducedMotion);
    root.style.setProperty("--accent-color", `var(--accent-${resolvedAccent})`);
    root.style.colorScheme = resolvedAppearance === "light" ? "light" : "dark";
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get("/api/settings");
      const settings = res.data || {};
      if (settings.panelName) setPanelName(settings.panelName);
      if (settings.panelLogo !== undefined) setPanelLogo(settings.panelLogo);
      if (settings.panelBackgroundImage !== undefined) setPanelBackgroundImage(settings.panelBackgroundImage);
      if (settings.panelBackgroundBlur !== undefined) setPanelBackgroundBlur(Number(settings.panelBackgroundBlur) || 0);
      if (settings.enablePlayit !== undefined) setEnablePlayit(Boolean(settings.enablePlayit));
      if (settings.enableTutorial !== undefined) setEnableTutorial(Boolean(settings.enableTutorial));
      if (settings.enableLoginAnimation !== undefined) setEnableLoginAnimation(Boolean(settings.enableLoginAnimation));
      if (settings.enableRegistration !== undefined) setEnableRegistration(Boolean(settings.enableRegistration));
      if (settings.theme !== undefined) setTheme(safeChoice(String(settings.theme), VALID_THEMES, "aurora"));
      if (settings.appearance !== undefined) setAppearance(safeChoice(settings.appearance, VALID_APPEARANCES, "dark"));
      if (settings.accent !== undefined) setAccent(safeChoice(settings.accent, VALID_ACCENTS, "purple"));
      if (settings.backgroundEffect !== undefined) setBackgroundEffect(safeChoice(settings.backgroundEffect, VALID_BACKGROUND_EFFECTS, "aurora"));
      if (settings.reducedMotion !== undefined) setReducedMotion(Boolean(settings.reducedMotion));
      if (settings.enableGoogleLogin !== undefined) setEnableGoogleLogin(Boolean(settings.enableGoogleLogin));
      if (settings.firebaseApiKey !== undefined) setFirebaseApiKey(settings.firebaseApiKey);
      if (settings.firebaseAuthDomain !== undefined) setFirebaseAuthDomain(settings.firebaseAuthDomain);
      if (settings.firebaseProjectId !== undefined) setFirebaseProjectId(settings.firebaseProjectId);
      if (settings.firebaseStorageBucket !== undefined) setFirebaseStorageBucket(settings.firebaseStorageBucket);
      if (settings.firebaseMessagingSenderId !== undefined) setFirebaseMessagingSenderId(settings.firebaseMessagingSenderId);
      if (settings.firebaseAppId !== undefined) setFirebaseAppId(settings.firebaseAppId);
    } catch (error) {
      // The UI keeps safe defaults if the public settings endpoint is unavailable.
      console.warn("Unable to load ShiroNex settings", error);
    }
  };

  useEffect(() => {
    fetchSettings();

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    const handleSystemTheme = () => {
      if (appearance === "system") applyVisualSettings();
    };
    mediaQuery?.addEventListener?.("change", handleSystemTheme);

    const token = localStorage.getItem("token");
    if (!token) {
      return () => mediaQuery?.removeEventListener?.("change", handleSystemTheme);
    }

    const socket = io({ auth: { token } });
    socket.on("settings_updated", fetchSettings);
    return () => {
      socket.disconnect();
      mediaQuery?.removeEventListener?.("change", handleSystemTheme);
    };
  }, []);

  useEffect(() => {
    applyVisualSettings();
  }, [theme, appearance, accent, backgroundEffect, reducedMotion]);

  useEffect(() => {
    if (panelName) document.title = panelName;
  }, [panelName]);

  const value = useMemo(() => ({
    panelName, setPanelName,
    panelLogo, setPanelLogo,
    panelBackgroundImage, setPanelBackgroundImage,
    panelBackgroundBlur, setPanelBackgroundBlur,
    enablePlayit, setEnablePlayit,
    enableTutorial, setEnableTutorial,
    enableLoginAnimation, setEnableLoginAnimation,
    enableRegistration, setEnableRegistration,
    theme, setTheme,
    appearance, setAppearance,
    accent, setAccent,
    backgroundEffect, setBackgroundEffect,
    reducedMotion, setReducedMotion,
    enableGoogleLogin, setEnableGoogleLogin,
    firebaseApiKey, setFirebaseApiKey,
    firebaseAuthDomain, setFirebaseAuthDomain,
    firebaseProjectId, setFirebaseProjectId,
    firebaseStorageBucket, setFirebaseStorageBucket,
    firebaseMessagingSenderId, setFirebaseMessagingSenderId,
    firebaseAppId, setFirebaseAppId,
    fetchSettings,
  }), [
    panelName, panelLogo, panelBackgroundImage, panelBackgroundBlur,
    enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration,
    theme, appearance, accent, backgroundEffect, reducedMotion,
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => useContext(SettingsContext);
