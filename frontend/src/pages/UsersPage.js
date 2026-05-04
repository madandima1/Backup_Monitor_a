import React, { useState, useEffect, useCallback } from "react";
import { getUsers, createUser, updateUser, deleteUser, getCompanies, adminResetUserPassword } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PencilSimple, Trash, UsersThree, ShieldCheck, User as UserIcon, Key } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "user", allowed_companies: [] });
  const [saving, setSaving] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ new_password: "", confirm_password: "" });
  const [resetting, setResetting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([getUsers(), getCompanies()]);
      setUsers(u);
      setCompanies(c);
    } catch {
      toast.error("Eroare la incarcarea utilizatorilor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ email: "", password: "", name: "", role: "user", allowed_companies: [] });
    setDialogOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      email: u.email,
      password: "",
      name: u.name || "",
      role: u.role || "user",
      allowed_companies: u.allowed_companies || []
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingUser && (!form.email.trim() || !form.password)) {
      toast.error("Email si parola sunt obligatorii");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Numele este obligatoriu");
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, { name: form.name, role: form.role, allowed_companies: form.allowed_companies });
        toast.success("Utilizator actualizat");
      } else {
        await createUser(form);
        toast.success("Utilizator creat");
      }
      setDialogOpen(false);
      loadData();
    } catch (e) {
      const msg = e.response?.data?.detail || "Eroare la salvare";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      await deleteUser(deletingUser.id);
      toast.success("Utilizator sters");
      setDeleteDialogOpen(false);
      setDeletingUser(null);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la stergere");
    }
  };

  const openResetPassword = (u) => {
    setResetTarget(u);
    setResetForm({ new_password: "", confirm_password: "" });
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (!resetForm.new_password || resetForm.new_password.length < 6) {
      toast.error("Parola trebuie sa aiba minim 6 caractere");
      return;
    }
    if (resetForm.new_password !== resetForm.confirm_password) {
      toast.error("Parolele nu coincid");
      return;
    }
    setResetting(true);
    try {
      await adminResetUserPassword(resetTarget.id, resetForm.new_password);
      toast.success(`Parola pentru ${resetTarget.name || resetTarget.email} a fost resetata`);
      setResetDialogOpen(false);
      setResetTarget(null);
    } catch (e) {
      const msg = e.response?.data?.detail || "Eroare la resetarea parolei";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setResetting(false);
    }
  };

  const toggleCompany = (companyId) => {
    setForm((prev) => ({
      ...prev,
      allowed_companies: prev.allowed_companies.includes(companyId)
        ? prev.allowed_companies.filter((c) => c !== companyId)
        : [...prev.allowed_companies, companyId]
    }));
  };

  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || id;

  if (currentUser?.role !== "admin") {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <ShieldCheck size={40} weight="duotone" className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500">Acces permis doar administratorilor</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Utilizatori
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Gestioneaza utilizatorii si accesul la companii</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm"
          data-testid="add-user-btn"
        >
          <Plus size={16} weight="bold" />
          Adauga Utilizator
        </button>
      </div>

      <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="users-table-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider pl-4">Utilizator</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Rol</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Companii Permise</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider text-right pr-4">Actiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="text-center py-12">
                    <UsersThree size={32} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                    <p className="text-zinc-600 text-sm">Nu exista utilizatori</p>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-sm flex items-center justify-center text-xs font-mono ${
                          u.role === "admin" ? "bg-white text-black" : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {u.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <span className="text-white text-sm">{u.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{u.email}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
                        u.role === "admin"
                          ? "bg-white/10 text-white border border-white/20"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}>
                        {u.role === "admin" ? "ADMIN" : "UTILIZATOR"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-xs text-zinc-500">Toate companiile</span>
                      ) : (u.allowed_companies?.length || 0) === 0 ? (
                        <span className="text-xs text-zinc-600">Niciuna</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.allowed_companies.map((cId) => (
                            <span key={cId} className="text-[10px] font-mono px-1.5 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-300 rounded-sm">
                              {getCompanyName(cId)}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openResetPassword(u)}
                          className="p-1.5 text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10 rounded-sm transition-all"
                          data-testid={`reset-password-${u.id}`}
                          title="Reseteaza parola"
                        >
                          <Key size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-sm transition-all"
                          data-testid={`edit-user-${u.id}`}
                          title="Editeaza"
                        >
                          <PencilSimple size={14} />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => { setDeletingUser(u); setDeleteDialogOpen(true); }}
                            className="p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 rounded-sm transition-all"
                            data-testid={`delete-user-${u.id}`}
                            title="Sterge"
                          >
                            <Trash size={14} />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-lg" data-testid="user-dialog">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
              {editingUser ? "Editeaza Utilizator" : "Adauga Utilizator"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingUser ? "Modifica rolul si accesul la companii" : "Creaza un cont nou si atribuie companii"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingUser && (
              <>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Email</Label>
                  <Input
                    data-testid="user-email-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="utilizator@exemplu.ro"
                    className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                  />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola</Label>
                  <Input
                    data-testid="user-password-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Parola initiala"
                    className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                  />
                </div>
              </>
            )}
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Nume</Label>
              <Input
                data-testid="user-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Numele complet"
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="user-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                  <SelectItem value="admin">Administrator (acces total)</SelectItem>
                  <SelectItem value="user">Utilizator (acces limitat)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role !== "admin" && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Companii Permise</Label>
                <p className="text-[10px] text-zinc-600 mt-0.5 font-mono mb-2">Selecteaza companiile la care utilizatorul va avea acces</p>
                <div className="space-y-1 max-h-48 overflow-y-auto border border-zinc-800 rounded-sm p-2">
                  {companies.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-zinc-900 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={form.allowed_companies.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="rounded-sm border-zinc-600 bg-black text-white"
                        data-testid={`company-checkbox-${c.id}`}
                      />
                      <span className="text-sm text-zinc-300">{c.name}</span>
                      <span className="text-[10px] text-zinc-600 font-mono ml-auto">{c.platforms?.join(", ")}</span>
                    </label>
                  ))}
                  {companies.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-2">Nu exista companii. Adauga mai intai companii.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
            >
              Anuleaza
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
              data-testid="user-save-btn"
            >
              {saving ? "Se salveaza..." : editingUser ? "Salveaza" : "Creeaza"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-sm" data-testid="delete-user-dialog">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>Sterge Utilizator</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Esti sigur ca vrei sa stergi utilizatorul <strong className="text-white">{deletingUser?.name}</strong> ({deletingUser?.email})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
            >
              Anuleaza
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-rose-500 text-white font-semibold rounded-sm hover:bg-rose-600 transition-all text-sm"
              data-testid="delete-user-confirm-btn"
            >
              Sterge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-md" data-testid="reset-password-dialog">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2" style={{ fontFamily: 'Chivo, sans-serif' }}>
              <Key size={18} weight="duotone" />
              Reseteaza Parola
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Setezi o parola noua pentru <strong className="text-white">{resetTarget?.name}</strong> ({resetTarget?.email}).
              Utilizatorul va trebui sa o foloseasca la urmatoarea autentificare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola Noua</Label>
              <Input
                type="password"
                value={resetForm.new_password}
                onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })}
                placeholder="Minim 6 caractere"
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                data-testid="reset-new-password-input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Confirma Parola</Label>
              <Input
                type="password"
                value={resetForm.confirm_password}
                onChange={(e) => setResetForm({ ...resetForm, confirm_password: e.target.value })}
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
                data-testid="reset-confirm-password-input"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setResetDialogOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
            >
              Anuleaza
            </button>
            <button
              onClick={handleResetPassword}
              disabled={resetting}
              className="px-4 py-2 bg-amber-500 text-black font-semibold rounded-sm hover:bg-amber-400 transition-all text-sm disabled:opacity-50"
              data-testid="reset-password-confirm-btn"
            >
              {resetting ? "Se reseteaza..." : "Reseteaza Parola"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
