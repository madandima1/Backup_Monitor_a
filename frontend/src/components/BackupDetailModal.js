import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBackupDetail } from "@/lib/api";
import { CheckCircle, XCircle, Warning, HardDrive, Clock, Database, ArrowsDownUp, CalendarBlank, Tag, Info, EnvelopeSimple, Question } from "@phosphor-icons/react";

const STATUS_CONFIG = {
  success: { label: "Succes", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  failed: { label: "Esuat", icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  warning: { label: "Avertisment", icon: Warning, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
};

const isUnknown = (d) =>
  d?.is_unknown === true ||
  !d?.company_id ||
  d?.company_name === "Necunoscut" ||
  d?.platform === "Necunoscut";

function DetailRow({ icon: Icon, label, value, mono }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
      <Icon size={15} weight="duotone" className="text-zinc-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block">{label}</span>
        <span className={`text-sm text-zinc-200 block mt-0.5 ${mono ? "font-mono" : ""} break-words`}>{value}</span>
      </div>
    </div>
  );
}

export default function BackupDetailModal({ backupId, open, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && backupId) {
      setLoading(true);
      getBackupDetail(backupId)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [open, backupId]);

  const st = detail ? (STATUS_CONFIG[detail.status] || STATUS_CONFIG.warning) : null;
  const StIcon = st?.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[85vh] overflow-y-auto" data-testid="backup-detail-modal">
        <DialogHeader>
          <DialogTitle className="text-base font-mono tracking-tight text-white">
            Detalii Backup
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-zinc-500 font-mono text-sm">Se incarca...</div>
        )}

        {!loading && !detail && (
          <div className="py-8 text-center text-zinc-500 font-mono text-sm">Backup negasit</div>
        )}

        {!loading && detail && (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className={`flex items-center gap-2 p-3 rounded-sm border ${st.bg}`}>
              <StIcon size={20} weight="fill" className={st.color} />
              <span className={`text-sm font-mono font-semibold ${st.color}`}>{st.label}</span>
              {isUnknown(detail) && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30" data-testid="unknown-detail-badge">
                  <Question size={11} weight="bold" />
                  Unknown
                </span>
              )}
            </div>

            {isUnknown(detail) && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-sm p-3 text-xs text-amber-200/90 font-mono leading-relaxed">
                Acest email nu a putut fi asociat automat unei companii sau platforme cunoscute.
                Verifica detaliile de mai jos pentru a identifica expeditorul.
              </div>
            )}

            {/* Info Grid */}
            <div className="bg-zinc-900/50 rounded-sm border border-zinc-800 p-3">
              <DetailRow icon={Tag} label="Companie" value={detail.company_name || "Necunoscut"} />
              <DetailRow icon={HardDrive} label="Platforma" value={detail.platform || "Necunoscut"} />
              <DetailRow icon={CalendarBlank} label="Data Backup" value={detail.backup_date} mono />
              {detail.vm_name && <DetailRow icon={HardDrive} label="VM / Masina" value={detail.vm_name} />}
              {detail.job_name && <DetailRow icon={Tag} label="Job Name" value={detail.job_name} />}
              <DetailRow icon={Database} label="Dimensiune" value={detail.size} mono />
              <DetailRow icon={Clock} label="Durata" value={detail.duration} mono />
              {detail.start_time && <DetailRow icon={Clock} label="Ora Start" value={detail.start_time} mono />}
              {detail.end_time && <DetailRow icon={Clock} label="Ora Sfarsit" value={detail.end_time} mono />}
              {detail.read && <DetailRow icon={ArrowsDownUp} label="Citit" value={detail.read} mono />}
              {detail.transferred && <DetailRow icon={ArrowsDownUp} label="Transferat" value={detail.transferred} mono />}
              <DetailRow icon={Info} label="Sursa" value={detail.source} mono />
              {detail.from_address && <DetailRow icon={EnvelopeSimple} label="De la (From)" value={detail.from_address} mono />}
              {detail.email_date && <DetailRow icon={CalendarBlank} label="Data Email" value={detail.email_date} mono />}
              {detail.email_subject && <DetailRow icon={Info} label="Subiect Email" value={detail.email_subject} />}
            </div>

            {/* Details/Log */}
            {detail.details && (
              <div className="bg-zinc-900/50 rounded-sm border border-zinc-800 p-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-2">Detalii / Log</span>
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
                  {detail.details}
                </pre>
              </div>
            )}

            {/* Raw email body — useful especially for unknown emails */}
            {detail.email_body && (
              <div className="bg-zinc-900/50 rounded-sm border border-zinc-800 p-3" data-testid="email-body-section">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 block mb-2">Continut Email (raw)</span>
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-y-auto">
                  {detail.email_body}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
