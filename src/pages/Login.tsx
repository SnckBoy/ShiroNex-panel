import React, { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, Server, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import axios from "axios";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import "./Login.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const {
    panelName,
    panelLogo,
    enableRegistration,
    enableGoogleLogin,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseStorageBucket,
    firebaseMessagingSenderId,
    firebaseAppId,
    reducedMotion,
  } = useSettings();
  const navigate = useNavigate();

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--pointer-x", `${x * 18}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${y * 18}px`);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError("Enter your username and password to continue.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.post(
        "/api/auth/login",
        { username: cleanUsername, password },
        { timeout: 15000 }
      );
      if (!response.data?.token || !response.data?.user) {
        throw new Error("The server returned an incomplete login response.");
      }
      login(response.data.token, response.data.user);
      navigate("/", { replace: true });
    } catch (err: any) {
      const message = err.code === "ECONNABORTED"
        ? "The panel took too long to respond. Check that the panel service is running."
        : err.response?.data?.error || err.message || "Login failed. Check your username and password.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!firebaseApiKey || !firebaseProjectId) {
      setError("Google Login is not configured by the panel administrator yet.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const firebaseConfig = {
        apiKey: firebaseApiKey,
        authDomain: firebaseAuthDomain,
        projectId: firebaseProjectId,
        storageBucket: firebaseStorageBucket,
        messagingSenderId: firebaseMessagingSenderId,
        appId: firebaseAppId,
      };
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const result = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
      const idToken = await result.user.getIdToken();
      const response = await axios.post("/api/auth/google", { idToken });
      login(response.data.token, response.data.user);
      navigate("/");
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("The Google Login window was closed before completion.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("This domain is not authorized in Firebase Console.");
      } else if (err.code === "auth/too-many-requests" || err.response?.status === 429) {
        setError("Too many login requests. Please wait a minute and try again.");
      } else {
        setError(err.response?.data?.error || err.message || "Google Authentication failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-shell" onMouseMove={handlePointerMove}>
      <div className="login-wallpaper" aria-hidden="true">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <div className="login-orb login-orb-three" />
        <div className="login-stars" />
        <div className="login-grid" />
        <div className="login-noise" />
      </div>

      <div className="login-layout">
        <section className="login-brand" aria-label={`${panelName} introduction`}>
          <div className="brand-kicker"><span className="brand-kicker-dot" /> SHIRONEX CONTROL PLANE</div>
          <div className="brand-heading">
            <div className="brand-logo">
              {panelLogo ? <img src={panelLogo} alt="" /> : <Server size={28} strokeWidth={1.8} />}
            </div>
            <div>
              <h1>{panelName}</h1>
              <p>Hosting infrastructure, beautifully controlled.</p>
            </div>
          </div>
          <p className="brand-copy">
            Orchestrate your game servers, nodes, backups, and deployments from one calm command center.
          </p>
          <div className="brand-highlights">
            <div><ShieldCheck size={17} /><span>Secure by default</span></div>
            <div><Sparkles size={17} /><span>Live fleet visibility</span></div>
            <div><Server size={17} /><span>Built for every node</span></div>
          </div>
          <div className="brand-footer"><span className="status-pulse" /> All systems operational</div>
        </section>

        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-card-glow" aria-hidden="true" />
          <div className="login-card-header">
            <div className="login-mobile-mark"><Server size={18} /></div>
            <span className="login-eyebrow">Welcome back</span>
            <h2 id="login-heading">Sign in to your panel</h2>
            <p>Enter your credentials to continue to {panelName}.</p>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <form onSubmit={handleLogin} className="login-form" noValidate aria-busy={isLoading}>
            <label className="login-field">
              <span>Username</span>
              <div className="login-input-wrap">
                <UserRound className="login-field-icon" size={18} />
                <input
                  type="text"
                  name="username"
                  required
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input-wrap">
                <LockKeyhole className="login-field-icon" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            <button type="submit" className="login-button" disabled={isLoading} aria-disabled={isLoading}>

              <span>{isLoading ? "Signing in…" : "Sign in"}</span>
              <span className="login-button-arrow">→</span>
            </button>
          </form>

          {enableGoogleLogin && firebaseApiKey && firebaseProjectId && (
            <>
              <div className="login-divider"><span>or continue with</span></div>
              <button type="button" className="google-button" onClick={handleGoogleLogin} disabled={isLoading}>
                <span className="google-mark" aria-hidden="true">G</span>
                <span>Continue with Google</span>
              </button>
            </>
          )}

          {enableRegistration !== false && (
            <p className="login-register">New to {panelName}? <Link to="/register">Create an account</Link></p>
          )}
          <p className="login-security-note"><Mail size={14} /> Your session is protected with secure authentication.</p>
        </section>
      </div>

    </main>
  );
}
