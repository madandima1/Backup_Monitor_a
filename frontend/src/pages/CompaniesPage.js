import React, { useState, useEffect, useCallback } from "react";
import { getCompanies, createCompany, updateCompany, deleteCompany, getPlatforms, exportConfig, importConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PencilSimple, Trash, Buildings, DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(null);
  const [form, setForm] = useState({ name: "", platforms: [], alert_threshold_hours: 24, email_patterns: [], notes: "" });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([getCompanies(), getPlatforms()]);
      setCompanies(c);
      setPlatforms(p);
    } catch {
      toast.error("Eroare la incarcarea companiilor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const fileInputRef = React.useRef(null);

  const handleExportConfig = async () => {
    try {
      const blob = await exportConfig();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_monitor_config_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Configuratia a fost exportata");
    } catch {
      toast.error("Eroare la exportul configuratiei");
    }
  };

  const handleImportConfig = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await importConfig(data);
      toast.success(result.message);
      loadData();
    } catch {
      toast.error("Eroare la importul configuratiei. Verificati fisierul.");
    }
    e.target.value = "";
  };

  const openCreate = () => {
    setEditingCompany(null);
    setForm({ name: "", platforms: [], alert_threshold_hours: 24, email_patterns: [], notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (company) => {
    setEditingCompany(company);
    setForm({
      name: company.name,
      platforms: company.platforms || [],
      alert_threshold_hours: company.alert_threshold_hours || 24,
      email_patterns: company.email_patterns || [],
      notes: company.notes || ""
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Numele companiei este obligatoriu"); return; }
    setSaving(true);
    try {
      if (editingCompany) {
        await updateCompany(editingCompany.id, form);
        toast.success("Companie actualizata");
      } else {
        await createCompany(form);
        toast.success("Companie adaugata");
      }
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Eroare la salvarea companiei");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;
    try {
      await deleteCompany(deletingCompany.id);
      toast.success("Companie stearsa");
      setDeleteDialogOpen(false);
      setDeletingCompany(null);
      loadData();
    } catch {
      toast.error("Eroare la stergerea companiei");
    }
  };

  const togglePlatform = (name) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(name)
        ? prev.platforms.filter((p) => p !== name)
        : [...prev.platforms, name]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="companies-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Companii
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Gestioneaza companiile monitorizate</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImportConfig}
            className="hidden"
            data-testid="import-config-input"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:text-white hover:bg-zinc-900 transition-all text-sm"
            data-testid="import-config-btn"
          >
            <UploadSimple size={16} />
            Importa
          </button>
          <button
            onClick={handleExportConfig}
            className="flex items-center gap-2 px-3 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:text-white hover:bg-zinc-900 transition-all text-sm"
            data-testid="export-config-btn"
          >
            <DownloadSimple size={16} />
            Exporta Config
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm"
            data-testid="add-company-btn"
          >
            <Plus size={16} weight="bold" />
            Adauga Companie
          </button>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="companies-table-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider pl-4">Companie</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Platforme</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Prag Alerta (ore)</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Pattern Email</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Note</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider text-right pr-4">Actiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={6} className="text-center py-12">
                    <Buildings size={32} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                    <p className="text-zinc-600 text-sm">Nu exista companii. Adauga prima companie.</p>
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c) => (
                  <TableRow key={c.id} className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell className="text-white text-sm font-medium pl-4">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.platforms || []).map((p) => (
                          <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-300 rounded-sm">{p}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{c.alert_threshold_hours || 24}h</TableCell>
                    <TableCell className="font-mono text-[11px] text-zinc-500">{(c.email_patterns || []).join(", ") || "-"}</TableCell>
                    <TableCell className="text-xs text-zinc-500 max-w-[200px] truncate">{c.notes || "-"}</TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-sm transition-all"
                          data-testid={`edit-company-${c.id}`}
                        >
                          <PencilSimple size={14} />
                        </button>
                        <button
                          onClick={() => { setDeletingCompany(c); setDeleteDialogOpen(true); }}
                          className="p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 rounded-sm transition-all"
                          data-testid={`delete-company-${c.id}`}
                        >
                          <Trash size={14} />
                        </button>
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
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-lg" data-testid="company-dialog">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
              {editingCompany ? "Editeaza Companie" : "Adauga Companie"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingCompany ? "Modifica detaliile companiei" : "Completeaza detaliile noii companii"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Nume Companie</Label>
              <Input
                data-testid="company-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ex: TechSoft SRL"
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
              />
            </div>

            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Platforme</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.name)}
                    data-testid={`platform-toggle-${p.name.toLowerCase()}`}
                    className={`px-3 py-1.5 text-xs font-mono rounded-sm border transition-all ${
                      form.platforms.includes(p.name)
                        ? "bg-zinc-800 text-white border-zinc-600"
                        : "bg-transparent text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-600"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Prag Alerta (ore)</Label>
              <Input
                data-testid="company-threshold-input"
                type="number"
                value={form.alert_threshold_hours}
                onChange={(e) => setForm({ ...form, alert_threshold_hours: parseInt(e.target.value) || 24 })}
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm w-32"
              />
              <p className="text-[10px] text-zinc-600 mt-1 font-mono">Alerta daca nu se primeste backup in acest interval</p>
            </div>

            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Pattern-uri Email (unul pe linie)</Label>
              <textarea
                data-testid="company-email-patterns"
                value={(form.email_patterns || []).join("\n")}
                onChange={(e) => setForm({ ...form, email_patterns: e.target.value.split("\n").filter(Boolean) })}
                placeholder="backup@companie.ro"
                className="mt-1.5 w-full bg-black border border-zinc-800 text-white rounded-sm p-2 text-sm font-mono h-20 focus:ring-1 focus:ring-white outline-none transition-all resize-none"
              />
            </div>

            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Note</Label>
              <Input
                data-testid="company-notes-input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Note suplimentare..."
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
              data-testid="company-cancel-btn"
            >
              Anuleaza
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
              data-testid="company-save-btn"
            >
              {saving ? "Se salveaza..." : editingCompany ? "Salveaza" : "Adauga"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-sm" data-testid="delete-company-dialog">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>Sterge Companie</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Esti sigur ca vrei sa stergi compania <strong className="text-white">{deletingCompany?.name}</strong>?
              Aceasta actiune nu poate fi anulata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
              data-testid="delete-cancel-btn"
            >
              Anuleaza
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-rose-500 text-white font-semibold rounded-sm hover:bg-rose-600 transition-all text-sm"
              data-testid="delete-confirm-btn"
            >
              Sterge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
