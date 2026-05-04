import React, { useState, useEffect, useCallback } from "react";
import {
  getEmailSettings, saveEmailSettings, testEmailConnection,
  getPlatforms, createPlatform,
  getWebhookSettings, saveWebhookSettings, regenerateWebhookToken, getWebhookLog,
  getCompanies, createBackupFromEmail, parseEmailTest,
  getSmtpSettings, saveSmtpSettings, testSmtpConnection,
  getAlertRecipients, addAlertRecipient, deleteAlertRecipient,
  getAlertCheckSettings, saveAlertCheckSettings,
  getAlertEmailHistory, checkAndNotify,
  getImapSettings, saveImapSettings, testImapConnection, syncImapEmails, getImapSyncLog
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  EnvelopeSimple,
  MicrosoftOutlookLogo,
  HardDrive,
  Plus,
  FloppyDisk,
  Plugs,
  Info,
  CheckCircle,
  Lightning,
  Copy,
  ArrowClockwise,
  ClipboardText,
  Eye,
  PaperPlaneTilt,
  XCircle,
  Warning,
  FolderOpen,
  Link,
  Bell,
  Trash,
  PaperPlaneRight,
  Clock,
  At,
  EnvelopeOpen,
  ArrowsClockwise,
  DownloadSimple
} from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_ICONS = {
  success: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  failed: { icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10" },
  warning: { icon: Warning, color: "text-amber-400", bg: "bg-amber-500/10" },
};

export default function SettingsPage() {
  const [emailSettings, setEmailSettings] = useState({ client_id: "", tenant_id: "", client_secret: "", email_address: "" });
  const [platforms, setPlatforms] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [newPlatformOpen, setNewPlatformOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ name: "", icon: "" });

  // Webhook state
  const [webhookSettings, setWebhookSettings] = useState(null);
  const [webhookLog, setWebhookLog] = useState([]);
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Manual email state
  const [emailImport, setEmailImport] = useState({ subject: "", body: "", company_id: "", company_name: "" });
  const [parsePreview, setParsePreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  // SMTP / Alert state
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: "", smtp_port: 587, smtp_username: "", smtp_password: "",
    from_address: "", from_name: "Backup Monitor", use_tls: true
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [alertRecipients, setAlertRecipients] = useState([]);
  const [newRecipient, setNewRecipient] = useState({ email: "", name: "" });
  const [alertCheckSettings, setAlertCheckSettings] = useState({ interval_hours: 6, enabled: true, last_check: null });
  const [alertHistory, setAlertHistory] = useState([]);
  const [checkingAlerts, setCheckingAlerts] = useState(false);

  // IMAP state
  const [imapSettings, setImapSettings] = useState({
    imap_host: "", imap_port: 993, imap_username: "", imap_password: "",
    use_ssl: true, folder: "INBOX", auto_sync_enabled: true, sync_interval_minutes: 1,
    delete_after_import: false, mark_as_read: true, fetch_all_emails: false, days_to_fetch: 7, last_sync: null
  });
  const [savingImap, setSavingImap] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [syncingImap, setSyncingImap] = useState(false);
  const [imapSyncLog, setImapSyncLog] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [settings, plats, comps] = await Promise.all([
        getEmailSettings(),
        getPlatforms(),
        getCompanies()
      ]);
      if (settings && Object.keys(settings).length > 0) {
        setEmailSettings({
          client_id: settings.client_id || "",
          tenant_id: settings.tenant_id || "",
          client_secret: settings.client_secret || "",
          email_address: settings.email_address || ""
        });
      }
      setPlatforms(plats);
      setCompanies(comps);
    } catch {}
  }, []);

  const loadWebhookData = useCallback(async () => {
    try {
      const [whSettings, whLog] = await Promise.all([
        getWebhookSettings(),
        getWebhookLog(20)
      ]);
      setWebhookSettings(whSettings);
      setWebhookLog(whLog);
    } catch {}
  }, []);

  const loadAlertData = useCallback(async () => {
    try {
      const [smtp, recipients, checkSettings, history] = await Promise.all([
        getSmtpSettings(),
        getAlertRecipients(),
        getAlertCheckSettings(),
        getAlertEmailHistory()
      ]);
      if (smtp && Object.keys(smtp).length > 0) {
        setSmtpSettings(prev => ({
          ...prev,
          smtp_host: smtp.smtp_host || "",
          smtp_port: smtp.smtp_port || 587,
          smtp_username: smtp.smtp_username || "",
          smtp_password: smtp.smtp_password || "",
          from_address: smtp.from_address || "",
          from_name: smtp.from_name || "Backup Monitor",
          use_tls: smtp.use_tls ?? true
        }));
      }
      setAlertRecipients(recipients || []);
      if (checkSettings) setAlertCheckSettings(checkSettings);
      setAlertHistory(history || []);
    } catch {}
  }, []);

  const loadImapData = useCallback(async () => {
    try {
      const [imap, syncLog] = await Promise.all([
        getImapSettings(),
        getImapSyncLog(20)
      ]);
      if (imap && Object.keys(imap).length > 0) {
        setImapSettings(prev => ({
          ...prev,
          imap_host: imap.imap_host || "",
          imap_port: imap.imap_port || 993,
          imap_username: imap.imap_username || "",
          imap_password: imap.imap_password || "",
          use_ssl: imap.use_ssl ?? true,
          folder: imap.folder || "INBOX",
          auto_sync_enabled: imap.auto_sync_enabled ?? true,
          sync_interval_minutes: imap.sync_interval_minutes || 1,
          delete_after_import: imap.delete_after_import ?? false,
          mark_as_read: imap.mark_as_read ?? true,
          fetch_all_emails: imap.fetch_all_emails ?? false,
          days_to_fetch: imap.days_to_fetch || 7,
          last_sync: imap.last_sync || null
        }));
      }
      setImapSyncLog(syncLog || []);
    } catch {}
  }, []);

  useEffect(() => { loadData(); loadWebhookData(); loadAlertData(); loadImapData(); }, [loadData, loadWebhookData, loadAlertData, loadImapData]);

  // Email settings handlers
  const handleSaveEmail = async () => {
    if (!emailSettings.client_id || !emailSettings.tenant_id) {
      toast.error("Client ID si Tenant ID sunt obligatorii");
      return;
    }
    setSaving(true);
    try {
      await saveEmailSettings(emailSettings);
      toast.success("Setarile email au fost salvate");
    } catch {
      toast.error("Eroare la salvarea setarilor");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await testEmailConnection();
      toast.info(result.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la testarea conexiunii");
    } finally {
      setTesting(false);
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatform.name.trim()) { toast.error("Numele platformei este obligatoriu"); return; }
    try {
      await createPlatform(newPlatform);
      toast.success("Platforma adaugata");
      setNewPlatformOpen(false);
      setNewPlatform({ name: "", icon: "" });
      loadData();
    } catch {
      toast.error("Eroare la adaugarea platformei");
    }
  };

  // Webhook handlers
  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const result = await saveWebhookSettings({
        folder_path: webhookSettings?.folder_path || "Inbox/Backup Clienti",
        auto_match_company: webhookSettings?.auto_match_company ?? true,
        default_company_id: webhookSettings?.default_company_id || ""
      });
      setWebhookSettings(result);
      toast.success("Setarile webhook au fost salvate");
    } catch {
      toast.error("Eroare la salvarea setarilor webhook");
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleRegenerateToken = async () => {
    try {
      const result = await regenerateWebhookToken();
      setWebhookSettings(prev => ({ ...prev, webhook_token: result.webhook_token }));
      toast.success("Token regenerat cu succes");
    } catch {
      toast.error("Eroare la regenerarea tokenului");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiat in clipboard");
  };

  // Manual email handlers
  const handleParsePreview = async () => {
    if (!emailImport.subject && !emailImport.body) {
      toast.error("Introduceti subiectul sau continutul email-ului");
      return;
    }
    setParsing(true);
    try {
      const result = await parseEmailTest({ subject: emailImport.subject, body: emailImport.body });
      setParsePreview(result);
    } catch {
      toast.error("Eroare la parsarea email-ului");
    } finally {
      setParsing(false);
    }
  };

  const handleImportEmail = async () => {
    if (!emailImport.subject && !emailImport.body) {
      toast.error("Introduceti subiectul sau continutul email-ului");
      return;
    }
    setImporting(true);
    try {
      const result = await createBackupFromEmail(emailImport);
      toast.success(result.message);
      setEmailImport({ subject: "", body: "", company_id: "", company_name: "" });
      setParsePreview(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la importul email-ului");
    } finally {
      setImporting(false);
    }
  };

  const webhookUrl = webhookSettings?.webhook_token
    ? `${window.location.origin}/api/webhook/power-automate`
    : "";

  // SMTP handlers
  const handleSaveSmtp = async () => {
    if (!smtpSettings.smtp_host || !smtpSettings.smtp_username || !smtpSettings.from_address) {
      toast.error("Host SMTP, username si adresa From sunt obligatorii");
      return;
    }
    setSavingSmtp(true);
    try {
      await saveSmtpSettings(smtpSettings);
      toast.success("Setarile SMTP au fost salvate");
    } catch {
      toast.error("Eroare la salvarea setarilor SMTP");
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const result = await testSmtpConnection();
      toast.success(result.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la testarea SMTP");
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleAddRecipient = async () => {
    if (!newRecipient.email.trim()) {
      toast.error("Adresa email este obligatorie");
      return;
    }
    try {
      const result = await addAlertRecipient(newRecipient);
      setAlertRecipients(prev => [...prev, result]);
      setNewRecipient({ email: "", name: "" });
      toast.success("Destinatar adaugat");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la adaugarea destinatarului");
    }
  };

  const handleDeleteRecipient = async (id) => {
    try {
      await deleteAlertRecipient(id);
      setAlertRecipients(prev => prev.filter(r => r.id !== id));
      toast.success("Destinatar sters");
    } catch {
      toast.error("Eroare la stergerea destinatarului");
    }
  };

  const handleSaveAlertCheck = async () => {
    try {
      const result = await saveAlertCheckSettings(alertCheckSettings);
      setAlertCheckSettings(result);
      toast.success("Setarile de verificare au fost salvate");
    } catch {
      toast.error("Eroare la salvarea setarilor");
    }
  };

  const handleCheckAndNotify = async () => {
    setCheckingAlerts(true);
    try {
      const result = await checkAndNotify();
      if (result.status === "ok" && result.email_sent) {
        toast.success(result.message);
      } else if (result.status === "ok" && !result.email_sent) {
        toast.info(result.message);
      } else if (result.status === "warning") {
        toast.warning(result.message);
      } else {
        toast.error(result.message);
      }
      loadAlertData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la verificarea alertelor");
    } finally {
      setCheckingAlerts(false);
    }
  };

  // IMAP handlers
  const handleSaveImap = async () => {
    if (!imapSettings.imap_host || !imapSettings.imap_username) {
      toast.error("Host IMAP si username sunt obligatorii");
      return;
    }
    setSavingImap(true);
    try {
      await saveImapSettings(imapSettings);
      toast.success("Setarile IMAP au fost salvate");
      loadImapData();
    } catch {
      toast.error("Eroare la salvarea setarilor IMAP");
    } finally {
      setSavingImap(false);
    }
  };

  const handleTestImap = async () => {
    setTestingImap(true);
    try {
      const result = await testImapConnection();
      toast.success(result.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la testarea conexiunii IMAP");
    } finally {
      setTestingImap(false);
    }
  };

  const handleSyncImap = async () => {
    setSyncingImap(true);
    try {
      const result = await syncImapEmails();
      if (result.backups_created > 0) {
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
      loadImapData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eroare la sincronizarea email-urilor");
    } finally {
      setSyncingImap(false);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
          Setari
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Configureaza conexiuni, webhook-uri si import email</p>
      </div>

      <Tabs defaultValue="webhook" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-sm p-0.5 flex-wrap h-auto gap-0.5">
          <TabsTrigger
            value="webhook"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-webhook"
          >
            <Lightning size={14} className="mr-2" />
            Power Automate
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-manual"
          >
            <ClipboardText size={14} className="mr-2" />
            Import Email
          </TabsTrigger>
          <TabsTrigger
            value="alerts"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-alerts"
          >
            <Bell size={14} className="mr-2" />
            Alerte Email
          </TabsTrigger>
          <TabsTrigger
            value="email"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-email"
          >
            <EnvelopeSimple size={14} className="mr-2" />
            Office 365
          </TabsTrigger>
          <TabsTrigger
            value="imap"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-imap"
          >
            <EnvelopeOpen size={14} className="mr-2" />
            IMAP Inbox
          </TabsTrigger>
          <TabsTrigger
            value="platforms"
            className="rounded-sm data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 text-sm px-4"
            data-testid="settings-tab-platforms"
          >
            <HardDrive size={14} className="mr-2" />
            Platforme
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ WEBHOOK TAB ═══════════ */}
        <TabsContent value="webhook" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Webhook Config */}
            <div className="space-y-6">
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="webhook-config-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <Lightning size={20} weight="duotone" className="text-amber-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Webhook Power Automate
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  {/* Webhook URL */}
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">URL Webhook</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        readOnly
                        value={webhookUrl}
                        className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs rounded-sm flex-1"
                        data-testid="webhook-url-input"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookUrl)}
                        className="px-3 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 hover:text-white transition-all"
                        data-testid="copy-webhook-url-btn"
                        title="Copiaza URL"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Webhook Token */}
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Token Secret</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        readOnly
                        value={webhookSettings?.webhook_token || "Se incarca..."}
                        className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs rounded-sm flex-1"
                        data-testid="webhook-token-input"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookSettings?.webhook_token || "")}
                        className="px-3 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 hover:text-white transition-all"
                        data-testid="copy-webhook-token-btn"
                        title="Copiaza Token"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={handleRegenerateToken}
                        className="px-3 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 hover:text-white transition-all"
                        data-testid="regenerate-token-btn"
                        title="Regenereaza Token"
                      >
                        <ArrowClockwise size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Folder Path */}
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Folder Email Monitorizat</Label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <FolderOpen size={16} className="text-zinc-500 shrink-0" />
                      <Input
                        value={webhookSettings?.folder_path || "Inbox/Backup Clienti"}
                        onChange={(e) => setWebhookSettings(prev => ({ ...prev, folder_path: e.target.value }))}
                        className="bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                        data-testid="webhook-folder-input"
                      />
                    </div>
                  </div>

                  {/* Auto Match Company */}
                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Potrivire automata companie</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Detecteaza automat compania din continutul email-ului</p>
                    </div>
                    <Switch
                      checked={webhookSettings?.auto_match_company ?? true}
                      onCheckedChange={(v) => setWebhookSettings(prev => ({ ...prev, auto_match_company: v }))}
                      data-testid="webhook-auto-match-toggle"
                    />
                  </div>

                  {/* Default Company */}
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Companie Implicita (fallback)</Label>
                    <Select
                      value={webhookSettings?.default_company_id || "none"}
                      onValueChange={(v) => setWebhookSettings(prev => ({ ...prev, default_company_id: v === "none" ? "" : v }))}
                    >
                      <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="webhook-default-company-select">
                        <SelectValue placeholder="Fara companie implicita" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                        <SelectItem value="none">Fara companie implicita</SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <button
                    onClick={handleSaveWebhook}
                    disabled={savingWebhook}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
                    data-testid="save-webhook-settings-btn"
                  >
                    <FloppyDisk size={14} />
                    {savingWebhook ? "Se salveaza..." : "Salveaza Setari Webhook"}
                  </button>
                </CardContent>
              </Card>

              {/* Webhook Log */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="webhook-log-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link size={18} weight="duotone" className="text-zinc-400" />
                      <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                        Jurnal Webhook
                      </CardTitle>
                    </div>
                    <button
                      onClick={loadWebhookData}
                      className="text-[10px] font-mono text-zinc-600 hover:text-white transition-colors uppercase tracking-wider"
                      data-testid="refresh-webhook-log-btn"
                    >
                      Actualizeaza
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {webhookLog.length === 0 ? (
                    <div className="text-center py-8 px-6">
                      <Lightning size={28} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600 font-mono">Niciun webhook primit inca</p>
                      <p className="text-[10px] text-zinc-700 mt-1">Configureaza Power Automate pentru a incepe</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pl-6">Data</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Subject</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Companie</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Platforma</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pr-6">Intrari</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookLog.map((log) => (
                          <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-900/50">
                            <TableCell className="font-mono text-[10px] text-zinc-500 pl-6">
                              {log.received_at ? new Date(log.received_at).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate">{log.subject}</TableCell>
                            <TableCell className="text-xs text-zinc-400">{log.company_name}</TableCell>
                            <TableCell className="font-mono text-xs text-zinc-400">{log.platform}</TableCell>
                            <TableCell className="font-mono text-xs text-zinc-300 pr-6">{log.entries_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Power Automate Instructions */}
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm h-fit" data-testid="webhook-instructions-card">
              <CardHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <Info size={20} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Ghid Configurare Power Automate
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-5 text-sm text-zinc-400">
                  <div className="p-3 border border-amber-500/20 rounded-sm bg-amber-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightning size={14} weight="fill" className="text-amber-400" />
                      <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">Automatizare Gratuita</span>
                    </div>
                    <p className="text-xs text-zinc-400">Power Automate este inclus in licenta Microsoft 365. Nu necesita acces admin.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-white text-sm font-medium">Pasi de configurare:</h4>
                    <ol className="space-y-4 list-none">
                      <li className="flex items-start gap-3">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0 w-5 h-5 border border-zinc-800 rounded-sm flex items-center justify-center">1</span>
                        <div>
                          <span className="text-zinc-300">Accesati <span className="font-mono text-amber-300">flow.microsoft.com</span></span>
                          <p className="text-[11px] text-zinc-600 mt-0.5">Logati-va cu contul Microsoft 365</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0 w-5 h-5 border border-zinc-800 rounded-sm flex items-center justify-center">2</span>
                        <div>
                          <span className="text-zinc-300">Creati un <span className="text-white">Automated cloud flow</span></span>
                          <p className="text-[11px] text-zinc-600 mt-0.5">Trigger: "When a new email arrives (V3)" - Office 365 Outlook</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0 w-5 h-5 border border-zinc-800 rounded-sm flex items-center justify-center">3</span>
                        <div>
                          <span className="text-zinc-300">Configurati trigger-ul</span>
                          <p className="text-[11px] text-zinc-600 mt-0.5">Folder: <span className="font-mono text-zinc-400">{webhookSettings?.folder_path || "Inbox/Backup Clienti"}</span></p>
                          <p className="text-[11px] text-zinc-600">Include Attachments: No</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0 w-5 h-5 border border-zinc-800 rounded-sm flex items-center justify-center">4</span>
                        <div>
                          <span className="text-zinc-300">Adaugati actiune: <span className="text-white">HTTP</span></span>
                          <div className="mt-2 p-3 bg-black border border-zinc-800 rounded-sm space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-zinc-600 uppercase w-16">Method</span>
                              <code className="text-xs font-mono text-emerald-400">POST</code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-zinc-600 uppercase w-16">URI</span>
                              <code className="text-[10px] font-mono text-zinc-300 break-all">{webhookUrl || "[URL-ul webhook din stanga]"}</code>
                            </div>
                            <div>
                              <span className="text-[10px] font-mono text-zinc-600 uppercase">Headers</span>
                              <code className="text-[10px] font-mono text-zinc-400 block mt-1">Content-Type: application/json</code>
                            </div>
                            <div>
                              <span className="text-[10px] font-mono text-zinc-600 uppercase">Body</span>
                              <pre className="text-[10px] font-mono text-zinc-400 mt-1 whitespace-pre-wrap">{`{
  "token": "${webhookSettings?.webhook_token ? webhookSettings.webhook_token.slice(0, 8) + '...' : '[TOKEN]'}",
  "subject": "@{triggerOutputs()?['body/subject']}",
  "body": "@{triggerOutputs()?['body/body']}",
  "from": "@{triggerOutputs()?['body/from']}",
  "received_date": "@{triggerOutputs()?['body/receivedDateTime']}"
}`}</pre>
                            </div>
                          </div>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0 w-5 h-5 border border-zinc-800 rounded-sm flex items-center justify-center">5</span>
                        <div>
                          <span className="text-zinc-300">Salvati si activati flow-ul</span>
                          <p className="text-[11px] text-zinc-600 mt-0.5">Email-urile noi din folderul specificat vor fi procesate automat</p>
                        </div>
                      </li>
                    </ol>
                  </div>

                  <div className="p-3 border border-zinc-800 rounded-sm bg-black/50">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={14} weight="duotone" className="text-emerald-400" />
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Platforme Suportate</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["Proxmox", "Synology", "QNAP", "Veeam"].map(p => (
                        <span key={p} className="text-[10px] font-mono px-2 py-0.5 border border-zinc-800 rounded-sm text-zinc-400">{p}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-2">Email-urile sunt parsate automat. Compania este detectata din email patterns sau continut.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ MANUAL EMAIL TAB ═══════════ */}
        <TabsContent value="manual" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="manual-email-card">
              <CardHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardText size={20} weight="duotone" className="text-cyan-400" />
                  <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Import Manual din Email
                  </CardTitle>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Copiaza continutul unui email de backup si importa-l manual</p>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-4">
                {/* Company Selection */}
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Companie</Label>
                  <Select
                    value={emailImport.company_id || "auto"}
                    onValueChange={(v) => {
                      if (v === "auto") {
                        setEmailImport(prev => ({ ...prev, company_id: "", company_name: "" }));
                      } else {
                        const comp = companies.find(c => c.id === v);
                        setEmailImport(prev => ({ ...prev, company_id: v, company_name: comp?.name || "" }));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="manual-company-select">
                      <SelectValue placeholder="Detectare automata" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                      <SelectItem value="auto">Detectare automata</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Subject Email</Label>
                  <Input
                    data-testid="manual-email-subject"
                    value={emailImport.subject}
                    onChange={(e) => setEmailImport(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="ex: vzdump backup status (pve01) - OK"
                    className="mt-1.5 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                  />
                </div>

                {/* Body */}
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Continut Email (Body)</Label>
                  <textarea
                    data-testid="manual-email-body"
                    value={emailImport.body}
                    onChange={(e) => setEmailImport(prev => ({ ...prev, body: e.target.value }))}
                    placeholder="Lipiti aici continutul email-ului de backup (text sau HTML)..."
                    rows={10}
                    className="mt-1.5 w-full bg-black border border-zinc-800 text-white font-mono text-xs rounded-sm p-3 resize-y focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleParsePreview}
                    disabled={parsing}
                    className="flex items-center gap-2 px-4 py-2 border border-zinc-800 text-zinc-300 rounded-sm hover:bg-zinc-900 transition-all text-sm disabled:opacity-50"
                    data-testid="preview-email-btn"
                  >
                    <Eye size={14} />
                    {parsing ? "Se parseaza..." : "Previzualizeaza"}
                  </button>
                  <button
                    onClick={handleImportEmail}
                    disabled={importing}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
                    data-testid="import-email-btn"
                  >
                    <PaperPlaneTilt size={14} />
                    {importing ? "Se importa..." : "Importa Backup"}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Preview Panel */}
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm h-fit" data-testid="parse-preview-card">
              <CardHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <Eye size={20} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Previzualizare Parsare
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                {!parsePreview ? (
                  <div className="text-center py-8">
                    <ClipboardText size={32} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-600 font-mono">Lipiti un email si apasati "Previzualizeaza"</p>
                    <p className="text-[10px] text-zinc-700 mt-1">Se detecteaza automat platforma si statusul</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Detected Platform */}
                    <div className="flex items-center gap-3 p-3 border border-zinc-800 rounded-sm">
                      <HardDrive size={18} weight="duotone" className="text-zinc-400" />
                      <div>
                        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Platforma Detectata</div>
                        <div className="text-sm text-white font-medium">{parsePreview.platform}</div>
                      </div>
                      <div className="ml-auto">
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-sm">{parsePreview.count} {parsePreview.count === 1 ? "intrare" : "intrari"}</span>
                      </div>
                    </div>

                    {/* Parsed Entries */}
                    <div className="space-y-2">
                      {parsePreview.parsed_entries?.map((entry, idx) => {
                        const st = STATUS_ICONS[entry.status] || STATUS_ICONS.warning;
                        const StIcon = st.icon;
                        return (
                          <div key={idx} className={`p-3 border border-zinc-800 rounded-sm ${st.bg}`} data-testid={`preview-entry-${idx}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <StIcon size={14} weight="fill" className={st.color} />
                              <span className={`text-xs font-mono ${st.color}`}>
                                {entry.status === "success" ? "SUCCES" : entry.status === "failed" ? "ESUAT" : "AVERTISMENT"}
                              </span>
                              {entry.vm_name && (
                                <span className="text-[10px] font-mono text-zinc-500 ml-auto">{entry.vm_name}</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                              {entry.size && (
                                <div>
                                  <span className="text-zinc-600">Dimensiune: </span>
                                  <span className="text-zinc-300">{entry.size}</span>
                                </div>
                              )}
                              {entry.duration && (
                                <div>
                                  <span className="text-zinc-600">Durata: </span>
                                  <span className="text-zinc-300">{entry.duration}</span>
                                </div>
                              )}
                            </div>
                            {entry.details && (
                              <p className="text-[10px] font-mono text-zinc-600 mt-2 line-clamp-2">{entry.details.slice(0, 200)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ ALERTE EMAIL TAB ═══════════ */}
        <TabsContent value="alerts" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: SMTP + Recipients */}
            <div className="space-y-6">
              {/* SMTP Config */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="smtp-settings-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <EnvelopeSimple size={20} weight="duotone" className="text-rose-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Configurare SMTP
                    </CardTitle>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Server-ul SMTP folosit pentru trimiterea alertelor pe email</p>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Host SMTP</Label>
                      <Input
                        data-testid="smtp-host-input"
                        value={smtpSettings.smtp_host}
                        onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                        placeholder="smtp.office365.com"
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Port</Label>
                      <Input
                        data-testid="smtp-port-input"
                        type="number"
                        value={smtpSettings.smtp_port}
                        onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Username</Label>
                    <Input
                      data-testid="smtp-username-input"
                      value={smtpSettings.smtp_username}
                      onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_username: e.target.value }))}
                      placeholder="user@companie.ro"
                      className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola</Label>
                    <Input
                      data-testid="smtp-password-input"
                      type="password"
                      value={smtpSettings.smtp_password}
                      onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_password: e.target.value }))}
                      placeholder="••••••••"
                      className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Adresa From</Label>
                      <Input
                        data-testid="smtp-from-input"
                        value={smtpSettings.from_address}
                        onChange={(e) => setSmtpSettings(prev => ({ ...prev, from_address: e.target.value }))}
                        placeholder="alerte@companie.ro"
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Nume From</Label>
                      <Input
                        data-testid="smtp-from-name-input"
                        value={smtpSettings.from_name}
                        onChange={(e) => setSmtpSettings(prev => ({ ...prev, from_name: e.target.value }))}
                        placeholder="Backup Monitor"
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Foloseste TLS/STARTTLS</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Recomandat pentru Office 365, Gmail</p>
                    </div>
                    <Switch
                      checked={smtpSettings.use_tls}
                      onCheckedChange={(v) => setSmtpSettings(prev => ({ ...prev, use_tls: v }))}
                      data-testid="smtp-tls-toggle"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveSmtp}
                      disabled={savingSmtp}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
                      data-testid="save-smtp-btn"
                    >
                      <FloppyDisk size={14} />
                      {savingSmtp ? "Se salveaza..." : "Salveaza SMTP"}
                    </button>
                    <button
                      onClick={handleTestSmtp}
                      disabled={testingSmtp}
                      className="flex items-center gap-2 px-4 py-2 border border-zinc-800 text-zinc-300 rounded-sm hover:bg-zinc-900 transition-all text-sm disabled:opacity-50"
                      data-testid="test-smtp-btn"
                    >
                      <PaperPlaneRight size={14} />
                      {testingSmtp ? "Se trimite..." : "Trimite Email Test"}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Recipients */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="alert-recipients-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <At size={20} weight="duotone" className="text-cyan-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Destinatari Alerte
                    </CardTitle>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Persoanele care vor primi email-urile de alerta</p>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  {/* Add recipient form */}
                  <div className="flex gap-2">
                    <Input
                      data-testid="recipient-email-input"
                      value={newRecipient.email}
                      onChange={(e) => setNewRecipient(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="email@companie.ro"
                      className="bg-black border-zinc-800 text-white font-mono text-sm rounded-sm flex-1"
                    />
                    <Input
                      data-testid="recipient-name-input"
                      value={newRecipient.name}
                      onChange={(e) => setNewRecipient(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nume (optional)"
                      className="bg-black border-zinc-800 text-white text-sm rounded-sm w-40"
                    />
                    <button
                      onClick={handleAddRecipient}
                      className="px-3 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm shrink-0"
                      data-testid="add-recipient-btn"
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>

                  {/* Recipients list */}
                  {alertRecipients.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-zinc-800 rounded-sm">
                      <At size={24} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600 font-mono">Niciun destinatar adaugat</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {alertRecipients.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-2.5 border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors"
                          data-testid={`recipient-${r.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-sm bg-zinc-800 flex items-center justify-center text-xs font-mono text-zinc-400">
                              {(r.name || r.email).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm text-white">{r.name || r.email}</div>
                              {r.name && <div className="text-[10px] font-mono text-zinc-600">{r.email}</div>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteRecipient(r.id)}
                            className="text-zinc-600 hover:text-rose-400 transition-colors p-1"
                            data-testid={`delete-recipient-${r.id}`}
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Check Settings + History + Manual Trigger */}
            <div className="space-y-6">
              {/* Auto Check Settings */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="alert-check-settings-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <Clock size={20} weight="duotone" className="text-amber-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Verificare Automata
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Verificare automata activa</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Verifica si trimite alerte periodic</p>
                    </div>
                    <Switch
                      checked={alertCheckSettings.enabled}
                      onCheckedChange={(v) => setAlertCheckSettings(prev => ({ ...prev, enabled: v }))}
                      data-testid="alert-auto-check-toggle"
                    />
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Interval verificare (ore)</Label>
                    <Select
                      value={String(alertCheckSettings.interval_hours)}
                      onValueChange={(v) => setAlertCheckSettings(prev => ({ ...prev, interval_hours: parseInt(v) }))}
                    >
                      <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="alert-interval-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                        <SelectItem value="1">La fiecare 1 ora</SelectItem>
                        <SelectItem value="3">La fiecare 3 ore</SelectItem>
                        <SelectItem value="6">La fiecare 6 ore</SelectItem>
                        <SelectItem value="12">La fiecare 12 ore</SelectItem>
                        <SelectItem value="24">La fiecare 24 ore</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {alertCheckSettings.last_check && (
                    <div className="p-2 bg-black/50 border border-zinc-800 rounded-sm">
                      <span className="text-[10px] font-mono text-zinc-600">Ultima verificare: </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {new Date(alertCheckSettings.last_check).toLocaleString("ro-RO")}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveAlertCheck}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm"
                      data-testid="save-alert-check-btn"
                    >
                      <FloppyDisk size={14} />
                      Salveaza
                    </button>
                    <button
                      onClick={handleCheckAndNotify}
                      disabled={checkingAlerts}
                      className="flex items-center gap-2 px-4 py-2 border border-rose-500/30 text-rose-400 rounded-sm hover:bg-rose-500/10 transition-all text-sm disabled:opacity-50"
                      data-testid="check-and-notify-btn"
                    >
                      <Bell size={14} weight="fill" />
                      {checkingAlerts ? "Se verifica..." : "Verifica si Trimite Alerte Acum"}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* What triggers alerts */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="alert-info-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <Info size={20} weight="duotone" className="text-zinc-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Ce declanseaza alertele?
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <div className="flex items-start gap-3 p-3 border border-rose-500/15 rounded-sm bg-rose-500/5">
                    <XCircle size={16} weight="fill" className="text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-rose-400">Backup Esuat</div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Cand se primeste un raport cu status "failed" - cu detalii despre companie, platforma si data</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border border-amber-500/15 rounded-sm bg-amber-500/5">
                    <Warning size={16} weight="fill" className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-amber-400">Backup Lipsa</div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Cand o companie nu a trimis backup in intervalul configurat (threshold per companie) - cu detalii despre ultimul backup primit</p>
                    </div>
                  </div>
                  <div className="p-3 border border-zinc-800 rounded-sm bg-black/50">
                    <p className="text-[11px] text-zinc-500">
                      Email-ul contine un tabel HTML cu toate alertele: companie, platforma, status, data si detalii.
                      Threshold-ul per companie se configureaza in sectiunea Companii.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Email History */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="alert-history-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={18} weight="duotone" className="text-zinc-400" />
                      <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                        Istoric Alerte Trimise
                      </CardTitle>
                    </div>
                    <button
                      onClick={loadAlertData}
                      className="text-[10px] font-mono text-zinc-600 hover:text-white transition-colors uppercase tracking-wider"
                      data-testid="refresh-alert-history-btn"
                    >
                      Actualizeaza
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {alertHistory.length === 0 ? (
                    <div className="text-center py-8 px-6">
                      <Bell size={28} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600 font-mono">Niciun email de alerta trimis inca</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pl-6">Data</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Alerte</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Destinatari</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pr-6">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertHistory.map((h) => (
                          <TableRow key={h.id} className="border-zinc-800 hover:bg-zinc-900/50">
                            <TableCell className="font-mono text-[10px] text-zinc-500 pl-6">
                              {h.sent_at ? new Date(h.sent_at).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="text-rose-400 font-mono">{h.failed_count || 0}</span>
                              <span className="text-zinc-600 mx-1">/</span>
                              <span className="text-amber-400 font-mono">{h.missing_count || 0}</span>
                            </TableCell>
                            <TableCell className="font-mono text-[10px] text-zinc-500">{h.recipients?.length || 0} pers.</TableCell>
                            <TableCell className="pr-6">
                              {h.success ? (
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-sm">Trimis</span>
                              ) : (
                                <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-sm">Eroare</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ EMAIL SETTINGS TAB ═══════════ */}
        <TabsContent value="email" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="email-settings-card">
              <CardHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <MicrosoftOutlookLogo size={20} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Configurare Microsoft Office 365
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-4">
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Client ID (Application ID)</Label>
                  <Input
                    data-testid="email-client-id-input"
                    value={emailSettings.client_id}
                    onChange={(e) => setEmailSettings({ ...emailSettings, client_id: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="mt-1.5 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                  />
                </div>

                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Tenant ID</Label>
                  <Input
                    data-testid="email-tenant-id-input"
                    value={emailSettings.tenant_id}
                    onChange={(e) => setEmailSettings({ ...emailSettings, tenant_id: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="mt-1.5 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                  />
                </div>

                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Client Secret</Label>
                  <Input
                    data-testid="email-client-secret-input"
                    type="password"
                    value={emailSettings.client_secret}
                    onChange={(e) => setEmailSettings({ ...emailSettings, client_secret: e.target.value })}
                    placeholder="••••••••••••"
                    className="mt-1.5 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                  />
                </div>

                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Adresa Email Monitorizata</Label>
                  <Input
                    data-testid="email-address-input"
                    type="email"
                    value={emailSettings.email_address}
                    onChange={(e) => setEmailSettings({ ...emailSettings, email_address: e.target.value })}
                    placeholder="backups@companie.ro"
                    className="mt-1.5 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveEmail}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
                    data-testid="save-email-settings-btn"
                  >
                    <FloppyDisk size={14} />
                    {saving ? "Se salveaza..." : "Salveaza"}
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 border border-zinc-800 text-zinc-300 rounded-sm hover:bg-zinc-900 transition-all text-sm disabled:opacity-50"
                    data-testid="test-email-connection-btn"
                  >
                    <Plugs size={14} />
                    {testing ? "Se testeaza..." : "Testeaza Conexiunea"}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="email-instructions-card">
              <CardHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <Info size={20} weight="duotone" className="text-zinc-400" />
                  <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                    Ghid Configurare Azure AD
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-4 text-sm text-zinc-400">
                  <div className="space-y-2">
                    <h4 className="text-white text-sm font-medium">Pasii de configurare:</h4>
                    <ol className="space-y-3 list-none">
                      <li className="flex items-start gap-2">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0">01</span>
                        <span>Accesati <span className="font-mono text-zinc-300">portal.azure.com</span> si navigati la Azure Active Directory (Microsoft Entra ID)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0">02</span>
                        <span>Selectati <span className="text-zinc-300">App registrations</span> si creati o aplicatie noua</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0">03</span>
                        <span>Adaugati permisiunile: <span className="font-mono text-zinc-300">Mail.Read</span> si <span className="font-mono text-zinc-300">User.Read</span></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0">04</span>
                        <span>Creati un <span className="text-zinc-300">Client Secret</span> in sectiunea Certificates & Secrets</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-xs font-mono text-zinc-600 mt-0.5 shrink-0">05</span>
                        <span>Copiati <span className="font-mono text-zinc-300">Application ID</span>, <span className="font-mono text-zinc-300">Tenant ID</span> si <span className="font-mono text-zinc-300">Secret</span> in campurile din stanga</span>
                      </li>
                    </ol>
                  </div>

                  <div className="p-3 border border-zinc-800 rounded-sm bg-black/50">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={14} weight="duotone" className="text-emerald-400" />
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Permisiuni necesare</span>
                    </div>
                    <code className="text-xs font-mono text-zinc-400 block">Microsoft Graph: Mail.Read (Delegated)</code>
                    <code className="text-xs font-mono text-zinc-400 block">Microsoft Graph: User.Read (Delegated)</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ IMAP SETTINGS TAB ═══════════ */}
        <TabsContent value="imap" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* IMAP Config */}
            <div className="space-y-6">
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="imap-settings-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <EnvelopeOpen size={20} weight="duotone" className="text-violet-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Configurare IMAP
                    </CardTitle>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Citeste email-urile de backup direct din serverul de mail</p>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Host IMAP</Label>
                      <Input
                        data-testid="imap-host-input"
                        value={imapSettings.imap_host}
                        onChange={(e) => setImapSettings(prev => ({ ...prev, imap_host: e.target.value }))}
                        placeholder="imap.office365.com"
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Port</Label>
                      <Input
                        data-testid="imap-port-input"
                        type="number"
                        value={imapSettings.imap_port}
                        onChange={(e) => setImapSettings(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))}
                        className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Username / Email</Label>
                    <Input
                      data-testid="imap-username-input"
                      value={imapSettings.imap_username}
                      onChange={(e) => setImapSettings(prev => ({ ...prev, imap_username: e.target.value }))}
                      placeholder="backups@companie.ro"
                      className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Parola</Label>
                    <Input
                      data-testid="imap-password-input"
                      type="password"
                      value={imapSettings.imap_password}
                      onChange={(e) => setImapSettings(prev => ({ ...prev, imap_password: e.target.value }))}
                      placeholder="••••••••"
                      className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Folder</Label>
                    <Input
                      data-testid="imap-folder-input"
                      value={imapSettings.folder}
                      onChange={(e) => setImapSettings(prev => ({ ...prev, folder: e.target.value }))}
                      placeholder="INBOX"
                      className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm rounded-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Foloseste SSL</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Recomandat pentru port 993</p>
                    </div>
                    <Switch
                      checked={imapSettings.use_ssl}
                      onCheckedChange={(v) => setImapSettings(prev => ({ ...prev, use_ssl: v }))}
                      data-testid="imap-ssl-toggle"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Marcheaza ca citit</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Marcheaza email-urile procesate ca citite</p>
                    </div>
                    <Switch
                      checked={imapSettings.mark_as_read}
                      onCheckedChange={(v) => setImapSettings(prev => ({ ...prev, mark_as_read: v }))}
                      data-testid="imap-mark-read-toggle"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Citeste toate email-urile</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Include si email-urile deja citite</p>
                    </div>
                    <Switch
                      checked={imapSettings.fetch_all_emails}
                      onCheckedChange={(v) => setImapSettings(prev => ({ ...prev, fetch_all_emails: v }))}
                      data-testid="imap-fetch-all-toggle"
                    />
                  </div>

                  {imapSettings.fetch_all_emails && (
                    <div>
                      <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Email-uri din ultimele (zile)</Label>
                      <Select
                        value={String(imapSettings.days_to_fetch)}
                        onValueChange={(v) => setImapSettings(prev => ({ ...prev, days_to_fetch: parseInt(v) }))}
                      >
                        <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="imap-days-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                          <SelectItem value="1">1 zi</SelectItem>
                          <SelectItem value="3">3 zile</SelectItem>
                          <SelectItem value="7">7 zile</SelectItem>
                          <SelectItem value="14">14 zile</SelectItem>
                          <SelectItem value="30">30 zile</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveImap}
                      disabled={savingImap}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm disabled:opacity-50"
                      data-testid="save-imap-btn"
                    >
                      <FloppyDisk size={14} />
                      {savingImap ? "Se salveaza..." : "Salveaza IMAP"}
                    </button>
                    <button
                      onClick={handleTestImap}
                      disabled={testingImap}
                      className="flex items-center gap-2 px-4 py-2 border border-zinc-800 text-zinc-300 rounded-sm hover:bg-zinc-900 transition-all text-sm disabled:opacity-50"
                      data-testid="test-imap-btn"
                    >
                      <Plugs size={14} />
                      {testingImap ? "Se testeaza..." : "Test Conexiune"}
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Auto Sync Settings */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="imap-sync-settings-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <ArrowsClockwise size={20} weight="duotone" className="text-cyan-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Sincronizare Automata
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-sm">
                    <div>
                      <Label className="text-zinc-300 text-sm">Sincronizare automata activa</Label>
                      <p className="text-xs text-zinc-600 mt-0.5">Verifica email-uri noi la fiecare minut</p>
                    </div>
                    <Switch
                      checked={imapSettings.auto_sync_enabled}
                      onCheckedChange={(v) => setImapSettings(prev => ({ ...prev, auto_sync_enabled: v }))}
                      data-testid="imap-auto-sync-toggle"
                    />
                  </div>

                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Interval sincronizare (minute)</Label>
                    <Select
                      value={String(imapSettings.sync_interval_minutes)}
                      onValueChange={(v) => setImapSettings(prev => ({ ...prev, sync_interval_minutes: parseInt(v) }))}
                    >
                      <SelectTrigger className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm" data-testid="imap-interval-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 rounded-sm">
                        <SelectItem value="1">La fiecare 1 minut</SelectItem>
                        <SelectItem value="2">La fiecare 2 minute</SelectItem>
                        <SelectItem value="5">La fiecare 5 minute</SelectItem>
                        <SelectItem value="10">La fiecare 10 minute</SelectItem>
                        <SelectItem value="15">La fiecare 15 minute</SelectItem>
                        <SelectItem value="30">La fiecare 30 minute</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {imapSettings.last_sync && (
                    <div className="p-2 bg-black/50 border border-zinc-800 rounded-sm">
                      <span className="text-[10px] font-mono text-zinc-600">Ultima sincronizare: </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {new Date(imapSettings.last_sync).toLocaleString("ro-RO")}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveImap}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm"
                      data-testid="save-imap-sync-btn"
                    >
                      <FloppyDisk size={14} />
                      Salveaza
                    </button>
                    <button
                      onClick={handleSyncImap}
                      disabled={syncingImap}
                      className="flex items-center gap-2 px-4 py-2 border border-violet-500/30 text-violet-400 rounded-sm hover:bg-violet-500/10 transition-all text-sm disabled:opacity-50"
                      data-testid="sync-imap-now-btn"
                    >
                      <DownloadSimple size={14} weight="bold" />
                      {syncingImap ? "Se sincronizeaza..." : "Sync Now"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Sync Log + Info */}
            <div className="space-y-6">
              {/* IMAP Sync Log */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="imap-sync-log-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={18} weight="duotone" className="text-zinc-400" />
                      <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                        Jurnal Sincronizare IMAP
                      </CardTitle>
                    </div>
                    <button
                      onClick={loadImapData}
                      className="text-[10px] font-mono text-zinc-600 hover:text-white transition-colors uppercase tracking-wider"
                      data-testid="refresh-imap-log-btn"
                    >
                      Actualizeaza
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {imapSyncLog.length === 0 ? (
                    <div className="text-center py-8 px-6">
                      <EnvelopeOpen size={28} weight="duotone" className="text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600 font-mono">Nicio sincronizare IMAP inca</p>
                      <p className="text-[10px] text-zinc-700 mt-1">Configureaza IMAP si apasa Sync Now</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pl-6">Data</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Tip</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Email-uri</TableHead>
                          <TableHead className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider pr-6">Backup-uri</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {imapSyncLog.map((log) => (
                          <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-900/50">
                            <TableCell className="font-mono text-[10px] text-zinc-500 pl-6">
                              {log.synced_at ? new Date(log.synced_at).toLocaleString("ro-RO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm ${log.sync_type === "auto" ? "bg-cyan-500/10 text-cyan-400" : "bg-violet-500/10 text-violet-400"}`}>
                                {log.sync_type === "auto" ? "Auto" : "Manual"}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-zinc-400">{log.emails_processed}</TableCell>
                            <TableCell className="font-mono text-xs text-emerald-400 pr-6">{log.backups_created}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="imap-info-card">
                <CardHeader className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2">
                    <Info size={20} weight="duotone" className="text-zinc-400" />
                    <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                      Informatii IMAP
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <div className="p-3 border border-violet-500/20 rounded-sm bg-violet-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      <EnvelopeOpen size={14} weight="fill" className="text-violet-400" />
                      <span className="text-xs font-mono text-violet-400 uppercase tracking-wider">Citire Email Directa</span>
                    </div>
                    <p className="text-xs text-zinc-400">Citeste email-urile direct din serverul IMAP fara a necesita Power Automate sau alte configurari complexe.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-white text-sm font-medium">Setari comune IMAP:</h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between p-2 bg-black/50 rounded-sm">
                        <span className="text-zinc-500">Office 365</span>
                        <span className="font-mono text-zinc-300">outlook.office365.com:993</span>
                      </div>
                      <div className="flex justify-between p-2 bg-black/50 rounded-sm">
                        <span className="text-zinc-500">Gmail</span>
                        <span className="font-mono text-zinc-300">imap.gmail.com:993</span>
                      </div>
                      <div className="flex justify-between p-2 bg-black/50 rounded-sm">
                        <span className="text-zinc-500">Yahoo</span>
                        <span className="font-mono text-zinc-300">imap.mail.yahoo.com:993</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 border border-zinc-800 rounded-sm bg-black/50">
                    <p className="text-[11px] text-zinc-500">
                      <strong className="text-zinc-400">Nota:</strong> Pentru Gmail si Office 365 cu 2FA activat, folositi o parola de aplicatie in loc de parola contului.
                    </p>
                  </div>

                  <div className="p-3 border border-emerald-500/15 rounded-sm bg-emerald-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={14} weight="fill" className="text-emerald-400" />
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Platforme Suportate</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["Proxmox", "Synology", "QNAP", "Veeam"].map(p => (
                        <span key={p} className="text-[10px] font-mono px-2 py-0.5 border border-zinc-800 rounded-sm text-zinc-400">{p}</span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ PLATFORMS TAB ═══════════ */}
        <TabsContent value="platforms" className="mt-4">
          <Card className="border-zinc-800 bg-zinc-950 rounded-sm" data-testid="platforms-card">
            <CardHeader className="px-6 pt-6 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>
                  Platforme de Backup
                </CardTitle>
                <button
                  onClick={() => setNewPlatformOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-xs"
                  data-testid="add-platform-btn"
                >
                  <Plus size={14} weight="bold" />
                  Adauga
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {platforms.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors text-center"
                    data-testid={`platform-card-${p.id}`}
                  >
                    <HardDrive size={28} weight="duotone" className="text-zinc-400 mx-auto mb-2" />
                    <div className="text-sm text-white font-medium">{p.name}</div>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase mt-1">{p.id}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Platform Dialog */}
      <Dialog open={newPlatformOpen} onOpenChange={setNewPlatformOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-sm max-w-sm" data-testid="new-platform-dialog">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: 'Chivo, sans-serif' }}>Adauga Platforma</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Adauga o noua platforma de backup
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider font-mono">Nume Platforma</Label>
              <Input
                data-testid="new-platform-name-input"
                value={newPlatform.name}
                onChange={(e) => setNewPlatform({ ...newPlatform, name: e.target.value })}
                placeholder="ex: Acronis"
                className="mt-1.5 bg-black border-zinc-800 text-white rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setNewPlatformOpen(false)}
              className="px-4 py-2 border border-zinc-800 text-zinc-400 rounded-sm hover:bg-zinc-900 transition-all text-sm"
            >
              Anuleaza
            </button>
            <button
              onClick={handleAddPlatform}
              className="px-4 py-2 bg-white text-black font-semibold rounded-sm hover:bg-zinc-200 transition-all text-sm"
              data-testid="save-platform-btn"
            >
              Adauga
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
