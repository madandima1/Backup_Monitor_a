from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File
import report_export
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
import re
import csv
import io
import json as json_module
import smtplib
import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import quopri
import base64
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

# ─── Password Utils ───
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

# ─── JWT Utils ───
def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Nu sunteti autentificat")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizator negasit")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirat")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalid")

# ─── Models ───
class LoginInput(BaseModel):
    email: str
    password: str

class RegisterInput(BaseModel):
    email: str
    password: str
    name: str

class CompanyInput(BaseModel):
    name: str
    platforms: List[str] = []
    alert_threshold_hours: int = 24
    email_patterns: List[str] = []
    notes: str = ""

class BackupInput(BaseModel):
    company_id: str
    company_name: str
    platform: str
    status: str  # success, failed, warning
    details: str = ""
    backup_date: Optional[str] = None
    size: str = ""
    duration: str = ""

class PlatformInput(BaseModel):
    name: str
    icon: str = ""

class EmailSettingsInput(BaseModel):
    client_id: str
    tenant_id: str
    client_secret: str
    email_address: str = ""

class ManualEmailInput(BaseModel):
    subject: str
    body: str
    company_id: str = ""
    company_name: str = ""

class WebhookSettingsInput(BaseModel):
    folder_path: str = "Inbox/Backup Clienti"
    auto_match_company: bool = True
    default_company_id: str = ""

class SmtpSettingsInput(BaseModel):
    smtp_host: str
    smtp_port: int = 465
    smtp_username: str
    smtp_password: str
    from_address: str
    from_name: str = "Backup Monitor"
    use_tls: bool = True
    use_ssl: bool = True

class ImapSettingsInput(BaseModel):
    imap_host: str
    imap_port: int = 993
    imap_username: str
    imap_password: str
    use_ssl: bool = True
    folder: str = "INBOX"
    auto_sync_enabled: bool = True
    sync_interval_minutes: int = 1
    delete_after_import: bool = False
    mark_as_read: bool = True
    fetch_all_emails: bool = False
    days_to_fetch: int = 7

class AlertRecipientInput(BaseModel):
    email: str
    name: str = ""

class AlertCheckIntervalInput(BaseModel):
    interval_hours: int = 6
    enabled: bool = True

class AlertDismissInput(BaseModel):
    alert_id: str

class UserUpdateInput(BaseModel):
    name: str = ""
    role: str = "user"
    allowed_companies: List[str] = []

class UserCreateInput(BaseModel):
    email: str
    password: str
    name: str
    role: str = "user"
    allowed_companies: List[str] = []

class AdminResetPasswordInput(BaseModel):
    new_password: str

class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

class ConfigImportInput(BaseModel):
    companies: List[dict] = []
    platforms: List[dict] = []

def format_api_error(detail):
    if detail is None:
        return "Eroare necunoscuta"
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        return " ".join([e.get("msg", str(e)) if isinstance(e, dict) else str(e) for e in detail])
    return str(detail)

# ─── Auth Routes ───
@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request):
    email = input.email.strip().lower()
    # Brute force check
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("locked_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Prea multe incercari. Incercati din nou in 15 minute.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Email sau parola incorecta")

    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)

    response = JSONResponse(content={
        "id": user_id,
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "allowed_companies": user.get("allowed_companies", [])
    })
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=2592000, path="/")
    return response

@api_router.post("/auth/register")
async def register(input: RegisterInput):
    email = input.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Acest email este deja inregistrat")
    hashed = hash_password(input.password)
    doc = {"email": email, "password_hash": hashed, "name": input.name, "role": "user", "allowed_companies": [], "created_at": datetime.now(timezone.utc).isoformat()}
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response = JSONResponse(content={"id": user_id, "email": email, "name": input.name, "role": "user", "allowed_companies": []})
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return response

@api_router.post("/auth/logout")
async def logout():
    response = JSONResponse(content={"message": "Deconectat cu succes"})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Nu exista refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token invalid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizator negasit")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        response = JSONResponse(content={"message": "Token reinoit"})
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
        return response
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expirat")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalid")

# ─── Companies CRUD ───
@api_router.get("/companies")
async def get_companies(request: Request):
    user = await get_current_user(request)
    query = {}
    # Non-admin users only see their allowed companies
    if user.get("role") != "admin" and user.get("allowed_companies"):
        query["id"] = {"$in": user["allowed_companies"]}
    elif user.get("role") != "admin" and not user.get("allowed_companies"):
        return []
    companies = await db.companies.find(query, {"_id": 0}).to_list(1000)
    return companies

@api_router.post("/companies")
async def create_company(input: CompanyInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    doc = {
        "id": str(ObjectId()),
        "name": input.name,
        "platforms": input.platforms,
        "alert_threshold_hours": input.alert_threshold_hours,
        "email_patterns": input.email_patterns,
        "notes": input.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.companies.insert_one(doc)
    result = await db.companies.find_one({"id": doc["id"]}, {"_id": 0})
    return result

@api_router.put("/companies/{company_id}")
async def update_company(company_id: str, input: CompanyInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    update_doc = {
        "name": input.name,
        "platforms": input.platforms,
        "alert_threshold_hours": input.alert_threshold_hours,
        "email_patterns": input.email_patterns,
        "notes": input.notes
    }
    await db.companies.update_one({"id": company_id}, {"$set": update_doc})
    updated = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Companie negasita")
    return updated

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    result = await db.companies.delete_one({"id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Companie negasita")
    return {"message": "Companie stearsa"}

# ─── Platforms ───
@api_router.get("/platforms")
async def get_platforms(request: Request):
    await get_current_user(request)
    platforms = await db.platforms.find({}, {"_id": 0}).to_list(100)
    return platforms

@api_router.post("/platforms")
async def create_platform(input: PlatformInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    doc = {"id": str(ObjectId()), "name": input.name, "icon": input.icon}
    await db.platforms.insert_one(doc)
    return await db.platforms.find_one({"id": doc["id"]}, {"_id": 0})

# ─── Backups CRUD ───
@api_router.get("/backups")
async def get_backups(request: Request, company_id: str = None, platform: str = None, status: str = None, date_from: str = None, date_to: str = None, limit: int = 100, skip: int = 0, only_unknown: bool = False):
    user = await get_current_user(request)
    query = {}

    # Restrict non-admin users to their allowed companies
    is_limited = user.get("role") != "admin"
    allowed = user.get("allowed_companies") or []
    if is_limited:
        if not allowed:
            return {"backups": [], "total": 0}
        # If a specific company is requested, it must be in allowed list
        if company_id and company_id != "unknown" and company_id not in allowed:
            return {"backups": [], "total": 0}
        # Force company filter to allowed set
        if not company_id:
            query["company_id"] = {"$in": allowed}

    if company_id:
        # Special sentinel: "unknown" means unidentified company
        if company_id == "unknown":
            if is_limited:
                # Limited users do not see "unknown" backups
                return {"backups": [], "total": 0}
            query["$or"] = [{"company_id": ""}, {"company_id": None}, {"company_name": "Necunoscut"}]
        else:
            query["company_id"] = company_id
    if platform:
        # Special sentinel: "Unknown" maps to backend value "Necunoscut"
        if platform == "Unknown":
            query["platform"] = "Necunoscut"
        else:
            query["platform"] = platform
    if status:
        query["status"] = status
    if only_unknown:
        if is_limited:
            return {"backups": [], "total": 0}
        # Show only entries where neither company nor platform was identified
        query["$and"] = [
            {"$or": [{"company_id": ""}, {"company_id": None}, {"company_name": "Necunoscut"}]},
        ]
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["backup_date"] = date_filter

    backups = await db.backups.find(query, {"_id": 0}).sort("backup_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.backups.count_documents(query)
    return {"backups": backups, "total": total}

@api_router.post("/backups")
async def create_backup(input: BackupInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    doc = {
        "id": str(ObjectId()),
        "company_id": input.company_id,
        "company_name": input.company_name,
        "platform": input.platform,
        "status": input.status,
        "details": input.details,
        "backup_date": input.backup_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "size": input.size,
        "duration": input.duration,
        "source": "manual",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.backups.insert_one(doc)
    return await db.backups.find_one({"id": doc["id"]}, {"_id": 0})

@api_router.delete("/backups/{backup_id}")
async def delete_backup(backup_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    result = await db.backups.delete_one({"id": backup_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Backup negasit")
    return {"message": "Backup sters"}

@api_router.get("/backups/detail/{backup_id}")
async def get_backup_detail(backup_id: str, request: Request):
    """Get full details of a single backup entry"""
    user = await get_current_user(request)
    backup = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup negasit")
    # Limited users can only see backups for their allowed companies
    if user.get("role") != "admin":
        allowed = user.get("allowed_companies") or []
        if backup.get("company_id") not in allowed:
            raise HTTPException(status_code=403, detail="Acces interzis")
    return backup

# ─── System Alerts (non-backup alerts like UPS, login failures) ───
@api_router.get("/system-alerts")
async def get_system_alerts(request: Request, limit: int = 100, skip: int = 0):
    """Get system alerts (UPS, security, hardware alerts)"""
    await get_current_user(request)
    alerts = await db.system_alerts.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.system_alerts.count_documents({})
    return {"alerts": alerts, "total": total}

@api_router.post("/system-alerts/{alert_id}/acknowledge")
async def acknowledge_system_alert(alert_id: str, request: Request):
    """Acknowledge/dismiss a system alert"""
    await get_current_user(request)
    result = await db.system_alerts.update_one({"id": alert_id}, {"$set": {"acknowledged": True, "acknowledged_at": datetime.now(timezone.utc).isoformat()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alerta negasita")
    return {"message": "Alerta confirmata"}

# ─── Stats ───
@api_router.get("/backups/stats")
async def get_backup_stats(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Build a global filter restricting backups to the user's allowed companies (if non-admin)
    is_limited = user.get("role") != "admin"
    allowed = user.get("allowed_companies") or []
    base_filter = {}
    companies_filter = {}
    if is_limited:
        if not allowed:
            return {
                "total": 0, "total_today": 0, "success": 0, "success_today": 0,
                "failed": 0, "failed_today": 0, "warning": 0,
                "companies_count": 0, "company_stats": [], "platform_stats": {}, "daily_stats": []
            }
        base_filter = {"company_id": {"$in": allowed}}
        companies_filter = {"id": {"$in": allowed}}

    def merge(extra):
        q = dict(base_filter)
        q.update(extra)
        return q

    total = await db.backups.count_documents(base_filter)
    total_today = await db.backups.count_documents(merge({"backup_date": today}))
    success = await db.backups.count_documents(merge({"status": "success"}))
    success_today = await db.backups.count_documents(merge({"status": "success", "backup_date": today}))
    failed = await db.backups.count_documents(merge({"status": "failed"}))
    failed_today = await db.backups.count_documents(merge({"status": "failed", "backup_date": today}))
    warning = await db.backups.count_documents(merge({"status": "warning"}))
    companies_count = await db.companies.count_documents(companies_filter)

    # Stats per company
    companies = await db.companies.find(companies_filter, {"_id": 0}).to_list(1000)
    company_stats = []
    for c in companies:
        c_total = await db.backups.count_documents({"company_id": c["id"]})
        c_success = await db.backups.count_documents({"company_id": c["id"], "status": "success"})
        c_failed = await db.backups.count_documents({"company_id": c["id"], "status": "failed"})
        c_warning = await db.backups.count_documents({"company_id": c["id"], "status": "warning"})
        last_backup = await db.backups.find_one({"company_id": c["id"]}, {"_id": 0}, sort=[("backup_date", -1)])
        company_stats.append({
            "company_id": c["id"],
            "company_name": c["name"],
            "platforms": c.get("platforms", []),
            "total": c_total,
            "success": c_success,
            "failed": c_failed,
            "warning": c_warning,
            "last_backup_date": last_backup["backup_date"] if last_backup else None,
            "last_backup_status": last_backup["status"] if last_backup else None,
            "alert_threshold_hours": c.get("alert_threshold_hours", 24)
        })

    # Stats per platform
    platform_stats = {}
    all_backups_platforms = await db.backups.find(base_filter, {"_id": 0, "platform": 1, "status": 1}).to_list(10000)
    for b in all_backups_platforms:
        p = b.get("platform", "Necunoscut")
        if p not in platform_stats:
            platform_stats[p] = {"total": 0, "success": 0, "failed": 0, "warning": 0}
        platform_stats[p]["total"] += 1
        platform_stats[p][b.get("status", "warning")] += 1

    # Last 7 days stats
    daily_stats = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        d_success = await db.backups.count_documents(merge({"backup_date": d, "status": "success"}))
        d_failed = await db.backups.count_documents(merge({"backup_date": d, "status": "failed"}))
        d_warning = await db.backups.count_documents(merge({"backup_date": d, "status": "warning"}))
        daily_stats.append({"date": d, "success": d_success, "failed": d_failed, "warning": d_warning})

    return {
        "total": total,
        "total_today": total_today,
        "success": success,
        "success_today": success_today,
        "failed": failed,
        "failed_today": failed_today,
        "warning": warning,
        "companies_count": companies_count,
        "company_stats": company_stats,
        "platform_stats": platform_stats,
        "daily_stats": daily_stats
    }

# ─── Alerts ───
@api_router.get("/alerts")
async def get_alerts(request: Request):
    await get_current_user(request)
    alerts = await db.alerts.find({"dismissed": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@api_router.post("/alerts/dismiss")
async def dismiss_alert(input: AlertDismissInput, request: Request):
    await get_current_user(request)
    await db.alerts.update_one({"id": input.alert_id}, {"$set": {"dismissed": True}})
    return {"message": "Alerta inchisa"}

@api_router.post("/alerts/generate")
async def generate_alerts(request: Request):
    """Generate alerts based on failed backups and missing backup windows"""
    await get_current_user(request)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    # Alert for failed backups today
    failed_backups = await db.backups.find({"status": "failed", "backup_date": today}, {"_id": 0}).to_list(1000)
    for fb in failed_backups:
        existing = await db.alerts.find_one({"type": "failed_backup", "reference_id": fb["id"], "dismissed": {"$ne": True}})
        if not existing:
            await db.alerts.insert_one({
                "id": str(ObjectId()),
                "type": "failed_backup",
                "severity": "error",
                "company_name": fb.get("company_name", ""),
                "platform": fb.get("platform", ""),
                "message": f"Backup esuat pentru {fb.get('company_name', '')} ({fb.get('platform', '')})",
                "reference_id": fb["id"],
                "dismissed": False,
                "created_at": now.isoformat()
            })

    # Alert for missing backups (no backup within threshold hours)
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    for c in companies:
        threshold_hours = c.get("alert_threshold_hours", 24)
        threshold_date = (now - timedelta(hours=threshold_hours)).strftime("%Y-%m-%d")
        recent = await db.backups.find_one({"company_id": c["id"], "backup_date": {"$gte": threshold_date}})
        if not recent:
            total_backups = await db.backups.count_documents({"company_id": c["id"]})
            if total_backups > 0:
                existing = await db.alerts.find_one({
                    "type": "missing_backup",
                    "company_id": c["id"],
                    "dismissed": {"$ne": True}
                })
                if not existing:
                    await db.alerts.insert_one({
                        "id": str(ObjectId()),
                        "type": "missing_backup",
                        "severity": "warning",
                        "company_id": c["id"],
                        "company_name": c["name"],
                        "platform": ", ".join(c.get("platforms", [])),
                        "message": f"Nu s-a primit backup de la {c['name']} in ultimele {threshold_hours} ore",
                        "dismissed": False,
                        "created_at": now.isoformat()
                    })

    alerts = await db.alerts.find({"dismissed": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

# ─── User Management (Admin Only) ───
@api_router.get("/users")
async def get_users(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    # Add _id as id for each user
    all_users = []
    async for u in db.users.find({}, {"password_hash": 0}):
        u["id"] = str(u["_id"])
        del u["_id"]
        all_users.append(u)
    return all_users

@api_router.post("/users")
async def create_user_by_admin(input_data: UserCreateInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    email = input_data.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Acest email este deja inregistrat")
    hashed = hash_password(input_data.password)
    doc = {
        "email": email,
        "password_hash": hashed,
        "name": input_data.name,
        "role": input_data.role,
        "allowed_companies": input_data.allowed_companies,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(doc)
    return {"id": str(result.inserted_id), "email": email, "name": input_data.name, "role": input_data.role, "allowed_companies": input_data.allowed_companies}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, input_data: UserUpdateInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    update_doc = {
        "name": input_data.name,
        "role": input_data.role,
        "allowed_companies": input_data.allowed_companies
    }
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilizator negasit")
    updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    return updated

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    if user.get("_id") == user_id:
        raise HTTPException(status_code=400, detail="Nu va puteti sterge propriul cont")
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilizator negasit")
    return {"message": "Utilizator sters"}

@api_router.post("/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: str, input_data: AdminResetPasswordInput, request: Request):
    """Admin sets a brand new password for any user."""
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    if not input_data.new_password or len(input_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Parola trebuie sa aiba minim 6 caractere")
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID utilizator invalid")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="Utilizator negasit")
    new_hash = hash_password(input_data.new_password)
    await db.users.update_one({"_id": oid}, {"$set": {"password_hash": new_hash, "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Parola resetata cu succes"}

@api_router.post("/auth/change-password")
async def change_own_password(input_data: ChangePasswordInput, request: Request):
    """Logged-in user changes their own password."""
    user = await get_current_user(request)
    if not input_data.new_password or len(input_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Parola noua trebuie sa aiba minim 6 caractere")
    full = await db.users.find_one({"_id": ObjectId(user["_id"])})
    if not full or not verify_password(input_data.current_password, full.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Parola curenta este incorecta")
    new_hash = hash_password(input_data.new_password)
    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": {"password_hash": new_hash, "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Parola schimbata cu succes"}

# ─── Config Export/Import ───
@api_router.get("/config/export")
async def export_config(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    platforms = await db.platforms.find({}, {"_id": 0}).to_list(100)
    email_settings = await db.email_settings.find_one({}, {"_id": 0})
    if email_settings:
        email_settings.pop("client_secret", None)
    config = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "companies": companies,
        "platforms": platforms,
        "email_settings": email_settings or {}
    }
    json_bytes = json_module.dumps(config, indent=2, ensure_ascii=False).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=backup_monitor_config_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"}
    )

@api_router.post("/config/import")
async def import_config(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces interzis")
    body = await request.json()
    imported_companies = 0
    imported_platforms = 0
    if "companies" in body:
        for c in body["companies"]:
            existing = await db.companies.find_one({"name": c.get("name")})
            if existing:
                await db.companies.update_one({"name": c["name"]}, {"$set": c})
            else:
                if "id" not in c:
                    c["id"] = str(ObjectId())
                await db.companies.insert_one(c)
            imported_companies += 1
    if "platforms" in body:
        for p in body["platforms"]:
            existing = await db.platforms.find_one({"name": p.get("name")})
            if not existing:
                if "id" not in p:
                    p["id"] = str(ObjectId())
                await db.platforms.insert_one(p)
                imported_platforms += 1
    return {"message": f"Importat: {imported_companies} companii, {imported_platforms} platforme noi"}

# ─── Backups Export (CSV) ───
@api_router.get("/backups/export")
async def export_backups(request: Request, company_id: str = None, platform: str = None, status: str = None, date_from: str = None, date_to: str = None):
    user = await get_current_user(request)
    query = {}
    if company_id:
        query["company_id"] = company_id
    if platform:
        query["platform"] = platform
    if status:
        query["status"] = status
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to
        query["backup_date"] = date_filter
    # Non-admin users only see their companies
    if user.get("role") != "admin" and user.get("allowed_companies"):
        query["company_id"] = {"$in": user["allowed_companies"]}

    backups = await db.backups.find(query, {"_id": 0}).sort("backup_date", -1).to_list(50000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Companie", "Platforma", "Stare", "Data", "Dimensiune", "Durata", "Detalii", "Sursa"])
    status_labels = {"success": "Succes", "failed": "Esuat", "warning": "Avertisment"}
    for b in backups:
        writer.writerow([
            b.get("company_name", ""),
            b.get("platform", ""),
            status_labels.get(b.get("status", ""), b.get("status", "")),
            b.get("backup_date", ""),
            b.get("size", ""),
            b.get("duration", ""),
            b.get("details", "")[:200],
            b.get("source", "")
        ])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=backup_log_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"}
    )

# ─── Email Settings ───
@api_router.get("/settings/email")
async def get_email_settings(request: Request):
    await get_current_user(request)
    settings = await db.email_settings.find_one({}, {"_id": 0})
    if settings:
        settings["client_secret"] = "***" if settings.get("client_secret") else ""
    return settings or {}

@api_router.post("/settings/email")
async def save_email_settings(input: EmailSettingsInput, request: Request):
    await get_current_user(request)
    doc = {
        "client_id": input.client_id,
        "tenant_id": input.tenant_id,
        "client_secret": input.client_secret,
        "email_address": input.email_address,
        "configured": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.email_settings.update_one({}, {"$set": doc}, upsert=True)
    result = await db.email_settings.find_one({}, {"_id": 0})
    result["client_secret"] = "***"
    return result

@api_router.post("/settings/email/test")
async def test_email_connection(request: Request):
    """Test Office 365 connection - currently returns mock response"""
    await get_current_user(request)
    settings = await db.email_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("configured"):
        raise HTTPException(status_code=400, detail="Setarile email nu sunt configurate")
    # In production, this would test the actual Microsoft Graph API connection
    return {"status": "info", "message": "Conexiunea Office 365 va fi testata cand credentialele Azure AD sunt furnizate. Configurati aplicatia in Azure Portal."}

# ─── Email Parsing Helpers (based on real email formats) ───

def parse_proxmox_email(subject: str, body: str) -> list:
    """Parse Proxmox vzdump emails - can contain multiple VM backups in one email."""
    results = []
    
    # Strategy 1: Parse tab-separated table: VMID\tNAME\tSTATUS\tTIME\tSIZE\tFILENAME
    table_pattern = re.compile(
        r'(\d+)\s+(\S+)\s+(ok|error|failed)\s+'
        r'((?:\d+h\s+)?\d+m\s+\d+s|\d+:\d+:\d+)\s+'
        r'([\d.]+\s*[KMGT]i?B)\s+'
        r'(\S+)',
        re.IGNORECASE
    )
    matches = table_pattern.findall(body)
    if matches:
        for m in matches:
            vmid, name, status_str, duration, size, filename = m
            status = "success" if status_str.upper() == "OK" else "failed"
            results.append({
                "platform": "Proxmox",
                "status": status,
                "vm_name": name,
                "vmid": vmid,
                "size": size,
                "duration": duration,
                "details": f"VMID {vmid} ({name}): {status_str}, Size: {size}, Duration: {duration}, File: {filename}",
            })
    
    # Strategy 2: Parse newline-separated format from forwarded emails
    # Format: VMID\nName\nStatus(OK/ERROR)\nTime\nSize\nFilename
    if not results:
        lines = body.split('\n')
        i = 0
        # Skip to after "VMID" header or "Details" header
        for idx, line in enumerate(lines):
            stripped = line.strip()
            if stripped in ("VMID", "Details") and idx + 1 < len(lines):
                # Check if next lines have NAME, STATUS headers or are actual data
                next_stripped = lines[idx + 1].strip() if idx + 1 < len(lines) else ""
                if next_stripped in ("Name", "NAME"):
                    i = idx
                    # Skip header lines
                    while i < len(lines) and lines[i].strip() in ("VMID", "Name", "NAME", "Status", "STATUS", "Time", "SIZE", "Size", "Filename", "FILENAME", "Details", ""):
                        i += 1
                    break
                elif re.match(r'^\d+$', next_stripped):
                    # Data starts right after VMID header
                    i = idx + 1
                    break
        
        while i < len(lines):
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i >= len(lines):
                break
            
            vmid_candidate = lines[i].strip()
            if not re.match(r'^\d+$', vmid_candidate):
                i += 1
                continue
            
            if i + 4 >= len(lines):
                break
            
            name = lines[i+1].strip() if i + 1 < len(lines) else ""
            status_str = lines[i+2].strip() if i + 2 < len(lines) else ""
            time_str = lines[i+3].strip() if i + 3 < len(lines) else ""
            size_str = lines[i+4].strip() if i + 4 < len(lines) else ""
            filename = lines[i+5].strip() if i + 5 < len(lines) else ""
            
            if status_str.upper() in ("OK", "ERROR", "FAILED"):
                status = "success" if status_str.upper() == "OK" else "failed"
                results.append({
                    "platform": "Proxmox",
                    "status": status,
                    "vm_name": name,
                    "vmid": vmid_candidate,
                    "size": size_str,
                    "duration": time_str,
                    "details": f"VMID {vmid_candidate} ({name}): {status_str}, Size: {size_str}, Duration: {time_str}, File: {filename}",
                })
                i += 6
            else:
                i += 1
    
    # If no table found, try basic parsing
    if not results:
        info = {"platform": "Proxmox", "status": "success", "details": ""}
        total_match = re.search(r'TOTAL\s+(?:(\d+:\d+:\d+)|(?:(?:\d+h\s+)?\d+m\s+\d+s))\s+([\d.]+\s*[KMGT]i?B)', body, re.IGNORECASE)
        if total_match:
            info["duration"] = total_match.group(1) or ""
            info["size"] = total_match.group(2)
        if any(w in (subject + body).lower() for w in ["failed", "error"]):
            info["status"] = "failed"
        elif any(w in (subject + body).lower() for w in ["warning"]):
            info["status"] = "warning"
        archive_match = re.search(r'archive file size:\s*([\d.]+[KMGT]?B)', body, re.IGNORECASE)
        if archive_match:
            info["size"] = archive_match.group(1)
        info["details"] = body[:500]
        results.append(info)
    return results

def parse_synology_email(subject: str, body: str) -> list:
    """Parse Synology emails - Active Backup for Business + Hyper Backup."""
    info = {"platform": "Synology", "status": "success", "details": "", "size": "", "duration": ""}
    text = subject + " " + body

    if "partially completed" in text.lower():
        info["status"] = "warning"
    elif "has been completed" in text.lower() or "was completed" in text.lower() or "is now complete" in text.lower():
        info["status"] = "success"
    elif any(w in text.lower() for w in ["failed", "error", "unsuccessful"]):
        info["status"] = "failed"

    task_match = re.search(r'backup task[:\s]+(.+?)(?:\s+on\s+|\s+was\s+|\s+has\s+|\s+is\s+)', text, re.IGNORECASE)
    if task_match:
        info["task_name"] = task_match.group(1).strip()

    start_match = re.search(r'Start [Tt]ime:\s*(.+?)(?:\n|$)', body)
    end_match = re.search(r'End [Tt]ime:\s*(.+?)(?:\n|$)', body)

    start_dt = None
    end_dt = None

    if start_match:
        raw_start = start_match.group(1).strip()
        try:
            if "/" in raw_start:
                start_dt = datetime.strptime(raw_start, "%m/%d/%Y %H:%M")
            elif "." in raw_start:
                start_dt = datetime.strptime(raw_start, "%d.%m.%Y %H:%M")

            if start_dt:
                info["start_time"] = start_dt.strftime("%Y-%m-%d %H:%M")
                info["backup_date"] = start_dt.strftime("%Y-%m-%d")
            else:
                info["start_time"] = raw_start
        except Exception:
            info["start_time"] = raw_start

    if end_match:
        raw_end = end_match.group(1).strip()
        try:
            if "/" in raw_end:
                end_dt = datetime.strptime(raw_end, "%m/%d/%Y %H:%M")
            elif "." in raw_end:
                end_dt = datetime.strptime(raw_end, "%d.%m.%Y %H:%M")

            if end_dt:
                info["end_time"] = end_dt.strftime("%Y-%m-%d %H:%M")
            else:
                info["end_time"] = raw_end
        except Exception:
            info["end_time"] = raw_end

    dur_match = re.search(r'Duration:\s*(.+?)(?:\n|$)', body)
    if dur_match:
        info["duration"] = dur_match.group(1).strip()
    elif start_dt and end_dt:
        duration_minutes = int((end_dt - start_dt).total_seconds() // 60)
        hours = duration_minutes // 60
        minutes = duration_minutes % 60
        info["duration"] = f"{hours}h {minutes}m"

    size_match = re.search(r'Transferred size:\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    if size_match:
        info["size"] = size_match.group(1)

    source_match = re.search(r'(?:Total Source Size|Shared folder):\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    if source_match and not info["size"]:
        info["size"] = source_match.group(1)

    target_match = re.search(r'Increased Target Size:\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    if target_match:
        info["transferred"] = target_match.group(1)

    device_match = re.search(r'Device list:\s*(.+?)(?:\n|$)', body)
    if device_match:
        info["device"] = device_match.group(1).strip()

    from_match = re.search(r'(?:From|Backup Destination:)\s*(.+?)(?:\n|$)', body)
    if from_match:
        info["source_server"] = from_match.group(1).strip()

    info["details"] = body[:800]
    return [info]

def parse_qnap_email(subject: str, body: str) -> list:
    """Parse QNAP alert emails - various alert types."""
    info = {"platform": "QNAP", "status": "success", "details": ""}
    # Parse NAS Name
    nas_match = re.search(r'NAS Name:\s*(\S+)', body)
    if nas_match:
        info["nas_name"] = nas_match.group(1)
    # Parse Severity
    severity_match = re.search(r'Severity:\s*(\w+)', body, re.IGNORECASE)
    if severity_match:
        sev = severity_match.group(1).lower()
        if sev == "error":
            info["status"] = "failed"
        elif sev in ("warning", "warn"):
            info["status"] = "warning"
        else:
            info["status"] = "success"
    # Parse Date/Time
    dt_match = re.search(r'Date/Time:\s*(.+?)(?:\n|$)', body)
    if dt_match:
        info["alert_datetime"] = dt_match.group(1).strip()
    # Parse Message
    msg_match = re.search(r'Message:\s*(.+?)(?:\n|$)', body, re.DOTALL)
    if msg_match:
        info["message"] = msg_match.group(1).strip()
    # Parse App Name and Category
    app_match = re.search(r'App Name:\s*(.+?)(?:\n|$)', body)
    cat_match = re.search(r'Category:\s*(.+?)(?:\n|$)', body)
    if app_match:
        info["app_name"] = app_match.group(1).strip()
    if cat_match:
        info["category"] = cat_match.group(1).strip()
    # Also check subject for backup-related status
    if any(w in (subject + body).lower() for w in ["failed", "error", "failure"]):
        info["status"] = "failed"
    elif "partially" in (subject + body).lower():
        info["status"] = "warning"
    info["details"] = body[:800]
    return [info]

def parse_veeam_email(subject: str, body: str) -> list:
    """Parse Veeam Backup & Replication emails - handles multiple formats:
    1. VM Backup (24h time: 02:00:31)
    2. VM Backup forwarded (AM/PM time: 8:02:05 AM) 
    3. File Backup (different column order: Name,Status,Start,End,Duration,Files,Size,Transferred,Archived)
    4. Configuration Backup (Catalog table)
    """
    results = []
    
    # Helper: check if string is a valid time (24h or AM/PM)
    time_24h_re = re.compile(r'^\d{1,2}:\d{2}:\d{2}$')
    time_ampm_re = re.compile(r'^\d{1,2}:\d{2}:\d{2}\s*[AaPp][Mm]$')
    
    def is_time(s):
        s = s.strip()
        return bool(time_24h_re.match(s) or time_ampm_re.match(s))
    
    # Parse job name from body or subject
    job_match = re.search(r'(?:Backup job|File Backup job|Configuration Backup)(?:\s+for)?:\s*(.+?)(?:\n|\r)', body)
    job_name = job_match.group(1).strip() if job_match else ""
    if not job_name:
        subj_match = re.search(r'\[(?:Warning|Success|Error)\]\s+(.+?)\s+\(', subject)
        if subj_match:
            job_name = subj_match.group(1).strip()
    
    # Detect email type
    is_file_backup = bool(re.search(r'File Backup job:', body))
    is_config_backup = bool(re.search(r'Configuration Backup for', body))
    
    # Parse overall status from subject or body
    overall_status = "success"
    if re.search(r'\[Warning\]', subject, re.IGNORECASE) or 'warning' in subject.lower():
        overall_status = "warning"
    elif re.search(r'\[Error\]', subject, re.IGNORECASE) or 'error' in subject.lower() or 'failed' in subject.lower():
        overall_status = "failed"
    
    # Parse counts
    success_count_match = re.search(r'Success\s*\n\s*(\d+)', body)
    warning_count_match = re.search(r'Warning\s*\n\s*(\d+)', body)
    error_count_match = re.search(r'Error\s*\n\s*(\d+)', body)
    s_count = int(success_count_match.group(1)) if success_count_match else 0
    w_count = int(warning_count_match.group(1)) if warning_count_match else 0
    e_count = int(error_count_match.group(1)) if error_count_match else 0
    
    if e_count > 0:
        overall_status = "failed"
    elif w_count > 0:
        overall_status = "warning"
    
    # Parse total size/duration from summary
    total_size_match = re.search(r'Total size\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    backup_size_match = re.search(r'Backup size\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    processed_match = re.search(r'Processed\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    duration_match = re.search(r'Duration\s*\n\s*(\d+:\d+:\d+)', body)
    transferred_match = re.search(r'Transferred\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
    total_size = total_size_match.group(1) if total_size_match else (processed_match.group(1) if processed_match else "")
    backup_size = backup_size_match.group(1) if backup_size_match else ""
    duration = duration_match.group(1) if duration_match else ""
    overall_transferred = transferred_match.group(1) if transferred_match else ""
    
    # Extract the actual backup date from the body
    ro_months = {'ianuarie':'01','februarie':'02','martie':'03','aprilie':'04','mai':'05','iunie':'06',
                 'iulie':'07','august':'08','septembrie':'09','octombrie':'10','noiembrie':'11','decembrie':'12'}
    en_months = {'january':'01','february':'02','march':'03','april':'04','may':'05','june':'06',
                 'july':'07','august':'08','september':'09','october':'10','november':'11','december':'12'}
    backup_date_str = ""
    
    # Try Romanian date: "2 aprilie 2026"
    ro_date_match = re.search(r'(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+(\d{4})', body, re.IGNORECASE)
    if ro_date_match:
        day = ro_date_match.group(1).zfill(2)
        month = ro_months.get(ro_date_match.group(2).lower(), "01")
        year = ro_date_match.group(3)
        backup_date_str = f"{year}-{month}-{day}"
    
    # Try English date: "Thursday, April 2, 2026" or "Friday, April 3, 2026"
    if not backup_date_str:
        en_date_match = re.search(r'(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})', body, re.IGNORECASE)
        if en_date_match:
            month = en_months.get(en_date_match.group(1).lower(), "01")
            day = en_date_match.group(2).zfill(2)
            year = en_date_match.group(3)
            backup_date_str = f"{year}-{month}-{day}"
    
    # Try dd.mm.yyyy format
    if not backup_date_str:
        date_match = re.search(r'(\d{2})\.(\d{2})\.(\d{4})\s+\d{2}:\d{2}', body)
        if date_match:
            backup_date_str = f"{date_match.group(3)}-{date_match.group(2)}-{date_match.group(1)}"
    
    # Try mm/dd/yyyy from "Created by ... at mm/dd/yyyy"
    if not backup_date_str:
        created_match = re.search(r'Created by .+ at (\d{1,2})/(\d{1,2})/(\d{4})', body)
        if created_match:
            backup_date_str = f"{created_match.group(3)}-{created_match.group(1).zfill(2)}-{created_match.group(2).zfill(2)}"
    
    # Try "Sent: Thursday, April 2, 2026" from forwarded email headers
    if not backup_date_str:
        sent_match = re.search(r'Sent:\s*\w+,\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})', body, re.IGNORECASE)
        if sent_match:
            month = en_months.get(sent_match.group(1).lower(), "01")
            day = sent_match.group(2).zfill(2)
            year = sent_match.group(3)
            backup_date_str = f"{year}-{month}-{day}"
    
    lines = body.split('\n')
    
    # ─── Detect the header layout to know column order ───
    # Find the header sequence starting with "Name" followed by "Status"
    header_start_idx = -1
    is_file_backup_table = False
    for i, line in enumerate(lines):
        if line.strip() == "Name" and i + 1 < len(lines) and lines[i+1].strip() == "Status":
            header_start_idx = i
            # Check if this is a file backup table by looking for "Backed up files" in headers
            for j in range(i, min(i + 12, len(lines))):
                if lines[j].strip() in ("Backed up files", "Archived"):
                    is_file_backup_table = True
                    break
            break
    
    # Also find the "Details" header that comes right before "Name"
    details_header_idx = -1
    for i, line in enumerate(lines):
        if line.strip() == "Details" and i + 1 < len(lines) and lines[i+1].strip() == "Name":
            details_header_idx = i
            break
    
    start_idx = details_header_idx if details_header_idx >= 0 else header_start_idx
    
    if start_idx >= 0:
        # Skip past all header lines
        i = start_idx
        header_words = {"Details", "Name", "Status", "Start time", "End time", "Size", "Read", 
                       "Transferred", "Duration", "Backed up files", "Archived", "Catalog", "Items", "Packed", ""}
        while i < len(lines) and lines[i].strip() in header_words:
            i += 1
        
        # Parse VM entries
        while i < len(lines):
            # Skip empty lines
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i >= len(lines):
                break
            
            vm_name = lines[i].strip()
            
            # Skip known end markers and junk
            if not vm_name or vm_name.startswith("Veeam") or vm_name.startswith("Veea") or vm_name.startswith("Processing "):
                i += 1
                continue
            # Skip forwarded email footer junk
            if vm_name.startswith("The information transmitted") or vm_name.startswith("Copyright"):
                break
            
            # Check if next line is a valid status
            if i + 1 >= len(lines):
                break
            status_line = lines[i+1].strip().lower()
            if status_line not in ("success", "warning", "error"):
                i += 1
                continue
            
            # Validate times on lines i+2, i+3
            if i + 3 >= len(lines):
                break
            start_t = lines[i+2].strip()
            end_t = lines[i+3].strip()
            if not is_time(start_t) or not is_time(end_t):
                i += 1
                continue
            
            # We have a valid VM entry - now parse based on table type
            vm_status = "success" if status_line == "success" else ("warning" if status_line == "warning" else "failed")
            
            if is_file_backup_table:
                # File Backup columns after end_time: Duration, Backed up files, Size, Transferred, Archived
                vm_duration = lines[i+4].strip() if i + 4 < len(lines) else ""
                vm_files_count = lines[i+5].strip() if i + 5 < len(lines) else ""
                vm_size = lines[i+6].strip() if i + 6 < len(lines) else ""
                vm_transferred = lines[i+7].strip() if i + 7 < len(lines) else ""
                vm_archived = lines[i+8].strip() if i + 8 < len(lines) else ""
                vm_read = ""
                fields_consumed = 9
            else:
                # VM Backup columns after end_time: Size, Read, Transferred, Duration
                vm_size = lines[i+4].strip() if i + 4 < len(lines) else ""
                vm_read = lines[i+5].strip() if i + 5 < len(lines) else ""
                vm_transferred = lines[i+6].strip() if i + 6 < len(lines) else ""
                vm_duration = lines[i+7].strip() if i + 7 < len(lines) else ""
                vm_files_count = ""
                fields_consumed = 8
            
            # Collect remaining detail lines until next VM
            vm_details_lines = []
            j = i + fields_consumed
            while j < len(lines):
                dl = lines[j].strip()
                if not dl:
                    j += 1
                    continue
                # Check if this is a new VM entry
                if j + 1 < len(lines) and lines[j+1].strip().lower() in ("success", "warning", "error"):
                    if j + 3 < len(lines) and is_time(lines[j+2].strip()) and is_time(lines[j+3].strip()):
                        break
                # End markers
                if dl.startswith("Veea") or dl.startswith("Veeam") or dl.startswith("The information transmitted"):
                    break
                vm_details_lines.append(dl)
                j += 1
            
            vm_details_text = "\n".join(vm_details_lines)
            detail_text = f"Job: {job_name}, VM: {vm_name}, Size: {vm_size}, Read: {vm_read}, Transferred: {vm_transferred}"
            if vm_details_text:
                detail_text += f"\n{vm_details_text}"
            
            results.append({
                "platform": "Veeam",
                "status": vm_status,
                "vm_name": vm_name,
                "job_name": job_name,
                "size": vm_size,
                "duration": vm_duration,
                "start_time": start_t,
                "end_time": end_t,
                "read": vm_read,
                "transferred": vm_transferred,
                "details": detail_text[:2000],
                "backup_date": backup_date_str,
            })
            i = j
    
    # Configuration Backup - special handling
    if not results and is_config_backup:
        data_size_match = re.search(r'Data size\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
        config_backup_size_match = re.search(r'Backup size\s*\n\s*([\d.,]+\s*[KMGT]?i?B)', body, re.IGNORECASE)
        results.append({
            "platform": "Veeam",
            "status": overall_status,
            "job_name": job_name,
            "vm_name": "Configuration",
            "size": data_size_match.group(1) if data_size_match else "",
            "transferred": config_backup_size_match.group(1) if config_backup_size_match else backup_size,
            "duration": duration,
            "details": f"Job: {job_name}, Type: Configuration Backup\n{body[:800]}",
            "backup_date": backup_date_str,
        })
    
    # If no individual VMs found, create single entry with overall stats
    if not results:
        results.append({
            "platform": "Veeam",
            "status": overall_status,
            "job_name": job_name,
            "size": total_size or backup_size,
            "transferred": overall_transferred or backup_size,
            "duration": duration,
            "details": f"Job: {job_name}, Success: {s_count}, Warning: {w_count}, Error: {e_count}. " + body[:500],
            "backup_date": backup_date_str,
        })
    
    return results

def detect_platform(subject: str, body: str) -> str:
    text = (subject + " " + body).lower()
    if "proxmox" in text or "vzdump" in text or "pve" in text or "/mnt/pve/" in text:
        return "Proxmox"
    if "synology" in text or "dsm" in text or "hyper backup" in text or "active backup" in text:
        return "Synology"
    if "qnap" in text or "qts" in text or "nas name:" in text:
        return "QNAP"
    if "veeam" in text or "backup job:" in text or "file backup job:" in text or "configuration backup for" in text:
        return "Veeam"
    return "Necunoscut"

def is_system_alert_email(subject: str, body: str) -> dict:
    """Detect if an email is a system alert (not a backup notification).
    Returns alert info dict if it's an alert, or None if it's a backup email."""
    text = (subject + " " + body).lower()
    
    # UPS related alerts
    if "ups" in text and ("lost the connection" in text or "connected to the ups" in text or "low battery" in text or "on battery" in text):
        alert_type = "ups_disconnected" if "lost" in text else "ups_connected"
        severity = "error" if "lost" in text else "info"
        return {
            "type": alert_type,
            "category": "UPS",
            "severity": severity,
            "message": subject,
        }
    
    # QNAP login failure alerts (not backup related)
    if "failed to log in" in text and ("qulog" in text or "qnap" in text):
        return {
            "type": "login_failure",
            "category": "Security",
            "severity": "warning",
            "message": subject,
        }
    
    # Disk/storage alerts
    if ("disk" in text or "storage" in text or "volume" in text) and ("degraded" in text or "failed" in text or "critical" in text) and "backup" not in text:
        return {
            "type": "storage_alert",
            "category": "Storage",
            "severity": "error",
            "message": subject,
        }
    
    # Temperature alerts
    if "temperature" in text and ("warning" in text or "critical" in text or "exceeded" in text):
        return {
            "type": "temperature_alert",
            "category": "Hardware",
            "severity": "warning",
            "message": subject,
        }
    
    # Network related alerts (non-backup)
    if ("network" in text or "connection" in text) and "backup" not in text and "vzdump" not in text and "veeam" not in text:
        if "lost" in text or "failed" in text or "disconnected" in text:
            return {
                "type": "network_alert",
                "category": "Network",
                "severity": "warning",
                "message": subject,
            }
    
    return None

def extract_backup_date_from_email(subject: str, body: str, email_date_str: str = "") -> str:
    """Extract the actual backup date from email content. Falls back to email received date."""
    
    # Romanian month names
    ro_months = {'ianuarie':'01','februarie':'02','martie':'03','aprilie':'04','mai':'05','iunie':'06',
                 'iulie':'07','august':'08','septembrie':'09','octombrie':'10','noiembrie':'11','decembrie':'12'}
    
    # Try Romanian date format: "2 aprilie 2026" or "joi, 2 aprilie 2026"
    ro_match = re.search(r'(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+(\d{4})', body, re.IGNORECASE)
    if ro_match:
        day = ro_match.group(1).zfill(2)
        month = ro_months.get(ro_match.group(2).lower(), "01")
        year = ro_match.group(3)
        return f"{year}-{month}-{day}"
    
    # Try dd.mm.yyyy format (Synology, Veeam): "02.04.2026 08:09" or "Start time: 02.04.2026"
    ddmmyyyy_match = re.search(r'(\d{2})\.(\d{2})\.(\d{4})\s+\d{2}:\d{2}', body)
    if ddmmyyyy_match:
        return f"{ddmmyyyy_match.group(3)}-{ddmmyyyy_match.group(2)}-{ddmmyyyy_match.group(1)}"
    
    # Try dd/mm/yyyy format
    ddmmyyyy2_match = re.search(r'(\d{2})/(\d{2})/(\d{4})\s+\d{2}:\d{2}', body)
    if ddmmyyyy2_match:
        return f"{ddmmyyyy2_match.group(3)}-{ddmmyyyy2_match.group(2)}-{ddmmyyyy2_match.group(1)}"
    
    # Try yyyy-mm-dd format
    iso_match = re.search(r'(\d{4}-\d{2}-\d{2})', body)
    if iso_match:
        return iso_match.group(1)
    
    # Try Proxmox vzdump timestamp: "2026_04_01-23_00_02" or "2026-04-01 23:00:02"
    prox_match = re.search(r'(\d{4})_(\d{2})_(\d{2})-\d{2}_\d{2}_\d{2}', body)
    if prox_match:
        return f"{prox_match.group(1)}-{prox_match.group(2)}-{prox_match.group(3)}"
    
    prox_match2 = re.search(r'(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}\s+INFO', body)
    if prox_match2:
        return f"{prox_match2.group(1)}-{prox_match2.group(2)}-{prox_match2.group(3)}"
    
    # Try to parse from email Date header
    if email_date_str:
        try:
            dt = parsedate_to_datetime(email_date_str)
            return dt.strftime("%Y-%m-%d")
        except:
            pass
    
    # Fallback to today
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def parse_backup_email(subject: str, body: str) -> list:
    """Parse email and return list of backup entries (one email can contain multiple VMs)."""
    platform = detect_platform(subject, body)
    parsers = {
        "Proxmox": parse_proxmox_email,
        "Synology": parse_synology_email,
        "QNAP": parse_qnap_email,
        "Veeam": parse_veeam_email,
    }
    parser = parsers.get(platform)
    if parser:
        return parser(subject, body)
    return [{"platform": platform, "status": "success", "details": body[:500]}]

# ─── Parse Email Test Endpoint ───
@api_router.post("/parse-email-test")
async def parse_email_test(request: Request):
    """Test parsing an email body - for development/debug purposes"""
    await get_current_user(request)
    body_data = await request.json()
    subject = body_data.get("subject", "")
    email_body = body_data.get("body", "")
    results = parse_backup_email(subject, email_body)
    return {"platform": detect_platform(subject, email_body), "parsed_entries": results, "count": len(results)}

# ─── Webhook Settings ───
@api_router.get("/webhook/settings")
async def get_webhook_settings(request: Request):
    await get_current_user(request)
    settings = await db.webhook_settings.find_one({}, {"_id": 0})
    if not settings:
        # Generate default webhook token
        token = secrets.token_urlsafe(32)
        settings = {
            "webhook_token": token,
            "folder_path": "Inbox/Backup Clienti",
            "auto_match_company": True,
            "default_company_id": "",
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.webhook_settings.insert_one(settings)
        settings.pop("_id", None)
    return settings

@api_router.post("/webhook/settings")
async def save_webhook_settings(input_data: WebhookSettingsInput, request: Request):
    await get_current_user(request)
    existing = await db.webhook_settings.find_one({})
    if not existing:
        token = secrets.token_urlsafe(32)
        doc = {
            "webhook_token": token,
            "folder_path": input_data.folder_path,
            "auto_match_company": input_data.auto_match_company,
            "default_company_id": input_data.default_company_id,
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.webhook_settings.insert_one(doc)
    else:
        await db.webhook_settings.update_one({}, {"$set": {
            "folder_path": input_data.folder_path,
            "auto_match_company": input_data.auto_match_company,
            "default_company_id": input_data.default_company_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
    result = await db.webhook_settings.find_one({}, {"_id": 0})
    return result

@api_router.post("/webhook/regenerate-token")
async def regenerate_webhook_token(request: Request):
    await get_current_user(request)
    new_token = secrets.token_urlsafe(32)
    await db.webhook_settings.update_one({}, {"$set": {"webhook_token": new_token, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"webhook_token": new_token}

# ─── Webhook Log ───
@api_router.get("/webhook/log")
async def get_webhook_log(request: Request, limit: int = 50):
    await get_current_user(request)
    logs = await db.webhook_log.find({}, {"_id": 0}).sort("received_at", -1).limit(limit).to_list(limit)
    return logs

# ─── Helper: Match company from email ───
async def match_company_from_email(subject: str, body: str, from_address: str = "") -> dict:
    """Try to match incoming email to a company based on email_patterns or subject/body content."""
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    text = (subject + " " + body + " " + from_address).lower()
    # First: match by email_patterns
    for c in companies:
        for pattern in c.get("email_patterns", []):
            if pattern.lower() in text:
                return c
    # Second: match by company name in subject/body
    for c in companies:
        if c["name"].lower() in text:
            return c
    return {}

# ─── Power Automate Webhook Endpoint ───
@api_router.post("/webhook/power-automate")
async def receive_power_automate_webhook(request: Request):
    """
    Receives email data from Power Automate.
    Expected payload: { "token": "...", "subject": "...", "body": "...", "from": "...", "received_date": "..." }
    No user auth required - uses webhook token instead.
    """
    try:
        body_data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload JSON invalid")

    # Validate webhook token
    token = body_data.get("token", "")
    settings = await db.webhook_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("enabled"):
        raise HTTPException(status_code=403, detail="Webhook dezactivat")
    if token != settings.get("webhook_token"):
        raise HTTPException(status_code=401, detail="Token webhook invalid")

    subject = body_data.get("subject", "")
    email_body = body_data.get("body", "")
    from_address = body_data.get("from", "")
    received_date = body_data.get("received_date", "")

    if not subject and not email_body:
        raise HTTPException(status_code=400, detail="Subject sau body este necesar")

    # Parse email
    parsed_entries = parse_backup_email(subject, email_body)
    platform = detect_platform(subject, email_body)

    # Match company
    matched_company = await match_company_from_email(subject, email_body, from_address)
    company_id = matched_company.get("id", settings.get("default_company_id", ""))
    company_name = matched_company.get("name", "Necunoscut")

    # Determine backup date
    backup_date = received_date[:10] if received_date else datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Create backup entries
    created_backups = []
    for entry in parsed_entries:
        doc = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "company_name": company_name,
            "platform": entry.get("platform", platform),
            "status": entry.get("status", "success"),
            "details": entry.get("details", "")[:2000],
            "backup_date": backup_date,
            "size": entry.get("size", ""),
            "duration": entry.get("duration", ""),
            "source": "power_automate",
            "vm_name": entry.get("vm_name", ""),
            "job_name": entry.get("job_name", ""),
            "email_subject": subject[:500],
            "from_address": from_address,
            "email_body": email_body[:5000],
            "email_date": received_date,
            "is_unknown": (not company_id) or (platform == "Necunoscut"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.backups.insert_one(doc)
        created = await db.backups.find_one({"id": doc["id"]}, {"_id": 0})
        created_backups.append(created)

    # Log the webhook
    log_entry = {
        "id": str(ObjectId()),
        "subject": subject[:200],
        "from_address": from_address,
        "platform": platform,
        "company_name": company_name,
        "entries_count": len(created_backups),
        "statuses": [e["status"] for e in created_backups],
        "received_at": datetime.now(timezone.utc).isoformat(),
        "success": True
    }
    await db.webhook_log.insert_one(log_entry)

    return {
        "status": "ok",
        "message": f"Procesat {len(created_backups)} intrari de backup",
        "platform": platform,
        "company": company_name,
        "backups_created": len(created_backups)
    }

# ─── Manual Email Import ───
@api_router.post("/backups/from-email")
async def create_backup_from_email(input_data: ManualEmailInput, request: Request):
    """Parse a manually pasted email and create backup entries."""
    await get_current_user(request)

    subject = input_data.subject.strip()
    email_body = input_data.body.strip()

    if not subject and not email_body:
        raise HTTPException(status_code=400, detail="Subject sau body este necesar")

    # Parse
    parsed_entries = parse_backup_email(subject, email_body)
    platform = detect_platform(subject, email_body)

    # Company
    company_id = input_data.company_id
    company_name = input_data.company_name

    if not company_id:
        # Try auto-match
        matched = await match_company_from_email(subject, email_body)
        if matched:
            company_id = matched.get("id", "")
            company_name = matched.get("name", "Necunoscut")

    # Create entries
    created_backups = []
    for entry in parsed_entries:
        doc = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "company_name": company_name or "Necunoscut",
            "platform": entry.get("platform", platform),
            "status": entry.get("status", "success"),
            "details": entry.get("details", "")[:2000],
            "backup_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "size": entry.get("size", ""),
            "duration": entry.get("duration", ""),
            "source": "email_manual",
            "vm_name": entry.get("vm_name", ""),
            "job_name": entry.get("job_name", ""),
            "email_subject": subject[:500],
            "email_body": email_body[:5000],
            "is_unknown": (not company_id) or (platform == "Necunoscut"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.backups.insert_one(doc)
        created = await db.backups.find_one({"id": doc["id"]}, {"_id": 0})
        created_backups.append(created)

    return {
        "status": "ok",
        "message": f"Creat {len(created_backups)} intrari de backup din email",
        "platform": platform,
        "company": company_name or "Necunoscut",
        "backups": created_backups
    }

# ─── SMTP Settings ───
@api_router.get("/settings/smtp")
async def get_smtp_settings(request: Request):
    await get_current_user(request)
    settings = await db.smtp_settings.find_one({}, {"_id": 0})
    if settings:
        settings["smtp_password"] = "***" if settings.get("smtp_password") else ""
    return settings or {}

@api_router.post("/settings/smtp")
async def save_smtp_settings(input_data: SmtpSettingsInput, request: Request):
    await get_current_user(request)
    doc = {
        "smtp_host": input_data.smtp_host,
        "smtp_port": input_data.smtp_port,
        "smtp_username": input_data.smtp_username,
        "smtp_password": input_data.smtp_password,
        "from_address": input_data.from_address,
        "from_name": input_data.from_name,
        "use_tls": input_data.use_tls,
        "use_ssl": inputData.useSsl,
        "configured": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.smtp_settings.update_one({}, {"$set": doc}, upsert=True)
    result = await db.smtp_settings.find_one({}, {"_id": 0})
    result["smtp_password"] = "***"
    return result

@api_router.post("/settings/smtp/test")
async def test_smtp_connection(request: Request):
    """Test SMTP connection by sending a test email to the configured from_address"""
    await get_current_user(request)
    settings = await db.smtp_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("configured"):
        raise HTTPException(status_code=400, detail="Setarile SMTP nu sunt configurate")
    
    # Get recipients for test
    recipients = await db.alert_recipients.find({}, {"_id": 0}).to_list(100)
    test_to = settings["from_address"]
    if recipients:
        test_to = recipients[0]["email"]
    
    try:
        result = await asyncio.to_thread(_send_smtp_email,
            settings=settings,
            to_emails=[test_to],
            subject="[Backup Monitor] Test Conexiune SMTP",
            html_body=_build_test_email_html()
        )
        if result["success"]:
            return {"status": "success", "message": f"Email de test trimis cu succes la {test_to}"}
        else:
            raise HTTPException(status_code=400, detail=f"Eroare SMTP: {result['error']}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Eroare la trimiterea email-ului: {str(e)}")

def _send_smtp_email(settings: dict, to_emails: list, subject: str, html_body: str) -> dict:
    """Send email via SMTP (runs in thread)."""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f'{settings.get("from_name", "Backup Monitor")} <{settings["from_address"]}>'
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject

        text_part = MIMEText(re.sub(r"<[^>]+>", "", html_body), "plain", "utf-8")
        html_part = MIMEText(html_body, "html", "utf-8")
        msg.attach(text_part)
        msg.attach(html_part)

        if settings.get("use_Ssl", True):
            server = smtplib.SMTP_SSL(settings["smtp_host"], settings["smtp_port"], timeout=15)
            server.ehlo()
        else:
            server = smtplib.SMTP(settings["smtp_host"], settings["smtp_port"], timeout=15)
            server.ehlo()
            if settings.get("usetls", True):
                server.starttls()
                server.ehlo()

        server.login(settings["smtp_username"], settings["smtp_password"])
        server.sendmail(settings["from_address"], to_emails, msg.as_string())
        server.quit()
        return {"success": True}

    except smtplib.SMTPAuthenticationError as e:
        return {"success": False, "error": f"Autentificare SMTP esuata: {str(e)}"}
    except smtplib.SMTPConnectError as e:
        return {"success": False, "error": f"Nu se poate conecta la serverul SMTP: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
        
        
def _build_test_email_html() -> str:
    return f"""
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0b; color: #fff; border: 1px solid #27272a; border-radius: 4px;">
        <div style="padding: 24px; border-bottom: 1px solid #27272a;">
            <h2 style="margin: 0; font-size: 18px; color: #fff;">Backup Monitor - Test SMTP</h2>
        </div>
        <div style="padding: 24px;">
            <p style="color: #a1a1aa; margin: 0 0 16px 0;">Conexiunea SMTP a fost configurata cu succes!</p>
            <div style="background: #052e16; border: 1px solid #166534; border-radius: 4px; padding: 12px; margin-bottom: 16px;">
                <span style="color: #34d399; font-weight: 600;">&#10003; Conexiune SMTP functionala</span>
            </div>
            <p style="color: #71717a; font-size: 12px; margin: 0;">Alertele de backup vor fi trimise la adresele configurate ca destinatari.</p>
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid #27272a; text-align: center;">
            <span style="color: #52525b; font-size: 11px;">Backup Monitor &bull; {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M')} UTC</span>
        </div>
    </div>
    """

def _build_alert_email_html(alerts_data: list, check_time: str) -> str:
    """Build HTML email with alerts table"""
    failed_rows = ""
    missing_rows = ""
    
    for a in alerts_data:
        row_bg = "#1a0a0a" if a["type"] == "failed" else "#1a1500"
        status_color = "#f43f5e" if a["type"] == "failed" else "#fbbf24"
        status_label = "ESUAT" if a["type"] == "failed" else "LIPSA"
        
        if a["type"] == "failed":
            failed_rows += f"""
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 13px;">{a.get('company_name', '-')}</td>
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 13px; font-family: monospace;">{a.get('platform', '-')}</td>
                <td style="padding: 10px 12px;"><span style="color: {status_color}; font-size: 11px; font-weight: 600; background: {row_bg}; padding: 2px 8px; border-radius: 2px;">{status_label}</span></td>
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 12px; font-family: monospace;">{a.get('backup_date', '-')}</td>
                <td style="padding: 10px 12px; color: #71717a; font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">{a.get('details', '-')[:100]}</td>
            </tr>"""
        else:
            missing_rows += f"""
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 13px;">{a.get('company_name', '-')}</td>
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 13px; font-family: monospace;">{a.get('platforms', '-')}</td>
                <td style="padding: 10px 12px;"><span style="color: {status_color}; font-size: 11px; font-weight: 600; background: {row_bg}; padding: 2px 8px; border-radius: 2px;">{status_label}</span></td>
                <td style="padding: 10px 12px; color: #a1a1aa; font-size: 12px; font-family: monospace;">{a.get('last_backup', 'N/A')}</td>
                <td style="padding: 10px 12px; color: #71717a; font-size: 12px;">{a.get('threshold', '24')}h fara backup</td>
            </tr>"""
    
    failed_count = sum(1 for a in alerts_data if a["type"] == "failed")
    missing_count = sum(1 for a in alerts_data if a["type"] == "missing")
    
    sections = ""
    
    if failed_rows:
        sections += f"""
        <div style="margin-bottom: 24px;">
            <h3 style="color: #f43f5e; font-size: 14px; margin: 0 0 12px 0; padding: 8px 12px; background: #1a0a0a; border-left: 3px solid #f43f5e;">
                &#10060; Backup-uri Esuate ({failed_count})
            </h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #27272a;">
                <thead>
                    <tr style="background: #18181b;">
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Companie</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Platforma</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Status</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Data</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Detalii</th>
                    </tr>
                </thead>
                <tbody>{failed_rows}</tbody>
            </table>
        </div>"""
    
    if missing_rows:
        sections += f"""
        <div style="margin-bottom: 24px;">
            <h3 style="color: #fbbf24; font-size: 14px; margin: 0 0 12px 0; padding: 8px 12px; background: #1a1500; border-left: 3px solid #fbbf24;">
                &#9888; Backup-uri Lipsa ({missing_count})
            </h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #27272a;">
                <thead>
                    <tr style="background: #18181b;">
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Companie</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Platforme</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Status</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Ultimul Backup</th>
                        <th style="padding: 8px 12px; text-align: left; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Detalii</th>
                    </tr>
                </thead>
                <tbody>{missing_rows}</tbody>
            </table>
        </div>"""
    
    return f"""
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 700px; margin: 0 auto; background: #0a0a0b; color: #fff; border: 1px solid #27272a; border-radius: 4px;">
        <div style="padding: 20px 24px; border-bottom: 1px solid #27272a; background: #18181b;">
            <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #fff;">&#128737; Backup Monitor - Alerte</h2>
            <p style="margin: 0; color: #71717a; font-size: 12px;">Verificare din {check_time}</p>
        </div>
        <div style="padding: 20px 24px;">
            <div style="display: flex; margin-bottom: 20px;">
                <div style="background: #1a0a0a; border: 1px solid #3f1215; border-radius: 4px; padding: 12px 16px; margin-right: 12px; flex: 1; text-align: center;">
                    <div style="color: #f43f5e; font-size: 24px; font-weight: 700;">{failed_count}</div>
                    <div style="color: #71717a; font-size: 11px; text-transform: uppercase;">Esuate</div>
                </div>
                <div style="background: #1a1500; border: 1px solid #3f3000; border-radius: 4px; padding: 12px 16px; flex: 1; text-align: center;">
                    <div style="color: #fbbf24; font-size: 24px; font-weight: 700;">{missing_count}</div>
                    <div style="color: #71717a; font-size: 11px; text-transform: uppercase;">Lipsa</div>
                </div>
            </div>
            {sections}
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid #27272a; text-align: center;">
            <span style="color: #52525b; font-size: 11px;">Backup Monitor &bull; Verificare automata &bull; {check_time}</span>
        </div>
    </div>
    """

# ─── Alert Recipients ───
@api_router.get("/settings/alert-recipients")
async def get_alert_recipients(request: Request):
    await get_current_user(request)
    recipients = await db.alert_recipients.find({}, {"_id": 0}).to_list(100)
    return recipients

@api_router.post("/settings/alert-recipients")
async def add_alert_recipient(input_data: AlertRecipientInput, request: Request):
    await get_current_user(request)
    email = input_data.email.strip().lower()
    existing = await db.alert_recipients.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Acest email este deja adaugat ca destinatar")
    doc = {
        "id": str(ObjectId()),
        "email": email,
        "name": input_data.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.alert_recipients.insert_one(doc)
    result = await db.alert_recipients.find_one({"id": doc["id"]}, {"_id": 0})
    return result

@api_router.delete("/settings/alert-recipients/{recipient_id}")
async def delete_alert_recipient(recipient_id: str, request: Request):
    await get_current_user(request)
    result = await db.alert_recipients.delete_one({"id": recipient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Destinatar negasit")
    return {"message": "Destinatar sters"}

# ─── IMAP Settings ───
_imap_sync_task = None

@api_router.get("/settings/imap")
async def get_imap_settings(request: Request):
    await get_current_user(request)
    settings = await db.imap_settings.find_one({}, {"_id": 0})
    if settings:
        settings["imap_password"] = "***" if settings.get("imap_password") else ""
    return settings or {}

@api_router.post("/settings/imap")
async def save_imap_settings(input_data: ImapSettingsInput, request: Request):
    await get_current_user(request)
    doc = {
        "imap_host": input_data.imap_host,
        "imap_port": input_data.imap_port,
        "imap_username": input_data.imap_username,
        "imap_password": input_data.imap_password,
        "use_ssl": input_data.use_ssl,
        "folder": input_data.folder,
        "auto_sync_enabled": input_data.auto_sync_enabled,
        "sync_interval_minutes": input_data.sync_interval_minutes,
        "delete_after_import": input_data.delete_after_import,
        "mark_as_read": input_data.mark_as_read,
        "fetch_all_emails": input_data.fetch_all_emails,
        "days_to_fetch": input_data.days_to_fetch,
        "configured": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.imap_settings.update_one({}, {"$set": doc}, upsert=True)
    result = await db.imap_settings.find_one({}, {"_id": 0})
    result["imap_password"] = "***"
    return result

@api_router.post("/settings/imap/test")
async def test_imap_connection(request: Request):
    """Test IMAP connection"""
    await get_current_user(request)
    settings = await db.imap_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("configured"):
        raise HTTPException(status_code=400, detail="Setarile IMAP nu sunt configurate")
    
    try:
        result = await asyncio.to_thread(_test_imap_connection, settings)
        if result["success"]:
            return {"status": "success", "message": result["message"], "email_count": result.get("email_count", 0)}
        else:
            raise HTTPException(status_code=400, detail=f"Eroare IMAP: {result['error']}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Eroare la conectarea IMAP: {str(e)}")

def _test_imap_connection(settings: dict) -> dict:
    """Test IMAP connection (runs in thread)"""
    try:
        if settings.get("use_ssl", True):
            mail = imaplib.IMAP4_SSL(settings["imap_host"], settings.get("imap_port", 993), timeout=15)
        else:
            mail = imaplib.IMAP4(settings["imap_host"], settings.get("imap_port", 143), timeout=15)
        
        mail.login(settings["imap_username"], settings["imap_password"])
        
        # Select folder
        folder = settings.get("folder", "INBOX")
        status, messages = mail.select(folder, readonly=True)
        if status != "OK":
            mail.logout()
            return {"success": False, "error": f"Nu s-a putut accesa folderul {folder}"}
        
        # Count unread emails
        status, data = mail.search(None, "UNSEEN")
        unread_count = len(data[0].split()) if data[0] else 0
        
        mail.logout()
        return {"success": True, "message": f"Conexiune IMAP reusita! {unread_count} email-uri necitite in {folder}.", "email_count": unread_count}
    except imaplib.IMAP4.error as e:
        return {"success": False, "error": f"Eroare IMAP: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _decode_email_header(header):
    """Decode email header - handles various encodings"""
    if header is None:
        return ""
    try:
        decoded_parts = decode_header(header)
        result = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                # Try multiple encodings
                for enc in [encoding, "utf-8", "iso-8859-1", "windows-1252", "latin-1"]:
                    if enc:
                        try:
                            result += part.decode(enc, errors="replace")
                            break
                        except:
                            continue
                else:
                    result += part.decode("utf-8", errors="replace")
            else:
                result += str(part)
        return result.strip()
    except Exception:
        return str(header) if header else ""

def _strip_html_tags(html_content):
    """Remove HTML tags and convert to plain text"""
    import re
    if not html_content:
        return ""
    # Remove script and style elements
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    # Replace br and p tags with newlines
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</tr>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</td>', '\t', text, flags=re.IGNORECASE)
    text = re.sub(r'</th>', '\t', text, flags=re.IGNORECASE)
    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    text = text.replace('&apos;', "'")
    # Clean up whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n\n', text)
    return text.strip()

def _decode_payload(part):
    """Decode email payload with multiple encoding fallbacks"""
    try:
        payload = part.get_payload(decode=True)
        if payload is None:
            payload = part.get_payload()
            if isinstance(payload, str):
                return payload
            return ""
        
        # Try charset from content-type first
        charset = part.get_content_charset()
        
        # Try multiple encodings
        encodings = [charset, "utf-8", "iso-8859-1", "windows-1252", "latin-1", "cp1252"]
        encodings = [e for e in encodings if e]  # Remove None
        
        for enc in encodings:
            try:
                return payload.decode(enc, errors="replace")
            except:
                continue
        
        # Last resort: decode with utf-8 and replace errors
        return payload.decode("utf-8", errors="replace")
    except Exception:
        return ""

def _get_email_body(msg):
    """Extract email body from message - handles RAW, multipart, HTML"""
    plain_body = ""
    html_body = ""
    
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            
            # Skip attachments
            if "attachment" in content_disposition:
                continue
            
            if content_type == "text/plain":
                decoded = _decode_payload(part)
                if decoded and not plain_body:
                    plain_body = decoded
            elif content_type == "text/html":
                decoded = _decode_payload(part)
                if decoded and not html_body:
                    html_body = decoded
    else:
        content_type = msg.get_content_type()
        decoded = _decode_payload(msg)
        if content_type == "text/html":
            html_body = decoded
        else:
            plain_body = decoded
    
    # Prefer plain text, fall back to stripped HTML
    if plain_body:
        return plain_body
    elif html_body:
        return _strip_html_tags(html_body)
    
    # Last resort: try to get raw payload
    try:
        raw = msg.get_payload()
        if isinstance(raw, str):
            return raw
        elif isinstance(raw, bytes):
            return raw.decode("utf-8", errors="replace")
    except:
        pass
    
    return ""

def _fetch_and_process_emails(settings: dict) -> dict:
    """Fetch emails from IMAP and process them (runs in thread)"""
    try:
        if settings.get("use_ssl", True):
            mail = imaplib.IMAP4_SSL(settings["imap_host"], settings.get("imap_port", 993), timeout=30)
        else:
            mail = imaplib.IMAP4(settings["imap_host"], settings.get("imap_port", 143), timeout=30)
        
        mail.login(settings["imap_username"], settings["imap_password"])
        
        folder = settings.get("folder", "INBOX")
        status, messages = mail.select(folder)
        if status != "OK":
            mail.logout()
            return {"success": False, "error": f"Nu s-a putut accesa folderul {folder}", "emails": []}
        
        # Search criteria based on settings
        fetch_all = settings.get("fetch_all_emails", False)
        days_to_fetch = settings.get("days_to_fetch", 7)
        
        if fetch_all:
            # Fetch emails from the last N days
            from datetime import datetime, timedelta
            since_date = (datetime.now() - timedelta(days=days_to_fetch)).strftime("%d-%b-%Y")
            status, data = mail.search(None, f'(SINCE "{since_date}")')
        else:
            # Search for unread emails only
            status, data = mail.search(None, "UNSEEN")
        
        if status != "OK" or not data[0]:
            mail.logout()
            return {"success": True, "emails": [], "message": "Niciun email nou"}
        
        email_ids = data[0].split()
        emails_data = []
        
        for email_id in email_ids[-50:]:  # Limit to last 50 emails
            status, msg_data = mail.fetch(email_id, "(RFC822)")
            if status != "OK":
                continue
            
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            
            subject = _decode_email_header(msg.get("Subject", ""))
            from_addr = _decode_email_header(msg.get("From", ""))
            date_str = msg.get("Date", "")
            body = _get_email_body(msg)
            
            emails_data.append({
                "email_id": email_id.decode() if isinstance(email_id, bytes) else str(email_id),
                "subject": subject,
                "from": from_addr,
                "date": date_str,
                "body": body
            })
            
            # Mark as read if configured
            if settings.get("mark_as_read", True):
                mail.store(email_id, "+FLAGS", "\\Seen")
        
        mail.logout()
        return {"success": True, "emails": emails_data, "message": f"Preluat {len(emails_data)} email-uri"}
    except imaplib.IMAP4.error as e:
        return {"success": False, "error": f"Eroare IMAP: {str(e)}", "emails": []}
    except Exception as e:
        return {"success": False, "error": str(e), "emails": []}

@api_router.post("/settings/imap/sync")
async def sync_imap_emails(request: Request):
    """Manually sync emails from IMAP"""
    await get_current_user(request)
    settings = await db.imap_settings.find_one({}, {"_id": 0})
    if not settings or not settings.get("configured"):
        raise HTTPException(status_code=400, detail="Setarile IMAP nu sunt configurate")
    
    try:
        result = await asyncio.to_thread(_fetch_and_process_emails, settings)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("error", "Eroare la sincronizare"))
        
        # Process emails and create backups
        created_backups = []
        created_alerts = []
        for email_data in result.get("emails", []):
            subject = email_data.get("subject", "")
            body = email_data.get("body", "")
            from_addr = email_data.get("from", "")
            email_date = email_data.get("date", "")
            
            # Check if this is a system alert (not a backup)
            alert_info = is_system_alert_email(subject, body)
            if alert_info:
                alert_doc = {
                    "id": str(ObjectId()),
                    "type": alert_info["type"],
                    "category": alert_info["category"],
                    "severity": alert_info["severity"],
                    "message": alert_info["message"],
                    "subject": subject[:500],
                    "body": body[:2000],
                    "from_address": from_addr,
                    "email_date": email_date,
                    "acknowledged": False,
                    "source": "imap_sync",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.system_alerts.insert_one(alert_doc)
                created_alerts.append(alert_doc)
                continue
            
            # Parse email
            parsed_entries = parse_backup_email(subject, body)
            platform = detect_platform(subject, body)
            
            # Extract actual backup date
            backup_date = extract_backup_date_from_email(subject, body, email_date)
            
            # Match company
            companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
            matched_company = {}
            text = (subject + " " + body + " " + from_addr).lower()
            for c in companies:
                for pattern in c.get("email_patterns", []):
                    if pattern.lower() in text:
                        matched_company = c
                        break
                if matched_company:
                    break
                if c["name"].lower() in text:
                    matched_company = c
                    break
            
            company_id = matched_company.get("id", "")
            company_name = matched_company.get("name", "Necunoscut")
            
            # Create backup entries
            for entry in parsed_entries:
                # Use entry-level backup_date if available, else use email-level
                entry_date = entry.get("backup_date") or backup_date
                doc = {
                    "id": str(ObjectId()),
                    "company_id": company_id,
                    "company_name": company_name,
                    "platform": entry.get("platform", platform),
                    "status": entry.get("status", "success"),
                    "details": entry.get("details", "")[:2000],
                    "backup_date": entry_date,
                    "size": entry.get("size", ""),
                    "duration": entry.get("duration", ""),
                    "source": "imap_sync",
                    "vm_name": entry.get("vm_name", ""),
                    "job_name": entry.get("job_name", ""),
                    "start_time": entry.get("start_time", ""),
                    "end_time": entry.get("end_time", ""),
                    "read": entry.get("read", ""),
                    "transferred": entry.get("transferred", ""),
                    "email_subject": subject[:500],
                    "from_address": from_addr,
                    "email_body": body[:5000],
                    "email_date": email_date,
                    "is_unknown": (not company_id) or (platform == "Necunoscut"),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.backups.insert_one(doc)
                created_backups.append(doc)
        
        # Log sync
        log_entry = {
            "id": str(ObjectId()),
            "sync_type": "manual",
            "emails_processed": len(result.get("emails", [])),
            "backups_created": len(created_backups),
            "alerts_created": len(created_alerts),
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "success": True
        }
        await db.imap_sync_log.insert_one(log_entry)
        
        # Update last sync time
        await db.imap_settings.update_one({}, {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}})
        
        return {
            "status": "ok",
            "message": f"Sincronizat {len(result.get('emails', []))} email-uri, creat {len(created_backups)} intrari de backup, {len(created_alerts)} alerte sistem",
            "emails_processed": len(result.get("emails", [])),
            "backups_created": len(created_backups),
            "alerts_created": len(created_alerts)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Eroare la sincronizare: {str(e)}")

@api_router.get("/settings/imap/log")
async def get_imap_sync_log(request: Request, limit: int = 20):
    """Get IMAP sync log"""
    await get_current_user(request)
    logs = await db.imap_sync_log.find({}, {"_id": 0}).sort("synced_at", -1).limit(limit).to_list(limit)
    return logs

async def _periodic_imap_sync():
    """Background task for periodic IMAP sync"""
    while True:
        try:
            settings = await db.imap_settings.find_one({}, {"_id": 0})
            if settings and settings.get("configured") and settings.get("auto_sync_enabled", True):
                interval_minutes = settings.get("sync_interval_minutes", 1)
                
                # Fetch and process emails
                result = await asyncio.to_thread(_fetch_and_process_emails, settings)
                if result["success"] and result.get("emails"):
                    # Process emails
                    created_count = 0
                    alerts_count = 0
                    for email_data in result.get("emails", []):
                        subject = email_data.get("subject", "")
                        body = email_data.get("body", "")
                        from_addr = email_data.get("from", "")
                        email_date = email_data.get("date", "")
                        
                        # Check if this is a system alert
                        alert_info = is_system_alert_email(subject, body)
                        if alert_info:
                            alert_doc = {
                                "id": str(ObjectId()),
                                "type": alert_info["type"],
                                "category": alert_info["category"],
                                "severity": alert_info["severity"],
                                "message": alert_info["message"],
                                "subject": subject[:500],
                                "body": body[:2000],
                                "from_address": from_addr,
                                "email_date": email_date,
                                "acknowledged": False,
                                "source": "imap_auto",
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.system_alerts.insert_one(alert_doc)
                            alerts_count += 1
                            continue
                        
                        parsed_entries = parse_backup_email(subject, body)
                        platform = detect_platform(subject, body)
                        backup_date = extract_backup_date_from_email(subject, body, email_date)
                        
                        # Match company
                        companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
                        matched_company = {}
                        text = (subject + " " + body + " " + from_addr).lower()
                        for c in companies:
                            for pattern in c.get("email_patterns", []):
                                if pattern.lower() in text:
                                    matched_company = c
                                    break
                            if matched_company:
                                break
                            if c["name"].lower() in text:
                                matched_company = c
                                break
                        
                        company_id = matched_company.get("id", "")
                        company_name = matched_company.get("name", "Necunoscut")
                        
                        for entry in parsed_entries:
                            entry_date = entry.get("backup_date") or backup_date
                            doc = {
                                "id": str(ObjectId()),
                                "company_id": company_id,
                                "company_name": company_name,
                                "platform": entry.get("platform", platform),
                                "status": entry.get("status", "success"),
                                "details": entry.get("details", "")[:2000],
                                "backup_date": entry_date,
                                "size": entry.get("size", ""),
                                "duration": entry.get("duration", ""),
                                "source": "imap_auto",
                                "vm_name": entry.get("vm_name", ""),
                                "job_name": entry.get("job_name", ""),
                                "start_time": entry.get("start_time", ""),
                                "end_time": entry.get("end_time", ""),
                                "read": entry.get("read", ""),
                                "transferred": entry.get("transferred", ""),
                                "email_subject": subject[:500],
                                "from_address": from_addr,
                                "email_body": body[:5000],
                                "email_date": email_date,
                                "is_unknown": (not company_id) or (platform == "Necunoscut"),
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.backups.insert_one(doc)
                            created_count += 1
                    
                    if created_count > 0:
                        log_entry = {
                            "id": str(ObjectId()),
                            "sync_type": "auto",
                            "emails_processed": len(result.get("emails", [])),
                            "backups_created": created_count,
                            "synced_at": datetime.now(timezone.utc).isoformat(),
                            "success": True
                        }
                        await db.imap_sync_log.insert_one(log_entry)
                    
                    await db.imap_settings.update_one({}, {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}})
                
                await asyncio.sleep(interval_minutes * 60)
            else:
                await asyncio.sleep(60)  # Check every minute if not configured
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"IMAP sync error: {e}")
            await asyncio.sleep(60)

# ─── Alert Check Interval ───
@api_router.get("/settings/alert-check")
async def get_alert_check_settings(request: Request):
    await get_current_user(request)
    settings = await db.alert_check_settings.find_one({}, {"_id": 0})
    return settings or {"interval_hours": 6, "enabled": True, "last_check": None}

@api_router.post("/settings/alert-check")
async def save_alert_check_settings(input_data: AlertCheckIntervalInput, request: Request):
    await get_current_user(request)
    await db.alert_check_settings.update_one({}, {"$set": {
        "interval_hours": input_data.interval_hours,
        "enabled": input_data.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }}, upsert=True)
    return await db.alert_check_settings.find_one({}, {"_id": 0})

# ─── Alert Email History ───
@api_router.get("/alerts/email-history")
async def get_alert_email_history(request: Request):
    await get_current_user(request)
    history = await db.alert_email_history.find({}, {"_id": 0}).sort("sent_at", -1).limit(50).to_list(50)
    return history

# ─── Check and Notify ───
async def _check_and_send_alerts():
    """Core logic: check for missing/failed backups and send email alerts."""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    alerts_data = []
    
    # Check failed backups today
    failed_backups = await db.backups.find({"status": "failed", "backup_date": today}, {"_id": 0}).to_list(1000)
    for fb in failed_backups:
        alerts_data.append({
            "type": "failed",
            "company_name": fb.get("company_name", "Necunoscut"),
            "platform": fb.get("platform", "-"),
            "backup_date": fb.get("backup_date", today),
            "details": fb.get("details", ""),
        })
    
    # Check missing backups
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    for c in companies:
        threshold_hours = c.get("alert_threshold_hours", 24)
        threshold_date = (now - timedelta(hours=threshold_hours)).strftime("%Y-%m-%d")
        recent = await db.backups.find_one({"company_id": c["id"], "backup_date": {"$gte": threshold_date}})
        if not recent:
            total_backups = await db.backups.count_documents({"company_id": c["id"]})
            if total_backups > 0:
                last_backup = await db.backups.find_one({"company_id": c["id"]}, {"_id": 0}, sort=[("backup_date", -1)])
                alerts_data.append({
                    "type": "missing",
                    "company_name": c["name"],
                    "platforms": ", ".join(c.get("platforms", [])),
                    "last_backup": last_backup["backup_date"] if last_backup else "N/A",
                    "threshold": str(threshold_hours),
                })
    
    if not alerts_data:
        return {"status": "ok", "message": "Nu exista alerte de trimis", "alerts_count": 0, "email_sent": False}
    
    # Get SMTP settings
    smtp_settings = await db.smtp_settings.find_one({}, {"_id": 0})
    if not smtp_settings or not smtp_settings.get("configured"):
        return {"status": "warning", "message": "SMTP neconfigurat - alertele nu pot fi trimise pe email", "alerts_count": len(alerts_data), "email_sent": False}
    
    # Get recipients
    recipients = await db.alert_recipients.find({}, {"_id": 0}).to_list(100)
    if not recipients:
        return {"status": "warning", "message": "Nu exista destinatari configurati", "alerts_count": len(alerts_data), "email_sent": False}
    
    to_emails = [r["email"] for r in recipients]
    check_time = now.strftime("%d.%m.%Y %H:%M UTC")
    
    failed_count = sum(1 for a in alerts_data if a["type"] == "failed")
    missing_count = sum(1 for a in alerts_data if a["type"] == "missing")
    subject = f"[Backup Monitor] {failed_count} esuate, {missing_count} lipsa - {now.strftime('%d.%m.%Y')}"
    
    html_body = _build_alert_email_html(alerts_data, check_time)
    
    result = await asyncio.to_thread(_send_smtp_email,
        settings=smtp_settings,
        to_emails=to_emails,
        subject=subject,
        html_body=html_body
    )
    
    # Log the send
    log_entry = {
        "id": str(ObjectId()),
        "sent_at": now.isoformat(),
        "recipients": to_emails,
        "alerts_count": len(alerts_data),
        "failed_count": failed_count,
        "missing_count": missing_count,
        "success": result["success"],
        "error": result.get("error", ""),
        "subject": subject
    }
    await db.alert_email_history.insert_one(log_entry)
    
    # Update last check time
    await db.alert_check_settings.update_one({}, {"$set": {"last_check": now.isoformat()}}, upsert=True)
    
    if result["success"]:
        return {
            "status": "ok",
            "message": f"Trimis {len(alerts_data)} alerte la {len(to_emails)} destinatari",
            "alerts_count": len(alerts_data),
            "email_sent": True,
            "recipients": to_emails
        }
    else:
        return {
            "status": "error",
            "message": f"Eroare la trimiterea email-ului: {result['error']}",
            "alerts_count": len(alerts_data),
            "email_sent": False
        }

@api_router.post("/alerts/check-and-notify")
async def check_and_notify(request: Request):
    """Manual trigger: check for alerts and send email notifications."""
    await get_current_user(request)
    return await _check_and_send_alerts()

# ─── Background Alert Checker ───
_alert_checker_task = None

async def _periodic_alert_checker():
    """Background task that checks for alerts periodically."""
    while True:
        try:
            settings = await db.alert_check_settings.find_one({}, {"_id": 0})
            interval_hours = settings.get("interval_hours", 6) if settings else 6
            enabled = settings.get("enabled", True) if settings else True
            
            if enabled:
                smtp = await db.smtp_settings.find_one({}, {"_id": 0})
                recipients = await db.alert_recipients.find({}, {"_id": 0}).to_list(1)
                if smtp and smtp.get("configured") and recipients:
                    await _check_and_send_alerts()
                    logger.info("Verificare periodica alerte completata")
            
            await asyncio.sleep(interval_hours * 3600)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Eroare in verificarea periodica: {e}")
            await asyncio.sleep(300)  # Retry in 5 min on error

# ─── Seed ───
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@backupmonitor.ro")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Administrator",
            "role": "admin",
            "allowed_companies": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Seed default platforms
    default_platforms = [
        {"id": "proxmox", "name": "Proxmox", "icon": "server"},
        {"id": "synology", "name": "Synology", "icon": "hard-drive"},
        {"id": "qnap", "name": "QNAP", "icon": "hard-drive"},
        {"id": "veeam", "name": "Veeam", "icon": "cloud"},
    ]
    for p in default_platforms:
        existing_p = await db.platforms.find_one({"id": p["id"]})
        if not existing_p:
            await db.platforms.insert_one(p)

    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n")
        f.write("## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/register\n- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n")

async def seed_demo_data():
    """Seed demo data for testing"""
    companies_count = await db.companies.count_documents({})
    if companies_count > 0:
        return

@app.on_event("startup")
async def startup():
    global _alert_checker_task
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.backups.create_index("company_id")
    await db.backups.create_index("backup_date")
    await db.backups.create_index("platform")
    await db.backups.create_index("status")
    await db.webhook_log.create_index("received_at")
    await db.alert_email_history.create_index("sent_at")
    await db.imap_sync_log.create_index("synced_at")
    await db.system_alerts.create_index("created_at")
    await seed_admin()
    await seed_demo_data()
    # Start background alert checker
    _alert_checker_task = asyncio.create_task(_periodic_alert_checker())
    # Start background IMAP sync
    global _imap_sync_task
    _imap_sync_task = asyncio.create_task(_periodic_imap_sync())

# ─── Report Export (PDF / XLSX / DOCX cu antet) ───
class ReportExportInput(BaseModel):
    format: str = "pdf"  # pdf | xlsx | docx | csv
    scope: str = "all"   # all | company
    company_id: Optional[str] = None           # backward compat (single)
    company_ids: Optional[List[str]] = None    # multi-select pentru scope=all
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    only_unknown: bool = False
    columns: List[str] = []

@api_router.post("/reports/export")
async def export_report(input: ReportExportInput, request: Request):
    user = await get_current_user(request)
    query = {}
    company_name = ""

    if input.scope == "company" and input.company_id:
        if input.company_id == "unknown":
            query["$or"] = [{"company_id": ""}, {"company_id": None}, {"company_name": "Necunoscut"}]
            company_name = "Necunoscut"
        else:
            query["company_id"] = input.company_id
            comp = await db.companies.find_one({"id": input.company_id}, {"_id": 0})
            company_name = comp.get("name", "") if comp else ""
    elif input.scope == "all" and input.company_ids:
        # Multi-select: filtreaza pe lista de companii
        ids = [c for c in input.company_ids if c and c != "all"]
        include_unknown = "unknown" in (input.company_ids or [])
        or_clauses = []
        if ids:
            or_clauses.append({"company_id": {"$in": ids}})
        if include_unknown:
            or_clauses.append({"$or": [{"company_id": ""}, {"company_id": None}, {"company_name": "Necunoscut"}]})
        if or_clauses:
            query["$or" if len(or_clauses) > 1 else "$and"] = or_clauses if len(or_clauses) > 1 else None
            if len(or_clauses) == 1:
                query.pop("$and", None)
                query.update(or_clauses[0])
        # construieste numele pentru titlu
        names = []
        if ids:
            comps = await db.companies.find({"id": {"$in": ids}}, {"_id": 0, "name": 1}).to_list(1000)
            names = [c.get("name", "") for c in comps if c.get("name")]
        if include_unknown:
            names.append("Necunoscut")
        if len(names) == 1:
            company_name = names[0]
        elif len(names) > 1:
            preview = ", ".join(names[:3]) + ("…" if len(names) > 3 else "")
            company_name = f"{len(names)} companii ({preview})"

    if input.platform:
        query["platform"] = "Necunoscut" if input.platform == "Unknown" else input.platform
    if input.status:
        query["status"] = input.status
    if input.only_unknown:
        query["$or"] = [{"company_id": ""}, {"company_id": None}, {"company_name": "Necunoscut"}]
    if input.date_from or input.date_to:
        date_filter = {}
        if input.date_from: date_filter["$gte"] = input.date_from
        if input.date_to: date_filter["$lte"] = input.date_to
        query["backup_date"] = date_filter

    # Restrictie pentru non-admin
    if user.get("role") != "admin" and user.get("allowed_companies"):
        if input.scope == "company" and input.company_id and input.company_id not in user["allowed_companies"]:
            raise HTTPException(status_code=403, detail="Acces interzis la aceasta companie")
        if input.scope != "company":
            query["company_id"] = {"$in": user["allowed_companies"]}

    backups = await db.backups.find(query, {"_id": 0}).sort("backup_date", -1).to_list(50000)

    cols = input.columns or ["company_name", "platform", "vm_name", "status", "backup_date", "size", "duration"]
    fmt = (input.format or "pdf").lower()

    try:
        if fmt == "pdf":
            content = report_export.generate_pdf(backups, cols, input.scope, company_name, input.date_from or "", input.date_to or "")
            media = "application/pdf"; ext = "pdf"
        elif fmt == "xlsx":
            content = report_export.generate_xlsx(backups, cols, input.scope, company_name, input.date_from or "", input.date_to or "")
            media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; ext = "xlsx"
        elif fmt == "docx":
            content = report_export.generate_docx(backups, cols, input.scope, company_name, input.date_from or "", input.date_to or "")
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; ext = "docx"
        elif fmt == "csv":
            content = report_export.generate_csv(backups, cols)
            media = "text/csv"; ext = "csv"
        else:
            raise HTTPException(status_code=400, detail="Format invalid (pdf/xlsx/docx/csv)")
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Lipseste o dependinta pentru export: {e}")

    safe_name = (company_name or "Toate").replace(" ", "_").replace("/", "_").replace(",", "")[:60] or "Toate"
    filename = f"Raport_Backup_{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
    return StreamingResponse(io.BytesIO(content), media_type=media,
                             headers={"Content-Disposition": f"attachment; filename={filename}"})

@api_router.get("/settings/report-header")
async def get_report_header_status(request: Request):
    await get_current_user(request)
    has_custom = any((report_export.ASSETS_DIR / f"header_custom.{e}").exists() for e in ("jpg", "jpeg", "png"))
    return {"has_custom": has_custom, "active_path": report_export.get_header_path()}

@api_router.post("/settings/report-header")
async def upload_report_header(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Doar adminul poate schimba antetul")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fisier prea mare (max 5MB)")
    try:
        report_export.save_custom_header(content, file.filename or "header.jpg")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Antet personalizat salvat", "has_custom": True}

@api_router.delete("/settings/report-header")
async def delete_report_header(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Doar adminul poate reseta antetul")
    report_export.reset_header()
    return {"message": "Antet resetat la default"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), os.environ.get("CORS_ORIGINS", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global _alert_checker_task, _imap_sync_task
    if _alert_checker_task:
        _alert_checker_task.cancel()
    if _imap_sync_task:
        _imap_sync_task.cancel()
    client.close()
