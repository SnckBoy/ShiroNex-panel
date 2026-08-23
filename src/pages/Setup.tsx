import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, Server, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

const MIN_PASSWORD_LENGTH = 8;

const passwordIsStrong = (value: string) =>
  value.length >= MIN_PASSWORD_LENGTH && value.length <= 256;

export default function Setup() {
  const navigate = useNavigate();
  const { panelName, panelLogo } = useSettings();
  const { setupRequired, refreshSetupStatus, markSetupComplete } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshSetupStatus().then((required: boolean) => {
      if (!active) return;
      if (!required) {
        navigate("/login", { replace: true });
        return;
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [navigate, refreshSetupStatus]);

  useEffect(() => {
    if (setupRequired === false && !submitting) navigate("/login", { replace: true });
  }, [navigate, setupRequired, submitting]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username.trim())) {
      setError("Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!passwordIsStrong(password)) {
      setError(`Password must be ${MIN_PASSWORD_LENGTH}-256 characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post("/api/auth/setup", {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
      });
      markSetupComplete();
      setSuccess("Owner account created securely. Redirecting to login...");
      window.setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (requestError: any) {
      const responseError = requestError.response?.data;
      setError(responseError?.error || "Owner setup could not be completed.");
      if (responseError?.setupRequired === false || requestError.response?.status === 409) {
        markSetupComplete();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-background text-foreground">Checking setup status...</div>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden lg:flex relative overflow-hidden bg-card border-r border-border items-center justify-center p-16">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-transparent to-cyan-400/10" />
        <div className="relative z-10 max-w-xl">
          <div className="flex items-center gap-3 mb-10">
            {panelLogo ? <img src={panelLogo} alt="Panel logo" className="w-12 h-12 rounded-2xl object-cover" /> : <div className="w-12 h-12 rounded-2xl bg-indigo-600 grid place-items-center"><Server /></div>}
            <span className="text-2xl font-bold">{panelName}</span>
          </div>
          <p className="text-sm uppercase tracking-[0.3em] text-indigo-300 mb-4">Secure first-run setup</p>
          <h1 className="text-5xl font-bold leading-tight mb-6">Create the account that controls your infrastructure.</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">The first account is created once, receives the Owner role, and becomes the root of your ShiroNex permission hierarchy.</p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="flex items-center gap-3 lg:hidden mb-8"><div className="w-10 h-10 rounded-xl bg-indigo-600 grid place-items-center"><Server size={19} /></div><span className="text-xl font-bold">{panelName}</span></div>
            <p className="text-sm font-medium text-indigo-400 mb-2">Welcome to ShiroNex</p>
            <h2 className="text-3xl font-bold mb-2">Create ShiroNex Owner Account</h2>
            <p className="text-muted-foreground">This protected setup is available only while no user exists.</p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            {success && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}

            <label className="block space-y-2"><span className="text-sm font-medium">Username</span><span className="relative block"><UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 outline-none focus:border-indigo-500" placeholder="owner" /></span></label>
            <label className="block space-y-2"><span className="text-sm font-medium">Email</span><span className="relative block"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 outline-none focus:border-indigo-500" placeholder="owner@example.com" /></span></label>
            <label className="block space-y-2"><span className="text-sm font-medium">Password</span><span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 outline-none focus:border-indigo-500" placeholder="At least 8 characters" /></span></label>
            <label className="block space-y-2"><span className="text-sm font-medium">Confirm password</span><span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 outline-none focus:border-indigo-500" placeholder="Repeat your password" /></span></label>

            <p className="text-xs leading-relaxed text-muted-foreground">Use at least 8 characters. ShiroNex never creates or displays a default password.</p>
            <button type="submit" disabled={submitting || Boolean(success)} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><span className="inline-flex items-center gap-2">{submitting ? "Creating Owner account..." : "Create Owner account"}{!submitting && <ArrowRight size={18} />}</span></button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">Already completed setup? <Link to="/login" className="text-indigo-400 underline">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
