import React, { useState, useEffect, useCallback } from "react";
import { getSystemAlerts, acknowledgeSystemAlert } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lightning, ShieldWarning, Thermometer, WifiHigh, Check, ArrowClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORY_ICONS = {
  UPS: Lightning,
  Security: ShieldWarning,
  Hardware: Thermometer,
  Network: WifiHigh,
};

const SEVERITY_STYLES = {
  error: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

export default function SystemAlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await getSystemAlerts({ limit: 100 });
      setAlerts(data.alerts || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Eroare la incarcarea alertelor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAcknowledge = async (id) => {
    try {
      await acknowledgeSystemAlert(id);
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
      toast.success("Alerta confirmata");
    } catch {
      toast.error("Eroare la confirmarea alertei");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-500 font-mono text-sm">Se incarca...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="system-alerts-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
            Alerte Sistem
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Alerte non-backup: UPS, securitate, hardware, retea ({total} total)
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-2 px-3 py-2 border border-zinc-800 rounded-sm text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
          data-testid="refresh-alerts-btn"
        >
          <ArrowClockwise size={16} />
          Actualizeaza
        </button>
      </div>

      <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="system-alerts-table">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-zinc-400">
            Alerte ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider pl-4">Categorie</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Severitate</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Mesaj</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Data</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Sursa</TableHead>
                <TableHead className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider">Actiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={6} className="text-center text-zinc-600 py-8 font-mono text-sm">
                    Nu exista alerte sistem
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((a) => {
                  const CatIcon = CATEGORY_ICONS[a.category] || ShieldWarning;
                  const sevStyle = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.warning;
                  return (
                    <TableRow key={a.id} className={`border-zinc-800 ${a.acknowledged ? "opacity-50" : ""} hover:bg-zinc-900/50`}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <CatIcon size={16} weight="duotone" className="text-zinc-400" />
                          <span className="text-xs font-mono text-zinc-300">{a.category}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase border ${sevStyle}`}>
                          {a.severity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-200 max-w-md truncate">{a.message || a.subject}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{a.created_at?.slice(0, 16).replace("T", " ")}</TableCell>
                      <TableCell className="font-mono text-[10px] text-zinc-600 uppercase">{a.source}</TableCell>
                      <TableCell>
                        {!a.acknowledged ? (
                          <button
                            onClick={() => handleAcknowledge(a.id)}
                            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                            data-testid={`ack-alert-${a.id}`}
                          >
                            <Check size={14} />
                            Confirma
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-600">Confirmata</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
