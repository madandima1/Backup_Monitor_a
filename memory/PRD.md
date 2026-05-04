# Backup Monitoring - PRD

## Problem Statement
Existing Backup Monitoring platform with multiple fixes needed across iterations.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React with Tailwind CSS on port 3000
- **Database**: MongoDB
- **Email**: IMAP integration (mail.theit.ro:993)

## What's Been Implemented

### Iteration 1 (2026-04-03)
1. **Veeam Email Parser** - Rewrote for newline-separated format (forwarded emails), per-VM parsing
2. **Backup Detail Modal** - Click any row in Dashboard/History → full details
3. **Session Persistence** - 7 day token + auto-refresh interceptor
4. **Backup Date Extraction** - From email body (Romanian, English, dd.mm.yyyy, Proxmox timestamps)
5. **System Alerts** - UPS/security/hardware alerts classified separately, dedicated page

### Iteration 2 (2026-04-03)
1. **Multi-format Veeam Parser** - Handles:
   - VM Backup 24h (CG&GC: 02:00:31)
   - VM Backup AM/PM (Sogefi: 8:02:05 AM)  
   - File Backup (different columns: Duration, Backed up files, Size, Transferred, Archived)
   - Configuration Backup (Catalog table)
2. **Dimensiune = Transferred** - Column now shows transferred data, not full VM size
3. **Spatiu Total column** - New column in Dashboard + History showing full VM size
4. **English date parsing** - "Thursday, April 2, 2026" format for Sogefi emails
5. **Fresh IMAP sync** - 111 backups + 2 system alerts from 50 emails

## Backlog
- P1: Email notification when backup fails
- P1: Company email patterns for Sogefi matching
- P2: PDF report generation per company
- P2: Backup trend analytics per VM
- P3: Duplicate prevention on re-sync
