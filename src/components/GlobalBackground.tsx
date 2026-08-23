import { useSettings } from "../context/SettingsContext";

export function GlobalBackground() {
  const { panelBackgroundImage, panelBackgroundBlur, backgroundEffect = "aurora", reducedMotion = false } = useSettings();
  const effect = backgroundEffect || "aurora";

  return (
    <div
      aria-hidden="true"
      className={`global-live-wallpaper effect-${effect} ${reducedMotion ? "is-reduced" : ""}`}
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
    </div>
  );
}
