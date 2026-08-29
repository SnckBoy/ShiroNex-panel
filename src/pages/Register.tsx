import React, { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, Server, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useSettings } from "../context/SettingsContext";
import "./Login.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { panelName, panelLogo, enableRegistration } = useSettings();
  const navigate = useNavigate();

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanUsername = username.trim();
    if (enableRegistration === false) {
      setError("User registration is currently disabled by the panel administrator.");
      return;
    }
    if (!cleanUsername || !password) {
      setError("Enter a username and password to continue.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    try {
      await axios.post("/api/auth/register", { username: cleanUsername, password, confirmPassword }, { timeout: 15000 });
      setSuccess("Account created successfully. Redirecting to sign in…");
      window.setTimeout(() => navigate("/login", { replace: true }), 1100);
    } catch (err: any) {
      setError(err.code === "ECONNABORTED" ? "The panel took too long to respond. Check that the service is running." : err.response?.data?.error || "Registration failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--pointer-x", `${x * 12}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${y * 12}px`);
  };

  return (
    <main className="login-shell register-shell" onMouseMove={handlePointerMove}>
      <div className="login-wallpaper" aria-hidden="true">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <div className="login-orb login-orb-three" />
        <div className="login-stars" />
        <div className="login-grid" />
        <div className="login-noise" />
      </div>

      <div className="login-layout register-layout">
        <section className="login-brand" aria-label={`${panelName} introduction`}>
          <div className="brand-kicker"><span className="brand-kicker-dot" /> SNCK CONTROL PLANE</div>
          <div className="brand-heading">
            <div className="brand-logo">
              {panelLogo ? <img src={panelLogo} alt="" /> : <Server size={28} strokeWidth={1.8} />}
            </div>
            <div>
              <h1>{panelName}</h1>
              <p>Hosting infrastructure, beautifully controlled.</p>
            </div>
          </div>
          <p className="brand-copy">Create your operator account and bring game servers, nodes, backups, and deployments into one calm command center.</p>
          <div className="brand-highlights">
            <div><ShieldCheck size={17} /><span>Secure by default</span></div>
            <div><Sparkles size={17} /><span>Fast fleet visibility</span></div>
            <div><Server size={17} /><span>Ready for every node</span></div>
          </div>
          <div className="brand-footer"><span className="status-pulse" /> Build your control plane</div>
        </section>

        <section className="login-card register-card" aria-labelledby="register-heading">
          <div className="login-card-glow" aria-hidden="true" />
          <div className="login-card-header">
            <div className="login-mobile-mark"><Server size={18} /></div>
            <span className="login-eyebrow">Create your access</span>
            <h2 id="register-heading">Create an account</h2>
            <p>Set up a secure account to start managing your infrastructure.</p>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}
          {success && <div className="login-success" role="status">{success}</div>}

          <form onSubmit={handleRegister} className="login-form" noValidate aria-busy={isLoading}>
            <label className="login-field">
              <span>Username</span>
              <div className="login-input-wrap">
                <UserRound className="login-field-icon" size={18} />
                <input type="text" name="username" required autoComplete="username" placeholder="Choose a username" value={username} onChange={(event) => setUsername(event.target.value)} />
              </div>
            </label>

            <label className="login-field">
              <span>Email <em>(optional)</em></span>
              <div className="login-input-wrap">
                <Mail className="login-field-icon" size={18} />
                <input type="email" name="email" autoComplete="email" placeholder="you@example.com" disabled aria-disabled="true" />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input-wrap">
                <LockKeyhole className="login-field-icon" size={18} />
                <input type={showPassword ? "text" : "password"} name="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>

            <label className="login-field">
              <span>Confirm password</span>
              <div className="login-input-wrap">
                <LockKeyhole className="login-field-icon" size={18} />
                <input type={showConfirmPassword ? "text" : "password"} name="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="Repeat your password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>

            <button type="submit" className="login-button" disabled={isLoading || !!success || enableRegistration === false} aria-disabled={isLoading || !!success || enableRegistration === false}>
              <span>{isLoading ? "Creating account…" : "Create account"}</span>
              <span className="login-button-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          <p className="login-register">Already have an account? <Link to="/login">Sign in</Link></p>
          <p className="login-security-note"><ShieldCheck size={14} /> Passwords are securely protected.</p>
        </section>
      </div>
    </main>
  );
}
