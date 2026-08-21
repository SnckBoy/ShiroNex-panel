import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";

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
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("shironex-theme") || "midnight");
  const [appearance, setAppearance] = useState<string>(() => localStorage.getItem("shironex-appearance") || "dark");
  const [accent, setAccent] = useState<string>(() => localStorage.getItem("shironex-accent") || "purple");
  const [backgroundEffect, setBackgroundEffect] = useState<string>(() => localStorage.getItem("shironex-background-effect") || "aurora");
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || localStorage.getItem("shironex-motion") === "off");
  const [enableGoogleLogin, setEnableGoogleLogin] = useState<boolean>(false);
  const [firebaseApiKey, setFirebaseApiKey] = useState<string>("");
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState<string>("");
  const [firebaseProjectId, setFirebaseProjectId] = useState<string>("");
  const [firebaseStorageBucket, setFirebaseStorageBucket] = useState<string>("");
  const [firebaseMessagingSenderId, setFirebaseMessagingSenderId] = useState<string>("");
  const [firebaseAppId, setFirebaseAppId] = useState<string>("");

  const fetchSettings = async () => {
    try {
      const res = await axios.get("/api/settings");
      if (res.data.panelName) setPanelName(res.data.panelName);
      if (res.data.panelLogo !== undefined) setPanelLogo(res.data.panelLogo);
      if (res.data.panelBackgroundImage !== undefined) setPanelBackgroundImage(res.data.panelBackgroundImage);
      if (res.data.panelBackgroundBlur !== undefined) setPanelBackgroundBlur(res.data.panelBackgroundBlur);
      if (res.data.enablePlayit !== undefined) setEnablePlayit(res.data.enablePlayit);
      if (res.data.enableTutorial !== undefined) setEnableTutorial(res.data.enableTutorial);
      if (res.data.enableLoginAnimation !== undefined) setEnableLoginAnimation(res.data.enableLoginAnimation);
      if (res.data.enableRegistration !== undefined) setEnableRegistration(res.data.enableRegistration);
      if (res.data.enableGoogleLogin !== undefined) setEnableGoogleLogin(res.data.enableGoogleLogin);
      if (res.data.firebaseApiKey !== undefined) setFirebaseApiKey(res.data.firebaseApiKey);
      if (res.data.firebaseAuthDomain !== undefined) setFirebaseAuthDomain(res.data.firebaseAuthDomain);
      if (res.data.firebaseProjectId !== undefined) setFirebaseProjectId(res.data.firebaseProjectId);
      if (res.data.firebaseStorageBucket !== undefined) setFirebaseStorageBucket(res.data.firebaseStorageBucket);
      if (res.data.firebaseMessagingSenderId !== undefined) setFirebaseMessagingSenderId(res.data.firebaseMessagingSenderId);
      if (res.data.firebaseAppId !== undefined) setFirebaseAppId(res.data.firebaseAppId);
      if (res.data.theme !== undefined) setTheme(String(res.data.theme));
      if (res.data.appearance !== undefined) setAppearance(String(res.data.appearance));
      if (res.data.accent !== undefined) setAccent(String(res.data.accent));
      if (res.data.backgroundEffect !== undefined) setBackgroundEffect(String(res.data.backgroundEffect));
      if (res.data.reducedMotion !== undefined) setReducedMotion(Boolean(res.data.reducedMotion));
    } catch (e) {
      console.warn("Unable to load panel settings", e);
    }
  };

  useEffect(() => {
    fetchSettings();
    const token = localStorage.getItem("token");
    if (!token) return;
    const socket = io({ auth: { token } });
    socket.on("settings_updated", () => {
      fetchSettings();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (panelName) {
      document.title = panelName;
    }
  }, [panelName]);
  
  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    const resolvedAppearance = appearance === "system" ? (systemDark ? "dark" : "light") : appearance;
    const preset = theme.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "midnight";
    const accents: Record<string, string> = { purple: "#a855f7", indigo: "#6366f1", blue: "#3b82f6", cyan: "#06b6d4", emerald: "#10b981", pink: "#ec4899", red: "#ef4444" };
    root.setAttribute("data-theme", preset);
    root.setAttribute("data-appearance", resolvedAppearance);
    root.setAttribute("data-accent", accent);
    root.setAttribute("data-background-effect", backgroundEffect);
    root.style.setProperty("--accent-color", accents[accent] || accents.purple);
    root.classList.toggle("reduce-motion", reducedMotion || resolvedAppearance === "reduce-motion");
    localStorage.setItem("shironex-theme", theme);
    localStorage.setItem("shironex-appearance", appearance);
    localStorage.setItem("shironex-accent", accent);
    localStorage.setItem("shironex-background-effect", backgroundEffect);
    localStorage.setItem("shironex-motion", reducedMotion ? "off" : "on");
  }, [theme, appearance, accent, backgroundEffect, reducedMotion]);

  return (
    <SettingsContext.Provider value={{ 
      panelName, setPanelName, 
      panelLogo, setPanelLogo, 
      panelBackgroundImage, setPanelBackgroundImage, 
      panelBackgroundBlur, setPanelBackgroundBlur, 
      enablePlayit, setEnablePlayit, 
      enableTutorial, setEnableTutorial,
      enableLoginAnimation, setEnableLoginAnimation,
      enableRegistration, setEnableRegistration,
      theme, setTheme, appearance, setAppearance, accent, setAccent, backgroundEffect, setBackgroundEffect, reducedMotion, setReducedMotion,
      enableGoogleLogin, setEnableGoogleLogin,
      firebaseApiKey, setFirebaseApiKey,
      firebaseAuthDomain, setFirebaseAuthDomain,
      firebaseProjectId, setFirebaseProjectId,
      firebaseStorageBucket, setFirebaseStorageBucket,
      firebaseMessagingSenderId, setFirebaseMessagingSenderId,
      firebaseAppId, setFirebaseAppId,
      fetchSettings 
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
