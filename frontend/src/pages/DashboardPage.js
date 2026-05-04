import React, { useState, useEffect, useCallback } from "react";
import { getBackupStats, getAlerts, dismissAlert, generateAlerts, getBackups } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import BackupDetailModal from "@/components/BackupDetailModal";
import ExportReportDialog from "@/components/ExportReportDialog";
import {
  CheckCircle,
  XCircle,
  Warning,
  Bell,
  Buildings,
  HardDrive,
  ChartBar,
  ArrowClockwise,
  X,
  DownloadSimple
} from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

const STATUS_MAP = {
  success: { label: "Succes", icon: CheckCircle, className: "status-success" },
  failed: { label: "Esuat", icon: XCircle, className: "status-failed" },
  warning: { label: "Avertisment", icon: Warning, className: "status-warning" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedBackupId, setSelectedBackupId] = useState(null);
  const [exportTarget, setExportTarget] = useState(null); // { scope, companyId, companyName } | null

  const loadData = useCallback(async () => {
    try {
      const [statsData, alertsData, backupsData] = await Promise.all([
        getBackupStats(),
        getAlerts(),
        getBackups({ limit: 50 })
      ]);
      setStats(statsData);
      setAlerts(alertsData);
      setBackups(backupsData.backups || []);
    } catch (err) {
      toast.error("Eroare la incarcarea datelor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerateAlerts = async () => {
    try {
      const newAlerts = await generateAlerts();
      setAlerts(newAlerts);
      toast.success("Alertele au fost actualizate");
    } catch {
      toast.error("Eroare la generarea alertelor");
    }
  };

  const handleDismissAlert = async (id) => {
    try {
      await dismissAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error("Eroare la inchiderea alertei");
    }
  };

  const filteredBackups = backups.filter((b) => {
    if (filterPlatform !== "all" && b.platform !== filterPlatform) return false;
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 font-mono text-sm">Se incarca datele...</div>
      </div>
    );
  }

  const successRate = stats?.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Panou de Control
          </h1>
          <p className="text-sm text-zinc-500 mt-1 font-mono">
            {new Date().toLocaleDateString("ro-RO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-2 px-3 py-2 border border-zinc-800 rounded-sm text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
          data-testid="refresh-dashboard-btn"
        >
          <ArrowClockwise size={16} />
          Actualizeaza
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-grid">
        <Card className="border-zinc-800 bg-zinc-950 rounded-sm hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Total Backup-uri</span>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-mono tracking-tight text-white" data-testid="stat-total">{stats?.total || 0}</div>
            <div className="text-xs text-zinc-500 mt-1 font-mono">Azi: {stats?.total_today || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 rounded-sm hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Rata Succes</span>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-mono tracking-tight text-emerald-400" data-testid="stat-success-rate">{successRate}%</div>
            <div className="text-xs text-zinc-500 mt-1 font-mono">Reusit: {stats?.success || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 rounded-sm hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Esuat</span>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-mono tracking-tight text-rose-400" data-testid="stat-failed">{stats?.failed || 0}</div>
            <div className="text-xs text-zinc-500 mt-1 font-mono">Azi: {stats?.failed_today || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 rounded-sm hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2 pt-4 px-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Companii</span>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-mono tracking-tight text-white" data-testid="stat-companies">{stats?.companies_count || 0}</div>
            <div className="text-xs text-zinc-500 mt-1 font-mono">Monitorizate</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main content - 2 cols */}
        <div className="xl:col-span-2 space-y-6">
          {/* Chart */}
          {stats?.daily_stats && stats.daily_stats.length > 0 && (
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="daily-chart">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
                  Backup-uri Ultimele 7 Zile
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.daily_stats}>
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
                        labelFormatter={(v) => `Data: ${v}`}
                      />
                      <Bar dataKey="success" fill="#34d399" name="Succes" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="failed" fill="#f43f5e" name="Esuat" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="warning" fill="#fbbf24" name="Avertisment" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Backup Table */}
          <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="backups-table-card">
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
                  Ultimele Backup-uri
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                    <SelectTrigger className="w-[140px] h-8 text-xs bg-black border-zinc-800 text-white rounded-sm" data-testid="filter-platform-select">
                      <SelectValue placeholder="Platforma" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                      <SelectItem value="all">Toate</SelectItem>
                      <SelectItem value="Proxmox">Proxmox</SelectItem>
                      <SelectItem value="Synology">Synology</SelectItem>
                      <SelectItem value="QNAP">QNAP</SelectItem>
                      <SelectItem value="Veeam">Veeam</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[130px] h-8 text-xs bg-black border-zinc-800 text-white rounded-sm" data-testid="filter-status-select">
                      <SelectValue placeholder="Stare" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                      <SelectItem value="all">Toate</SelectItem>
                      <SelectItem value="success">Succes</SelectItem>
                      <SelectItem value="failed">Esuat</SelectItem>
                      <SelectItem value="warning">Avertisment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBackups.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={8} className="text-center text-zinc-600 py-8 font-mono text-sm">
                        Nu exista backup-uri
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBackups.slice(0, 20).map((b) => {
                      const st = STATUS_MAP[b.status] || STATUS_MAP.warning;
                      const Icon = st.icon;
                      return (
                        <TableRow key={b.id} className="border-zinc-800 hover:bg-zinc-900/50 cursor-pointer" onClick={() => setSelectedBackupId(b.id)} data-testid={`backup-row-${b.id}`}>
                          <TableCell className="text-white text-sm pl-4">{b.company_name}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-300">{b.platform}</TableCell>
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
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Alerts + Company Overview */}
        <div className="space-y-6">
          {/* Alerts Panel */}
          <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="alerts-panel">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={16} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
                    Alerte ({alerts.length})
                  </CardTitle>
                </div>
                <button
                  onClick={handleGenerateAlerts}
                  className="text-[10px] font-mono text-zinc-600 hover:text-white transition-colors uppercase tracking-wider"
                  data-testid="generate-alerts-btn"
                >
                  Verifica
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {alerts.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle size={28} weight="duotone" className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500 font-mono">Fara alerte active</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-sm border ${
                        alert.severity === "error" ? "border-rose-500/25 bg-rose-500/5" : "border-amber-500/25 bg-amber-500/5"
                      }`}
                      data-testid={`alert-${alert.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-mono ${alert.severity === "error" ? "text-rose-400" : "text-amber-400"}`}>
                            {alert.type === "failed_backup" ? "BACKUP ESUAT" : "BACKUP LIPSA"}
                          </div>
                          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{alert.message}</p>
                          <div className="text-[10px] text-zinc-600 mt-1 font-mono">{alert.platform}</div>
                        </div>
                        <button
                          onClick={() => handleDismissAlert(alert.id)}
                          className="text-zinc-600 hover:text-white transition-colors shrink-0"
                          data-testid={`dismiss-alert-${alert.id}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company Overview */}
          {stats?.company_stats && (
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="company-overview">
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Buildings size={16} weight="duotone" className="text-zinc-400" />
                    <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
                      Companii
                    </CardTitle>
                  </div>
                  <button
                    onClick={() => setExportTarget({ scope: "all", companyId: null, companyName: "" })}
                    className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    data-testid="export-total-btn"
                  >
                    <DownloadSimple size={12} /> Export Total
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {stats.company_stats.map((c) => (
                  <div
                    key={c.company_id}
                    className="p-3 border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors"
                    data-testid={`company-stat-${c.company_id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{c.company_name}</span>
                      <div className="flex items-center gap-2">
                        {c.last_backup_status && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${STATUS_MAP[c.last_backup_status]?.className || ""}`}>
                            {STATUS_MAP[c.last_backup_status]?.label || c.last_backup_status}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExportTarget({ scope: "company", companyId: c.company_id, companyName: c.company_name }); }}
                          className="text-zinc-500 hover:text-emerald-400 transition-colors"
                          title="Export raport companie"
                          data-testid={`export-company-${c.company_id}`}
                        >
                          <DownloadSimple size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-mono text-emerald-400">{c.success} ok</span>
                      <span className="text-[10px] font-mono text-rose-400">{c.failed} esuat</span>
                      <span className="text-[10px] font-mono text-amber-400">{c.warning} avert.</span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600 mt-1">
                      {c.platforms?.join(", ")} | Ultim: {c.last_backup_date || "N/A"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Platform Stats */}
          {stats?.platform_stats && Object.keys(stats.platform_stats).length > 0 && (
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="platform-stats">
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <HardDrive size={16} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
                    Platforme
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {Object.entries(stats.platform_stats).map(([platform, data]) => (
                  <div key={platform} className="flex items-center justify-between p-2 border border-zinc-800 rounded-sm">
                    <span className="text-sm font-mono text-white">{platform}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-emerald-400">{data.success}</span>
                      <span className="text-[10px] font-mono text-zinc-600">/</span>
                      <span className="text-[10px] font-mono text-rose-400">{data.failed}</span>
                      <span className="text-[10px] font-mono text-zinc-600">/</span>
                      <span className="text-[10px] font-mono text-zinc-400">{data.total}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <BackupDetailModal
        backupId={selectedBackupId}
        open={!!selectedBackupId}
        onClose={() => setSelectedBackupId(null)}
      />

      <ExportReportDialog
        open={!!exportTarget}
        onClose={() => setExportTarget(null)}
        scope={exportTarget?.scope || "all"}
        companyId={exportTarget?.companyId}
        companyName={exportTarget?.companyName}
      />
    </div>
  );
}
