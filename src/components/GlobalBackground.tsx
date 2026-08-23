import { useLocation } from "react-router-dom";
import { useSettings } from "../context/SettingsContext";

function getCoreView(pathname: string) {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname === "/login" || pathname === "/register" || pathname === "/setup") return "auth";
  if (pathname === "/servers" || pathname === "/servers/") return "servers";
  if (pathname.startsWith("/servers/") && pathname.includes("/console")) return "console";
  if (pathname.startsWith("/servers/")) return "server";
  return "quiet";
}

export function GlobalBackground() {
  const { pathname } = useLocation();
  const { panelBackgroundImage, panelBackgroundBlur, backgroundEffect = "aurora", reducedMotion = false } = useSettings();
  const effect = backgroundEffect || "aurora";
  const coreView = getCoreView(pathname);

  return (
    <div
      aria-hidden="true"
      className={`global-live-wallpaper effect-${effect} core-view-${coreView} ${reducedMotion ? "is-reduced" : ""}`}
    >
      {panelBackgroundImage && (
        <div
          className="wallpaper-image"
          style={{
            backgroundImage: `url("${panelBackgroundImage}")`,
            filter: `blur(${Number(panelBackgroundBlur) || 0}px)`,
          }}
        />
      )}
      <div className="wallpaper-orb wallpaper-orb-one" />
      <div className="wallpaper-orb wallpaper-orb-two" />
      <div className="wallpaper-orb wallpaper-orb-three" />
      <div className="wallpaper-grid" />
      <div className="wallpaper-stars" />
      <div className="wallpaper-noise" />
      <div className="wallpaper-vignette" />
      <div className="core-space" data-core-space="ambient">
        <div className="core-space__fog" />
        <div className="core-space__floor" />
        <div className="core-space__particles" />
        <div className="core-space__echo" aria-hidden="true">
          <span className="core-space__block core-space__block--one" />
          <span className="core-space__block core-space__block--two" />
          <span className="core-space__block core-space__block--three" />
        </div>
      </div>
    </div>
  );
}
