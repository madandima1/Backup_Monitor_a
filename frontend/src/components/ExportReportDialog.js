import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportReport } from "@/lib/api";
import { toast } from "sonner";
import { DownloadSimple, FilePdf, FileXls, FileDoc, FileCsv, Buildings } from "@phosphor-icons/react";

const ALL_COLUMNS = [
  { id: "company_name", label: "Companie", default: true },
  { id: "platform", label: "Platforma", default: true },
  { id: "vm_name", label: "VM / Masina", default: true },
  { id: "status", label: "Stare", default: true },
  { id: "backup_date", label: "Data", default: true },
  { id: "size", label: "Dimensiune", default: true },
  { id: "transferred", label: "Transferat", default: false },
  { id: "duration", label: "Durata", default: true },
  { id: "details", label: "Detalii", default: false },
  { id: "source", label: "Sursa", default: false },
  { id: "from_address", label: "Expeditor", default: false },
  { id: "email_subject", label: "Subiect Email", default: false },
  { id: "email_date", label: "Data Email", default: false },
  { id: "is_unknown", label: "Neidentificat", default: false },
];

const FORMATS = [
  { id: "pdf", label: "PDF", icon: FilePdf, color: "text-rose-400" },
  { id: "xlsx", label: "Excel (XLSX)", icon: FileXls, color: "text-emerald-400" },
  { id: "docx", label: "Word (DOCX)", icon: FileDoc, color: "text-sky-400" },
  { id: "csv", label: "CSV", icon: FileCsv, color: "text-amber-400" },
];

export default function ExportReportDialog({
  open,
  onClose,
  companies = [],
  initialFilters = {},
}) {
  const [format, setFormat] = useState("pdf");
  // scope: "all" (multi-companii sau toate) | "company" (una singura)
  const [scope, setScope] = useState("all");
  const [singleCompanyId, setSingleCompanyId] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]); // gol = toate
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [columns, setColumns] = useState(() =>
    Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c.default]))
  );
  const [busy, setBusy] = useState(false);

  // Pre-completare filtre din pagina de Istoric la fiecare deschidere
  useEffect(() => {
    if (!open) return;
    setDateFrom(initialFilters.date_from || "");
    setDateTo(initialFilters.date_to || "");
    setPlatform(initialFilters.platform || "all");
    setStatus(initialFilters.status || "all");
    setOnlyUnknown(!!initialFilters.only_unknown);
    const initCompany = initialFilters.company_id || "all";
    if (initCompany !== "all") {
      setScope("company");
      setSingleCompanyId(initCompany);
      setSelectedCompanyIds([]);
    } else {
      setScope("all");
      setSingleCompanyId("");
      setSelectedCompanyIds([]); // gol => toate
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCol = (id) => setColumns((p) => ({ ...p, [id]: !p[id] }));
  const toggleCompany = (id) =>
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allCompaniesList = useMemo(
    () => [...companies.map((c) => ({ id: c.id, name: c.name })), { id: "unknown", name: "Necunoscut" }],
    [companies]
  );
  const allSelected = selectedCompanyIds.length === 0; // gol = toate

  const selectAll = () => setSelectedCompanyIds([]);
  const deselectAll = () => setSelectedCompanyIds(["__none__"]); // marker ca sa nu fie gol => "toate"

  const summaryText = useMemo(() => {
    if (scope === "company") {
      const c = companies.find((x) => x.id === singleCompanyId);
      return c ? c.name : (singleCompanyId === "unknown" ? "Necunoscut" : "—");
    }
    if (allSelected) return "Toate companiile";
    const real = selectedCompanyIds.filter((x) => x !== "__none__");
    if (real.length === 0) return "Niciuna selectata";
    if (real.length === 1) {
      const c = allCompaniesList.find((x) => x.id === real[0]);
      return c?.name || "1 companie";
    }
    return `${real.length} companii selectate`;
  }, [scope, singleCompanyId, selectedCompanyIds, allSelected, allCompaniesList, companies]);

  const handleExport = async () => {
    const selectedCols = ALL_COLUMNS.filter((c) => columns[c.id]).map((c) => c.id);
    if (selectedCols.length === 0) {
      toast.error("Selecteaza cel putin o coloana");
      return;
    }
    if (scope === "company" && !singleCompanyId) {
      toast.error("Alege o companie");
      return;
    }
    if (scope === "all" && !allSelected && selectedCompanyIds.filter((x) => x !== "__none__").length === 0) {
      toast.error("Selecteaza cel putin o companie sau alege 'Toate'");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        format,
        scope,
        company_id: scope === "company" ? singleCompanyId : null,
        company_ids: scope === "all" && !allSelected
          ? selectedCompanyIds.filter((x) => x !== "__none__")
          : null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        platform: platform !== "all" ? platform : null,
        status: status !== "all" ? status : null,
        only_unknown: onlyUnknown,
        columns: selectedCols,
      };
      const blob = await exportReport(payload);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = summaryText.replace(/[^\w\-]+/g, "_").slice(0, 40) || "Raport";
      a.href = url;
      a.download = `Raport_Backup_${safe}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Raport generat");
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Eroare la generarea raportului");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl rounded-sm max-h-[90vh] overflow-y-auto" data-testid="export-report-dialog">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-sm text-zinc-300">
            Export Raport — {summaryText}
          </DialogTitle>
          <p className="text-[11px] font-mono text-zinc-500 mt-1">
            Filtrele sunt pre-completate din pagina Istoric. Le poti modifica inainte de export.
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Format */}
          <div>
            <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Format</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    className={`flex items-center justify-center gap-2 h-10 border rounded-sm text-xs font-mono transition-all ${
                      active ? "border-white bg-zinc-900 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"
                    }`}
                    data-testid={`export-format-${f.id}`}
                  >
                    <Icon size={16} weight="duotone" className={f.color} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope */}
          <div>
            <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Tip export</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`h-10 border rounded-sm text-xs font-mono transition-all ${
                  scope === "all" ? "border-white bg-zinc-900 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"
                }`}
                data-testid="export-scope-all"
              >
                Total / Multi-companii
              </button>
              <button
                type="button"
                onClick={() => setScope("company")}
                className={`h-10 border rounded-sm text-xs font-mono transition-all ${
                  scope === "company" ? "border-white bg-zinc-900 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"
                }`}
                data-testid="export-scope-company"
              >
                O singura companie
              </button>
            </div>
          </div>

          {/* Companii */}
          {scope === "company" ? (
            <div>
              <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Companie</Label>
              <Select value={singleCompanyId} onValueChange={setSingleCompanyId}>
                <SelectTrigger className="mt-1 h-9 bg-black border-zinc-800 text-white text-xs rounded-sm" data-testid="export-single-company">
                  <SelectValue placeholder="Alege companie..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 max-h-60">
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="unknown">Necunoscut</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                  <Buildings size={12} /> Companii ({allSelected ? "toate" : selectedCompanyIds.filter(x => x !== "__none__").length})
                </Label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="text-[10px] font-mono text-zinc-400 hover:text-white" data-testid="export-companies-all">
                    Toate
                  </button>
                  <span className="text-zinc-700">|</span>
                  <button type="button" onClick={deselectAll} className="text-[10px] font-mono text-zinc-400 hover:text-white" data-testid="export-companies-none">
                    Nimic
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-44 overflow-y-auto p-3 border border-zinc-800 rounded-sm bg-black">
                {allCompaniesList.map((c) => {
                  const checked = allSelected || selectedCompanyIds.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCompany(c.id)}
                        data-testid={`export-company-${c.id}`}
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] font-mono text-zinc-600 mt-1">
                {allSelected ? "Nicio bifa = toate companiile incluse." : "Bifeaza companiile dorite."}
              </p>
            </div>
          )}

          {/* Perioada */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">De la</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 h-9 bg-black border-zinc-800 text-white text-xs rounded-sm" data-testid="export-date-from" />
            </div>
            <div>
              <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Pana la</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 h-9 bg-black border-zinc-800 text-white text-xs rounded-sm" data-testid="export-date-to" />
            </div>
          </div>

          {/* Filtre suplimentare */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Platforma</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="mt-1 h-9 bg-black border-zinc-800 text-white text-xs rounded-sm" data-testid="export-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="Proxmox">Proxmox</SelectItem>
                  <SelectItem value="Synology">Synology</SelectItem>
                  <SelectItem value="QNAP">QNAP</SelectItem>
                  <SelectItem value="Veeam">Veeam</SelectItem>
                  <SelectItem value="Unknown">Necunoscut</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Stare</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1 h-9 bg-black border-zinc-800 text-white text-xs rounded-sm" data-testid="export-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="success">Succes</SelectItem>
                  <SelectItem value="failed">Esuat</SelectItem>
                  <SelectItem value="warning">Avertisment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white">
            <Checkbox checked={onlyUnknown} onCheckedChange={(v) => setOnlyUnknown(!!v)} data-testid="export-only-unknown" />
            <span>Doar intrari neidentificate</span>
          </label>

          {/* Coloane */}
          <div>
            <Label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Coloane raport</Label>
            <div className="grid grid-cols-2 gap-2 mt-2 max-h-56 overflow-y-auto p-3 border border-zinc-800 rounded-sm bg-black">
              {ALL_COLUMNS.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white">
                  <Checkbox checked={columns[c.id]} onCheckedChange={() => toggleCol(c.id)} data-testid={`export-col-${c.id}`} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="h-9 px-4 text-xs border border-zinc-800 text-zinc-400 rounded-sm hover:text-white hover:bg-zinc-900">
              Anuleaza
            </button>
            <button onClick={handleExport} disabled={busy}
              className="h-9 px-4 text-xs bg-white text-black rounded-sm hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2"
              data-testid="export-confirm-btn">
              <DownloadSimple size={14} />
              {busy ? "Se genereaza..." : `Genereaza ${format.toUpperCase()}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
