import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Eye, EyeSlash, CircleNotch } from "@phosphor-icons/react";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = isRegister
      ? await register(email, password, name)
      : await login(email, password);
    if (!result.success) setError(result.error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(https://images.pexels.com/photos/5480781/pexels-photo-5480781.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)` }}
      />
      <div className="absolute inset-0 bg-black/85" />

      {/* Login Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 animate-fade-in-up"
        data-testid="login-card"
      >
        <div className="backdrop-blur-xl bg-zinc-950/60 border border-white/10 rounded-sm p-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white rounded-sm flex items-center justify-center">
              <ShieldCheck size={24} weight="duotone" className="text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                Backup Monitor
              </h1>
              <p className="text-xs text-zinc-500 font-mono tracking-wider uppercase">
                Panou de Control
              </p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-white mb-1" style={{ fontFamily: 'Chivo, sans-serif' }}>
            {isRegister ? "Inregistrare" : "Autentificare"}
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            {isRegister ? "Creaza un cont nou" : "Conecteaza-te la panoul de monitorizare"}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-sm status-failed text-sm" data-testid="login-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Nume</Label>
                <Input
                  data-testid="register-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Numele tau"
                  className="mt-1.5 bg-black border-zinc-800 text-white focus:ring-1 focus:ring-white transition-all rounded-sm"
                  required
                />
              </div>
            )}
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Adresa de Email</Label>
              <Input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplu.ro"
                className="mt-1.5 bg-black border-zinc-800 text-white focus:ring-1 focus:ring-white transition-all rounded-sm"
                required
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola</Label>
              <div className="relative mt-1.5">
                <Input
                  data-testid="login-password-input"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-black border-zinc-800 text-white focus:ring-1 focus:ring-white transition-all rounded-sm pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                  data-testid="toggle-password-visibility"
                >
                  {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-white text-black font-semibold py-2.5 rounded-sm hover:bg-zinc-200 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <CircleNotch size={18} className="animate-spin" />}
              {isRegister ? "Creeaza Cont" : "Conectare"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              className="text-sm text-zinc-500 hover:text-white transition-colors"
              data-testid="toggle-auth-mode"
            >
              {isRegister ? "Ai deja un cont? Conecteaza-te" : "Nu ai cont? Inregistreaza-te"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
