import React, { useState, useEffect, useCallback } from "react";
import { getBackups, getCompanies, getBackupStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CheckCircle, XCircle, Warning, CalendarBlank, FunnelSimple, DownloadSimple } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import { toast } from "sonner";
import BackupDetailModal from "@/components/BackupDetailModal";
import ExportReportDialog from "@/components/ExportReportDialog";

const STATUS_MAP = {
  success: { label: "Succes", icon: CheckCircle, className: "status-success" },
  failed: { label: "Esuat", icon: XCircle, className: "status-failed" },
  warning: { label: "Avertisment", icon: Warning, className: "status-warning" },
};

const isUnknownBackup = (b) =>
  b?.is_unknown === true ||
  !b?.company_id ||
  b?.company_name === "Necunoscut" ||
  b?.platform === "Necunoscut";

export default function HistoryPage() {
  const [backups, setBackups] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    company_id: "all",
    platform: "all",
    status: "all",
    date_from: "",
    date_to: "",
    only_unknown: false,
  });
  const [page, setPage] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedBackupId, setSelectedBackupId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = { limit: 50, skip: page * 50 };
      if (filters.company_id !== "all") params.company_id = filters.company_id;
      if (filters.platform !== "all") params.platform = filters.platform;
      if (filters.status !== "all") params.status = filters.status;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.only_unknown) params.only_unknown = true;

      const [backupsData, companiesData, statsData] = await Promise.all([
        getBackups(params),
        getCompanies(),
        getBackupStats()
      ]);
      setBackups(backupsData.backups || []);
      setTotal(backupsData.total || 0);
      setCompanies(companiesData);
      setStats(statsData);
    } catch {
      toast.error("Eroare la incarcarea istoricului");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDateSelect = (date) => {
    if (date) {
      const formatted = format(date, "yyyy-MM-dd");
      setFilters((prev) => ({ ...prev, date_from: formatted, date_to: formatted }));
      setSelectedDate(date);
    }
    setDatePickerOpen(false);
  };

  const clearFilters = () => {
    setFilters({ company_id: "all", platform: "all", status: "all", date_from: "", date_to: "", only_unknown: false });
    setSelectedDate(null);
    setPage(0);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="history-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
          Istoric Backup-uri
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Vizualizeaza si filtreaza istoricul backup-urilor</p>
      </div>

      {/* Chart */}
      {stats?.daily_stats && (
        <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="history-chart">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
              Tendinta Ultimele 7 Zile
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily_stats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#71717a', fontFamily: 'JetBrains Mono' }}
                    tickFormatter={(v) => v.slice(5)}
                    stroke="#27272a"
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#71717a', fontFamily: 'JetBrains Mono' }} stroke="#27272a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '2px', fontFamily: 'JetBrains Mono', fontSize: 12, color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="success" stroke="#34d399" name="Succes" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
                  <Line type="monotone" dataKey="failed" stroke="#f43f5e" name="Esuat" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} />
                  <Line type="monotone" dataKey="warning" stroke="#fbbf24" name="Avertisment" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="history-filters">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FunnelSimple size={14} className="text-zinc-500" />
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Filtre</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={filters.company_id} onValueChange={(v) => { setFilters((prev) => ({ ...prev, company_id: v })); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-black border-zinc-800 text-white rounded-sm" data-testid="history-filter-company">
                <SelectValue placeholder="Companie" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                <SelectItem value="all">Toate Companiile</SelectItem>
                <SelectItem value="unknown">Necunoscute</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.platform} onValueChange={(v) => { setFilters((prev) => ({ ...prev, platform: v })); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-black border-zinc-800 text-white rounded-sm" data-testid="history-filter-platform">
                <SelectValue placeholder="Platforma" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                <SelectItem value="all">Toate</SelectItem>
                <SelectItem value="Proxmox">Proxmox</SelectItem>
                <SelectItem value="Synology">Synology</SelectItem>
                <SelectItem value="QNAP">QNAP</SelectItem>
                <SelectItem value="Veeam">Veeam</SelectItem>
                <SelectItem value="Unknown">Necunoscut</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => { setFilters((prev) => ({ ...prev, status: v })); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-black border-zinc-800 text-white rounded-sm" data-testid="history-filter-status">
                <SelectValue placeholder="Stare" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                <SelectItem value="all">Toate</SelectItem>
                <SelectItem value="success">Succes</SelectItem>
                <SelectItem value="failed">Esuat</SelectItem>
                <SelectItem value="warning">Avertisment</SelectItem>
              </SelectContent>
            </Select>

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-2 h-8 px-3 text-xs bg-black border border-zinc-800 text-zinc-400 rounded-sm hover:text-white transition-colors"
                  data-testid="history-date-picker"
                >
                  <CalendarBlank size={14} />
                  {selectedDate ? format(selectedDate, "dd MMM yyyy", { locale: ro }) : "Alege Data"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="bg-zinc-950 border-zinc-800 p-0 rounded-sm w-auto" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  className="bg-zinc-950 text-white"
                />
              </PopoverContent>
            </Popover>

            <button
              onClick={() => { setFilters((prev) => ({ ...prev, only_unknown: !prev.only_unknown })); setPage(0); }}
              className={`h-8 px-3 text-xs border rounded-sm transition-all ${filters.only_unknown ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-900"}`}
              data-testid="filter-only-unknown-btn"
            >
              {filters.only_unknown ? "✓ Doar neidentificate" : "Doar neidentificate"}
            </button>
            <button
              onClick={clearFilters}
              className="h-8 px-3 text-xs border border-zinc-800 text-zinc-500 rounded-sm hover:text-white hover:bg-zinc-900 transition-all"
              data-testid="clear-filters-btn"
            >
              Reseteaza
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="h-8 px-3 text-xs border border-emerald-700/40 bg-emerald-500/10 text-emerald-300 rounded-sm hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
              data-testid="export-report-btn"
            >
              <DownloadSimple size={13} />
              Export (PDF/XLSX/DOCX/CSV)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="history-table-card">
        <CardHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
              Rezultate ({total})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider pl-4">Companie</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Platforma</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">VM / Masina</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Stare</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Data</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Dimensiune</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Spatiu Total</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Durata</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Sursa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={9} className="text-center text-zinc-600 py-8 font-mono text-sm">
                    Nu exista backup-uri pentru filtrele selectate
                  </TableCell>
                </TableRow>
              ) : (
                backups.map((b) => {
                  const st = STATUS_MAP[b.status] || STATUS_MAP.warning;
                  const Icon = st.icon;
                  const unknown = isUnknownBackup(b);
                  return (
                    <TableRow key={b.id} className={`border-zinc-800 hover:bg-zinc-900/50 cursor-pointer ${unknown ? "bg-amber-500/[0.03]" : ""}`} onClick={() => setSelectedBackupId(b.id)} data-testid={`history-row-${b.id}`}>
                      <TableCell className="text-white text-sm pl-4">
                        <div className="flex items-center gap-2">
                          <span>{b.company_name || "—"}</span>
                          {unknown && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30" data-testid="unknown-badge">
                              Unknown
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-300">{b.platform === "Necunoscut" ? <span className="text-amber-400/80">Necunoscut</span> : b.platform}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-300">{b.vm_name ? b.vm_name : <span className="text-zinc-600">-</span>}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-mono ${st.className}`}>
                          <Icon size={13} weight="fill" />
                          {st.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{b.backup_date}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{b.transferred || b.size || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{b.size || "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{b.duration || "-"}</TableCell>
                      <TableCell className="font-mono text-[10px] text-zinc-600 uppercase">{b.source || "manual"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
              <span className="text-xs font-mono text-zinc-500">
                Pagina {page + 1} din {Math.ceil(total / 50)}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-xs border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all disabled:opacity-30"
                  data-testid="history-prev-page"
                >
                  Inapoi
                </button>
                <button
                  disabled={(page + 1) * 50 >= total}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-xs border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all disabled:opacity-30"
                  data-testid="history-next-page"
                >
                  Inainte
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BackupDetailModal
        backupId={selectedBackupId}
        open={!!selectedBackupId}
        onClose={() => setSelectedBackupId(null)}
      />

      <ExportReportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        companies={companies}
        initialFilters={{
          company_id: filters.company_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
          platform: filters.platform,
          status: filters.status,
          only_unknown: filters.only_unknown,
        }}
      />
    </div>
  );
}
