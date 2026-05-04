import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { changeOwnPassword } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, User as UserIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function AccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.current_password || !form.new_password) {
      toast.error("Completati toate campurile");
      return;
    }
    if (form.new_password.length < 6) {
      toast.error("Parola noua trebuie sa aiba minim 6 caractere");
      return;
    }
    if (form.new_password !== form.confirm_password) {
      toast.error("Parolele noi nu coincid");
      return;
    }
    setSaving(true);
    try {
      await changeOwnPassword(form.current_password, form.new_password);
      toast.success("Parola a fost schimbata cu succes");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      const msg = err.response?.data?.detail || "Eroare la schimbarea parolei";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl" data-testid="account-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
          Contul Meu
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Gestioneaza informatiile contului si parola</p>
      </div>

      <Card className="border-zinc-800 bg-zinc-950 rounded-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-base" style={{ fontFamily: 'Chivo, sans-serif' }}>
            <UserIcon size={18} weight="duotone" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-zinc-800 pb-2">
            <span className="text-zinc-500 font-mono text-xs uppercase tracking-wider">Nume</span>
            <span className="text-white">{user?.name || "-"}</span>
          </div>
          <div className="flex justify-between border-b border-zinc-800 pb-2">
            <span className="text-zinc-500 font-mono text-xs uppercase tracking-wider">Email</span>
            <span className="text-white font-mono">{user?.email}</span>
          </div>
          <div className="flex justify-between pb-2">
            <span className="text-zinc-500 font-mono text-xs uppercase tracking-wider">Rol</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
              user?.role === "admin"
                ? "bg-white/10 text-white border border-white/20"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}>
              {user?.role === "admin" ? "ADMINISTRATOR" : "UTILIZATOR LIMITAT"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-950 rounded-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-base" style={{ fontFamily: 'Chivo, sans-serif' }}>
            <Key size={18} weight="duotone" />
            Schimba Parola
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola Curenta</Label>
              <Input
                type="password"
                value={form.current_password}
                onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                data-testid="current-password-input"
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola Noua</Label>
              <Input
                type="password"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                data-testid="new-password-input"
                autoComplete="new-password"
              />
              <p className="text-[10px] text-zinc-600 mt-1 font-mono">Minim 6 caractere</p>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Confirma Parola Noua</Label>
              <Input
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                data-testid="confirm-password-input"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
              data-testid="change-password-btn"
            >
              {saving ? "Se salveaza..." : "Schimba Parola"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
