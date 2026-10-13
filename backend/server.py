"""Convive - Backend API for multi-tenant condo common area bookings."""
import os
import uuid
import secrets
import logging
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Literal
from contextlib import asynccontextmanager

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, status, UploadFile, File
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
ACCESS_MINUTES = 60 * 24 * 7  # 7 days

SUPER_EMAIL = os.environ["SUPER_EMAIL"]
SUPER_PASSWORD = os.environ["SUPER_PASSWORD"]

# ---- Emergent Object Storage ----
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "convive"
_storage_key: Optional[str] = None

def _init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key

def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 503:
        # stale key -> reset and retry once
        globals()["_storage_key"] = None
        key = _init_storage()
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def _get_object(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("convive")

# ---------- helpers ----------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def new_id() -> str:
    return str(uuid.uuid4())

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

def issue_token(user: dict) -> str:
    exp = now_utc() + timedelta(minutes=ACCESS_MINUTES)
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "building_id": user.get("building_id"),
        "iat": int(now_utc().timestamp()),
        "exp": int(exp.timestamp()),
        "jti": secrets.token_urlsafe(8),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Token requerido")
    try:
        p = jwt.decode(authorization[7:].strip(), JWT_SECRET, algorithms=[JWT_ALGO])
        u = await db.users.find_one({"id": p["sub"]})
        if not u:
            raise HTTPException(401, "Usuário não encontrado")
        return u
    except jwt.PyJWTError:
        raise HTTPException(401, "Token inválido ou expirado")

async def require_role(user: dict, roles: List[str]):
    if user["role"] not in roles:
        raise HTTPException(403, "Acesso negado")

# ---------- Models ----------

class LoginResidentIn(BaseModel):
    building_id: str
    tower_id: str
    apartment: str
    password: str

class LoginAdminIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    user: dict

class BuildingIn(BaseModel):
    name: str
    cnpj: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    cep: Optional[str] = None
    phone: Optional[str] = None
    logo_url: Optional[str] = None
    default_condo_fee: Optional[float] = None

class TowerIn(BaseModel):
    name: str

class ApartmentImportIn(BaseModel):
    tower_id: str
    numbers: List[str]

class AreaIn(BaseModel):
    name: str
    description: Optional[str] = ""
    photo_url: Optional[str] = None
    capacity: Optional[int] = None
    tower_ids: List[str] = Field(default_factory=list)  # empty = all
    booking_type: Literal["day", "shift"] = "day"
    shifts: List[dict] = Field(default_factory=list)  # [{name,start,end}]
    fee_type: Literal["fixed", "percent", "free"] = "fixed"
    fee_value: float = 0.0
    cleaning_fee: float = 0.0
    rules: Optional[str] = ""
    active: bool = True

class RegisterResidentIn(BaseModel):
    building_id: str
    tower_id: str
    apartment: str
    name: str
    phone: str
    email: EmailStr
    password: str = Field(min_length=6)

class ReservationIn(BaseModel):
    area_id: str
    date: str  # YYYY-MM-DD
    shift_index: Optional[int] = None
    accepted_rules: bool = True

class BusinessRulesIn(BaseModel):
    min_days_ahead: int = 2
    max_days_ahead: int = 60
    max_active_per_apt: int = 2
    free_cancel_hours: int = 24
    late_cancel_charge: Literal["none", "cleaning", "full"] = "cleaning"

class ResidentEditIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    tower_id: Optional[str] = None
    apartment: Optional[str] = None
    status: Optional[Literal["pending", "approved"]] = None

class PhotoUploadIn(BaseModel):
    filename: Optional[str] = "photo.jpg"
    content_type: Optional[str] = "image/jpeg"
    data_base64: str  # raw base64 (no data:image/...; prefix)

# ---------- Lifespan / seed ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("id", unique=True)
    await db.buildings.create_index("id", unique=True)
    await db.towers.create_index("id", unique=True)
    await db.areas.create_index("id", unique=True)
    await db.reservations.create_index([("area_id", 1), ("date", 1), ("shift_index", 1)])
    await seed()
    try:
        await run_in_threadpool(_init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed: {e}")
    yield
    client.close()

async def seed():
    # Super admin
    if not await db.users.find_one({"email": SUPER_EMAIL}):
        await db.users.insert_one({
            "id": new_id(), "role": "super_admin", "email": SUPER_EMAIL,
            "name": "Super Administrador",
            "password_hash": hash_password(SUPER_PASSWORD),
            "building_id": None, "created_at": now_utc(), "failed": 0, "locked_until": None,
        })
        logger.info(f"Seeded super admin {SUPER_EMAIL}")

    # Skip if buildings already seeded
    if await db.buildings.find_one({}):
        return

    # Alpinus
    alpinus_id = new_id()
    await db.buildings.insert_one({
        "id": alpinus_id, "name": "Condomínio Alpinus", "city": "São Paulo", "state": "SP",
        "cep": "01310-100", "address": "Av. Paulista, 1000", "phone": "(11) 3000-0000",
        "logo_url": None, "default_condo_fee": 800.0, "active": True, "created_at": now_utc(),
    })
    tower_a = new_id(); tower_b = new_id()
    await db.towers.insert_many([
        {"id": tower_a, "building_id": alpinus_id, "name": "Torre A", "apartments": ["101","102","201","202"], "created_at": now_utc()},
        {"id": tower_b, "building_id": alpinus_id, "name": "Torre B", "apartments": ["101","102","201","202"], "created_at": now_utc()},
    ])
    # Admin Alpinus
    admin_alpinus_id = new_id()
    await db.users.insert_one({
        "id": admin_alpinus_id, "role": "admin", "email": "sindico@alpinus.com", "name": "Síndico Alpinus",
        "password_hash": hash_password("Alpinus@2026"), "building_id": alpinus_id,
        "created_at": now_utc(), "failed": 0, "locked_until": None,
    })
    # Areas Alpinus
    await db.areas.insert_many([
        {"id": new_id(), "building_id": alpinus_id, "name": "Salão de Festas + Churrasqueira",
         "description": "Ambiente completo para eventos", "photo_url": "https://images.unsplash.com/photo-1762176263996-a0713a49ee4d?w=600",
         "capacity": 40, "tower_ids": [], "booking_type": "day", "shifts": [],
         "fee_type": "fixed", "fee_value": 150.0, "cleaning_fee": 100.0,
         "rules": "Uso permitido das 10h às 23h. Silêncio após 22h.", "active": True, "created_at": now_utc()},
        {"id": new_id(), "building_id": alpinus_id, "name": "Churrasqueira da Cobertura",
         "description": "Vista panorâmica na cobertura", "photo_url": "https://images.unsplash.com/photo-1534797258760-1bd2cc95a5bd?w=600",
         "capacity": 20, "tower_ids": [], "booking_type": "day", "shifts": [],
         "fee_type": "fixed", "fee_value": 80.0, "cleaning_fee": 50.0,
         "rules": "Deixar limpo após uso.", "active": True, "created_at": now_utc()},
    ])
    # Residents Alpinus
    await db.users.insert_many([
        {"id": new_id(), "role": "resident", "email": "morador1@alpinus.com", "name": "João Silva",
         "phone": "(11) 99999-0001", "password_hash": hash_password("Morador@2026"),
         "building_id": alpinus_id, "tower_id": tower_a, "apartment": "101",
         "status": "approved", "created_at": now_utc(), "failed": 0, "locked_until": None},
        {"id": new_id(), "role": "resident", "email": "morador2@alpinus.com", "name": "Maria Souza",
         "phone": "(11) 99999-0002", "password_hash": hash_password("Morador@2026"),
         "building_id": alpinus_id, "tower_id": tower_b, "apartment": "101",
         "status": "approved", "created_at": now_utc(), "failed": 0, "locked_until": None},
    ])
    await db.rules.insert_one({"building_id": alpinus_id, "min_days_ahead": 2, "max_days_ahead": 60,
                                "max_active_per_apt": 2, "free_cancel_hours": 24, "late_cancel_charge": "cleaning"})

    # Horizonte
    horiz_id = new_id()
    await db.buildings.insert_one({
        "id": horiz_id, "name": "Residencial Horizonte", "city": "Rio de Janeiro", "state": "RJ",
        "cep": "22000-000", "address": "Rua da Praia, 500", "phone": "(21) 3000-0000",
        "logo_url": None, "default_condo_fee": 800.0, "active": True, "created_at": now_utc(),
    })
    tower_u = new_id()
    await db.towers.insert_one({"id": tower_u, "building_id": horiz_id, "name": "Torre única",
                                 "apartments": ["101","102","201"], "single": True, "created_at": now_utc()})
    admin_h = new_id()
    await db.users.insert_one({
        "id": admin_h, "role": "admin", "email": "sindico@horizonte.com", "name": "Síndico Horizonte",
        "password_hash": hash_password("Horizonte@2026"), "building_id": horiz_id,
        "created_at": now_utc(), "failed": 0, "locked_until": None,
    })
    await db.areas.insert_many([
        {"id": new_id(), "building_id": horiz_id, "name": "Salão de Festas",
         "description": "Salão amplo com cozinha", "photo_url": "https://images.unsplash.com/photo-1762176263996-a0713a49ee4d?w=600",
         "capacity": 30, "tower_ids": [], "booking_type": "day", "shifts": [],
         "fee_type": "percent", "fee_value": 10.0, "cleaning_fee": 100.0,
         "rules": "Uso conforme regulamento interno.", "active": True, "created_at": now_utc()},
        {"id": new_id(), "building_id": horiz_id, "name": "Quadra",
         "description": "Quadra poliesportiva", "photo_url": "https://images.unsplash.com/photo-1630703178182-f69a2d617ddb?w=600",
         "capacity": 20, "tower_ids": [], "booking_type": "shift",
         "shifts": [{"name":"Manhã","start":"08:00","end":"12:00"},{"name":"Tarde","start":"14:00","end":"18:00"},{"name":"Noite","start":"19:00","end":"22:00"}],
         "fee_type": "free", "fee_value": 0.0, "cleaning_fee": 0.0,
         "rules": "Uso responsável do espaço.", "active": True, "created_at": now_utc()},
    ])
    await db.rules.insert_one({"building_id": horiz_id, "min_days_ahead": 2, "max_days_ahead": 60,
                                "max_active_per_apt": 2, "free_cancel_hours": 24, "late_cancel_charge": "cleaning"})

    logger.info("Seed data created (Alpinus + Horizonte)")

app = FastAPI(title="Convive API", lifespan=lifespan)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

# ---------- Public endpoints ----------

@api.get("/")
async def root():
    return {"app": "Convive", "status": "ok"}

@api.get("/buildings/search")
async def search_buildings(q: str = ""):
    query = {"active": True}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"cep": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.buildings.find(query, {"_id": 0}).to_list(50)
    return docs

@api.get("/buildings/{building_id}/towers")
async def get_towers(building_id: str):
    docs = await db.towers.find({"building_id": building_id}, {"_id": 0}).to_list(100)
    return docs

@api.post("/auth/register-resident")
async def register_resident(body: RegisterResidentIn):
    building = await db.buildings.find_one({"id": body.building_id})
    if not building:
        raise HTTPException(404, "Prédio não encontrado")
    tower = await db.towers.find_one({"id": body.tower_id, "building_id": body.building_id})
    if not tower:
        raise HTTPException(404, "Torre não encontrada")
    existing = await db.users.find_one({
        "building_id": body.building_id, "tower_id": body.tower_id,
        "apartment": body.apartment, "role": "resident",
    })
    if existing:
        raise HTTPException(400, "Este apartamento já possui um cadastro principal")
    uid = new_id()
    await db.users.insert_one({
        "id": uid, "role": "resident", "email": str(body.email).lower(), "name": body.name,
        "phone": body.phone, "password_hash": hash_password(body.password),
        "building_id": body.building_id, "tower_id": body.tower_id, "apartment": body.apartment,
        "status": "pending", "created_at": now_utc(), "failed": 0, "locked_until": None,
    })
    return {"id": uid, "status": "pending", "message": "Cadastro enviado, aguardando aprovação do síndico"}

async def _auth_attempt(user: Optional[dict], password: str):
    if not user:
        raise HTTPException(401, "Credenciais inválidas")
    if user.get("locked_until") and user["locked_until"] > now_utc():
        raise HTTPException(423, "Acesso temporariamente bloqueado. Tente em 15 minutos.")
    if not verify_password(password, user["password_hash"]):
        failed = user.get("failed", 0) + 1
        update = {"failed": failed}
        if failed >= 5:
            update["locked_until"] = now_utc() + timedelta(minutes=15)
            update["failed"] = 0
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        raise HTTPException(401, "Credenciais inválidas")
    await db.users.update_one({"id": user["id"]}, {"$set": {"failed": 0, "locked_until": None}})
    return user

@api.post("/auth/login-resident", response_model=TokenOut)
async def login_resident(body: LoginResidentIn):
    user = await db.users.find_one({
        "role": "resident", "building_id": body.building_id,
        "tower_id": body.tower_id, "apartment": body.apartment,
    })
    user = await _auth_attempt(user, body.password)
    if user.get("status") != "approved":
        return TokenOut(access_token=issue_token(user), user={
            **clean(dict(user)), "status": user.get("status", "pending"),
        })
    return TokenOut(access_token=issue_token(user), user=clean(dict(user)))

@api.post("/auth/login-admin", response_model=TokenOut)
async def login_admin(body: LoginAdminIn):
    user = await db.users.find_one({"email": str(body.email).lower(),
                                     "role": {"$in": ["admin", "super_admin"]}})
    user = await _auth_attempt(user, body.password)
    return TokenOut(access_token=issue_token(user), user=clean(dict(user)))

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    out = clean(dict(user))
    if out.get("building_id"):
        b = await db.buildings.find_one({"id": out["building_id"]}, {"_id": 0})
        out["building"] = b
        if out.get("tower_id"):
            t = await db.towers.find_one({"id": out["tower_id"]}, {"_id": 0})
            out["tower"] = t
    return out

# ---------- Resident endpoints ----------

@api.get("/areas")
async def list_areas(user=Depends(current_user)):
    if user["role"] not in ("resident", "admin", "super_admin"):
        raise HTTPException(403)
    if user["role"] == "resident" and user.get("status") != "approved":
        raise HTTPException(403, "Cadastro pendente de aprovação")
    building_id = user.get("building_id")
    if not building_id:
        return []
    q = {"building_id": building_id, "active": True}
    docs = await db.areas.find(q, {"_id": 0}).to_list(200)
    if user["role"] == "resident":
        tid = user.get("tower_id")
        docs = [d for d in docs if not d.get("tower_ids") or tid in d["tower_ids"]]
    b = await db.buildings.find_one({"id": building_id}, {"_id": 0})
    condo_fee = (b or {}).get("default_condo_fee") or 0.0
    for d in docs:
        if d["fee_type"] == "fixed":
            d["total"] = d["fee_value"] + d["cleaning_fee"]
            d["usage"] = d["fee_value"]
        elif d["fee_type"] == "percent":
            usage = round(condo_fee * (d["fee_value"] / 100.0), 2)
            d["usage"] = usage
            d["total"] = usage + d["cleaning_fee"]
        else:
            d["total"] = 0.0
            d["usage"] = 0.0
    return docs

@api.get("/areas/{area_id}")
async def get_area(area_id: str, user=Depends(current_user)):
    a = await db.areas.find_one({"id": area_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Área não encontrada")
    if user["role"] == "resident" and a["building_id"] != user.get("building_id"):
        raise HTTPException(403)
    return a

@api.get("/areas/{area_id}/reservations")
async def area_reservations(area_id: str, month: str, user=Depends(current_user)):
    """month: YYYY-MM"""
    a = await db.areas.find_one({"id": area_id})
    if not a:
        raise HTTPException(404)
    if user["role"] == "resident" and a["building_id"] != user.get("building_id"):
        raise HTTPException(403)
    q = {"area_id": area_id, "date": {"$regex": f"^{month}"}, "status": {"$ne": "cancelled"}}
    docs = await db.reservations.find(q, {"_id": 0}).to_list(500)
    is_admin = user["role"] in ("admin", "super_admin")
    result = []
    for d in docs:
        item = {"date": d["date"], "shift_index": d.get("shift_index"), "status": d["status"]}
        if is_admin:
            item.update({"id": d["id"], "resident_name": d.get("resident_name"),
                         "apartment": d.get("apartment"), "tower_name": d.get("tower_name"),
                         "total": d.get("total")})
        result.append(item)
    return result

@api.post("/reservations")
async def create_reservation(body: ReservationIn, user=Depends(current_user)):
    if user["role"] != "resident" or user.get("status") != "approved":
        raise HTTPException(403, "Apenas moradores aprovados podem reservar")
    area = await db.areas.find_one({"id": body.area_id})
    if not area or area["building_id"] != user["building_id"]:
        raise HTTPException(404)
    if not body.accepted_rules:
        raise HTTPException(400, "É necessário aceitar as regras")
    # rules
    rules = await db.rules.find_one({"building_id": user["building_id"]}) or {}
    try:
        date_obj = datetime.strptime(body.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Data inválida")
    today = now_utc().date()
    days_ahead = (date_obj - today).days
    if days_ahead < rules.get("min_days_ahead", 2):
        raise HTTPException(400, f"Antecedência mínima: {rules.get('min_days_ahead', 2)} dias")
    if days_ahead > rules.get("max_days_ahead", 60):
        raise HTTPException(400, f"Antecedência máxima: {rules.get('max_days_ahead', 60)} dias")
    # active count
    active = await db.reservations.count_documents({
        "resident_id": user["id"], "date": {"$gte": today.isoformat()},
        "status": {"$in": ["confirmed", "pending"]},
    })
    if active >= rules.get("max_active_per_apt", 2):
        raise HTTPException(400, f"Limite de {rules.get('max_active_per_apt', 2)} reservas ativas atingido")
    # Duplicate check
    dup_q = {"area_id": body.area_id, "date": body.date, "status": {"$ne": "cancelled"}}
    if area["booking_type"] == "shift":
        if body.shift_index is None:
            raise HTTPException(400, "Turno obrigatório")
        dup_q["shift_index"] = body.shift_index
    if await db.reservations.find_one(dup_q):
        raise HTTPException(409, "Horário já reservado")
    # Calc value
    building = await db.buildings.find_one({"id": user["building_id"]}) or {}
    condo_fee = building.get("default_condo_fee") or 0.0
    if area["fee_type"] == "fixed":
        usage = area["fee_value"]
    elif area["fee_type"] == "percent":
        usage = round(condo_fee * (area["fee_value"] / 100.0), 2)
    else:
        usage = 0.0
    total = usage + area["cleaning_fee"]
    tower = await db.towers.find_one({"id": user["tower_id"]}) or {}
    rid = new_id()
    doc = {
        "id": rid, "area_id": body.area_id, "area_name": area["name"],
        "building_id": user["building_id"], "resident_id": user["id"],
        "resident_name": user["name"], "tower_id": user["tower_id"],
        "tower_name": tower.get("name"), "apartment": user["apartment"],
        "date": body.date, "shift_index": body.shift_index,
        "shift": area["shifts"][body.shift_index] if (body.shift_index is not None and body.shift_index < len(area.get("shifts", []))) else None,
        "usage": usage, "cleaning": area["cleaning_fee"], "total": total,
        "fee_type": area["fee_type"], "status": "confirmed",
        "charge_status": "pending", "created_at": now_utc(),
    }
    try:
        await db.reservations.insert_one(doc)
    except Exception:
        raise HTTPException(409, "Horário já reservado")
    return clean(dict(doc))

@api.get("/reservations/mine")
async def my_reservations(user=Depends(current_user)):
    if user["role"] != "resident":
        raise HTTPException(403)
    docs = await db.reservations.find({"resident_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
    return docs

@api.post("/reservations/{res_id}/cancel")
async def cancel_reservation(res_id: str, user=Depends(current_user)):
    r = await db.reservations.find_one({"id": res_id})
    if not r:
        raise HTTPException(404)
    if user["role"] == "resident" and r["resident_id"] != user["id"]:
        raise HTTPException(403)
    if user["role"] not in ("resident", "admin", "super_admin"):
        raise HTTPException(403)
    if r["status"] == "cancelled":
        raise HTTPException(400, "Já cancelada")
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "cancelled", "cancelled_at": now_utc()}})
    return {"ok": True}

# ---------- Admin endpoints ----------

@api.get("/admin/dashboard")
async def admin_dashboard(user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    bid = user.get("building_id")
    if not bid:
        raise HTTPException(400, "Selecione um prédio")
    month = now_utc().strftime("%Y-%m")
    reservas_mes = await db.reservations.count_documents({
        "building_id": bid, "date": {"$regex": f"^{month}"}, "status": {"$ne": "cancelled"}
    })
    pendentes = await db.users.count_documents({"building_id": bid, "role": "resident", "status": "pending"})
    total_pipe = [
        {"$match": {"building_id": bid, "date": {"$regex": f"^{month}"}, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
    ]
    agg = await db.reservations.aggregate(total_pipe).to_list(1)
    valor_total = agg[0]["sum"] if agg else 0.0
    total_moradores = await db.users.count_documents({"building_id": bid, "role": "resident", "status": "approved"})
    total_areas = await db.areas.count_documents({"building_id": bid, "active": True})
    return {
        "reservas_mes": reservas_mes, "cadastros_pendentes": pendentes,
        "valor_total_mes": valor_total, "total_moradores": total_moradores,
        "total_areas": total_areas,
    }

@api.get("/admin/pending-residents")
async def pending_residents(user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    docs = await db.users.find({"building_id": user["building_id"], "role": "resident", "status": "pending"},
                                {"_id": 0, "password_hash": 0}).to_list(200)
    for d in docs:
        t = await db.towers.find_one({"id": d.get("tower_id")})
        d["tower_name"] = (t or {}).get("name")
    return docs

@api.post("/admin/residents/{uid}/approve")
async def approve_resident(uid: str, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    r = await db.users.find_one({"id": uid, "role": "resident"})
    if not r:
        raise HTTPException(404)
    if user["role"] == "admin" and r["building_id"] != user["building_id"]:
        raise HTTPException(403)
    await db.users.update_one({"id": uid}, {"$set": {"status": "approved"}})
    return {"ok": True}

@api.post("/admin/residents/{uid}/reject")
async def reject_resident(uid: str, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    r = await db.users.find_one({"id": uid, "role": "resident"})
    if not r:
        raise HTTPException(404)
    if user["role"] == "admin" and r["building_id"] != user["building_id"]:
        raise HTTPException(403)
    await db.users.delete_one({"id": uid})
    return {"ok": True}

@api.get("/admin/residents")
async def list_residents(user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    docs = await db.users.find({"building_id": user["building_id"], "role": "resident"},
                                {"_id": 0, "password_hash": 0}).to_list(500)
    for d in docs:
        t = await db.towers.find_one({"id": d.get("tower_id")})
        d["tower_name"] = (t or {}).get("name")
    return docs

@api.get("/admin/towers")
async def admin_towers(user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    docs = await db.towers.find({"building_id": user["building_id"]}, {"_id": 0}).to_list(100)
    return docs

@api.post("/admin/towers")
async def admin_add_tower(body: TowerIn, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    tid = new_id()
    await db.towers.insert_one({"id": tid, "building_id": user["building_id"], "name": body.name,
                                 "apartments": [], "created_at": now_utc()})
    return {"id": tid}

@api.put("/admin/towers/{tower_id}")
async def admin_edit_tower(tower_id: str, body: TowerIn, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    t = await db.towers.find_one({"id": tower_id})
    if not t or (user["role"] == "admin" and t["building_id"] != user["building_id"]):
        raise HTTPException(404, "Torre não encontrada")
    await db.towers.update_one({"id": tower_id}, {"$set": {"name": body.name}})
    return {"ok": True}

@api.delete("/admin/towers/{tower_id}")
async def admin_delete_tower(tower_id: str, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    t = await db.towers.find_one({"id": tower_id})
    if not t or (user["role"] == "admin" and t["building_id"] != user["building_id"]):
        raise HTTPException(404, "Torre não encontrada")
    has_residents = await db.users.find_one({"tower_id": tower_id, "role": "resident"})
    if has_residents:
        raise HTTPException(400, "Não é possível excluir: existem moradores cadastrados nesta torre")
    await db.towers.delete_one({"id": tower_id})
    return {"ok": True}

@api.post("/admin/areas")
async def admin_add_area(body: AreaIn, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    aid = new_id()
    doc = body.dict()
    doc.update({"id": aid, "building_id": user["building_id"], "created_at": now_utc()})
    await db.areas.insert_one(doc)
    return clean(dict(doc))

@api.get("/admin/reservations")
async def admin_reservations(user=Depends(current_user), month: Optional[str] = None):
    await require_role(user, ["admin", "super_admin"])
    q = {"building_id": user["building_id"]}
    if month:
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.reservations.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return docs

@api.post("/admin/reservations/{rid}/mark-paid")
async def mark_paid(rid: str, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    r = await db.reservations.find_one({"id": rid})
    if not r or r["building_id"] != user["building_id"]:
        raise HTTPException(404)
    await db.reservations.update_one({"id": rid}, {"$set": {"charge_status": "paid"}})
    return {"ok": True}

@api.get("/admin/rules")
async def get_rules(user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    r = await db.rules.find_one({"building_id": user["building_id"]}, {"_id": 0}) or {}
    return r

@api.put("/admin/rules")
async def set_rules(body: BusinessRulesIn, user=Depends(current_user)):
    await require_role(user, ["admin", "super_admin"])
    await db.rules.update_one({"building_id": user["building_id"]}, {"$set": body.dict()}, upsert=True)
    return {"ok": True}

# ---------- Super admin ----------

@api.get("/super/buildings")
async def super_buildings(user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    docs = await db.buildings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["residents"] = await db.users.count_documents({"building_id": d["id"], "role": "resident"})
    return docs

@api.post("/super/buildings")
async def super_create_building(body: BuildingIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    bid = new_id()
    doc = body.dict()
    doc.update({"id": bid, "active": True, "created_at": now_utc()})
    await db.buildings.insert_one(doc)
    return clean(dict(doc))

@api.put("/super/buildings/{bid}")
async def super_update_building(bid: str, body: BuildingIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    payload = {k: v for k, v in body.dict().items() if v is not None or k == "default_condo_fee"}
    await db.buildings.update_one({"id": bid}, {"$set": payload})
    return {"ok": True}

@api.delete("/super/buildings/{bid}")
async def super_delete_building(bid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    # Soft delete to preserve historical data (reservations, residents)
    await db.buildings.update_one({"id": bid}, {"$set": {"active": False, "deleted_at": now_utc()}})
    return {"ok": True}

@api.get("/super/stats")
async def super_stats(user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    return {
        "total_buildings": await db.buildings.count_documents({}),
        "total_residents": await db.users.count_documents({"role": "resident", "status": "approved"}),
        "total_reservations": await db.reservations.count_documents({"status": {"$ne": "cancelled"}}),
        "pending_residents": await db.users.count_documents({"role": "resident", "status": "pending"}),
    }

@api.get("/super/pending-residents")
async def super_pending_residents(user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    docs = await db.users.find({"role": "resident", "status": "pending"},
                                {"_id": 0, "password_hash": 0}).to_list(500)
    # Enrich each with building + tower names
    b_cache: dict = {}
    t_cache: dict = {}
    for d in docs:
        bid = d.get("building_id"); tid = d.get("tower_id")
        if bid and bid not in b_cache:
            b_cache[bid] = await db.buildings.find_one({"id": bid}, {"_id": 0})
        if tid and tid not in t_cache:
            t_cache[tid] = await db.towers.find_one({"id": tid}, {"_id": 0})
        d["building_name"] = (b_cache.get(bid) or {}).get("name")
        d["tower_name"] = (t_cache.get(tid) or {}).get("name")
    return docs

@api.get("/super/buildings/{bid}")
async def super_get_building(bid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    b["residents_count"] = await db.users.count_documents({"building_id": bid, "role": "resident", "status": "approved"})
    b["areas_count"] = await db.areas.count_documents({"building_id": bid, "active": True})
    b["towers"] = await db.towers.find({"building_id": bid}, {"_id": 0}).to_list(100)
    return b

@api.get("/super/buildings/{bid}/areas")
async def super_building_areas(bid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    docs = await db.areas.find({"building_id": bid, "active": {"$ne": False}}, {"_id": 0}).to_list(200)
    condo_fee = b.get("default_condo_fee") or 0.0
    for d in docs:
        if d["fee_type"] == "fixed":
            d["usage"] = d["fee_value"]; d["total"] = d["fee_value"] + d["cleaning_fee"]
        elif d["fee_type"] == "percent":
            usage = round(condo_fee * (d["fee_value"] / 100.0), 2)
            d["usage"] = usage; d["total"] = usage + d["cleaning_fee"]
        else:
            d["usage"] = 0.0; d["total"] = 0.0
    return docs

@api.post("/super/buildings/{bid}/areas")
async def super_add_area(bid: str, body: AreaIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    aid = new_id()
    doc = body.dict()
    doc.update({"id": aid, "building_id": bid, "created_at": now_utc()})
    await db.areas.insert_one(doc)
    return clean(dict(doc))

@api.put("/super/areas/{aid}")
async def super_update_area(aid: str, body: AreaIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    a = await db.areas.find_one({"id": aid})
    if not a:
        raise HTTPException(404, "Área não encontrada")
    # exclude_none to avoid wiping fields (like photo_url) not sent by the client
    payload = body.dict(exclude_none=True)
    await db.areas.update_one({"id": aid}, {"$set": payload})
    return {"ok": True}

@api.delete("/super/areas/{aid}")
async def super_delete_area(aid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    a = await db.areas.find_one({"id": aid})
    if not a:
        raise HTTPException(404, "Área não encontrada")
    # Hard delete when there are no reservations for this area; otherwise soft delete
    has_res = await db.reservations.find_one({"area_id": aid})
    if has_res:
        await db.areas.update_one({"id": aid}, {"$set": {"active": False, "deleted_at": now_utc()}})
        return {"ok": True, "mode": "soft"}
    await db.areas.delete_one({"id": aid})
    return {"ok": True, "mode": "hard"}

# ---------- Object storage: image upload for areas ----------

@api.post("/super/areas/{aid}/photo")
async def super_upload_area_photo(aid: str, body: PhotoUploadIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    a = await db.areas.find_one({"id": aid})
    if not a:
        raise HTTPException(404, "Área não encontrada")
    if not EMERGENT_KEY:
        raise HTTPException(500, "Armazenamento indisponível")
    import base64
    raw = body.data_base64
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        content = base64.b64decode(raw)
    except Exception:
        raise HTTPException(400, "Imagem inválida (base64)")
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máximo 8 MB)")
    ext = (body.filename or "img.jpg").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{APP_NAME}/areas/{aid}/{new_id()}.{ext}"
    ct = body.content_type or "image/jpeg"
    try:
        await run_in_threadpool(_put_object, path, content, ct)
    except requests.HTTPError as e:
        raise HTTPException(502, f"Falha no upload: {e.response.status_code}")
    photo_url = f"/api/files/{path}"
    await db.areas.update_one({"id": aid}, {"$set": {"photo_url": photo_url}})
    return {"photo_url": photo_url}

@api.get("/files/{full_path:path}")
async def get_file(full_path: str):
    if not EMERGENT_KEY:
        raise HTTPException(404)
    try:
        data, ct = await run_in_threadpool(_get_object, full_path)
    except requests.HTTPError:
        raise HTTPException(404, "Arquivo não encontrado")
    return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=3600"})

# ---------- Super: Towers management ----------

@api.get("/super/buildings/{bid}/towers")
async def super_list_towers(bid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    towers = await db.towers.find({"building_id": bid}, {"_id": 0}).to_list(200)
    for t in towers:
        t["residents_count"] = await db.users.count_documents({"tower_id": t["id"], "role": "resident"})
    return towers

@api.post("/super/buildings/{bid}/towers")
async def super_add_tower(bid: str, body: TowerIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    tid = new_id()
    await db.towers.insert_one({"id": tid, "building_id": bid, "name": body.name,
                                 "apartments": [], "created_at": now_utc()})
    return {"id": tid}

@api.put("/super/towers/{tid}")
async def super_update_tower(tid: str, body: TowerIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    t = await db.towers.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Torre não encontrada")
    await db.towers.update_one({"id": tid}, {"$set": {"name": body.name}})
    return {"ok": True}

@api.delete("/super/towers/{tid}")
async def super_delete_tower(tid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    t = await db.towers.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Torre não encontrada")
    has_residents = await db.users.find_one({"tower_id": tid, "role": "resident"})
    if has_residents:
        raise HTTPException(400, "Não é possível excluir: existem moradores cadastrados nesta torre")
    await db.towers.delete_one({"id": tid})
    return {"ok": True}

# ---------- Super: Residents management ----------

@api.get("/super/buildings/{bid}/residents")
async def super_list_residents(bid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    b = await db.buildings.find_one({"id": bid})
    if not b:
        raise HTTPException(404, "Prédio não encontrado")
    docs = await db.users.find({"building_id": bid, "role": "resident"},
                                {"_id": 0, "password_hash": 0}).to_list(500)
    t_cache: dict = {}
    for d in docs:
        tid = d.get("tower_id")
        if tid and tid not in t_cache:
            t_cache[tid] = await db.towers.find_one({"id": tid}, {"_id": 0})
        d["tower_name"] = (t_cache.get(tid) or {}).get("name")
    return docs

@api.put("/super/residents/{uid}")
async def super_update_resident(uid: str, body: ResidentEditIn, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    r = await db.users.find_one({"id": uid, "role": "resident"})
    if not r:
        raise HTTPException(404, "Morador não encontrado")
    payload = {k: v for k, v in body.dict().items() if v is not None}
    if payload.get("email"):
        payload["email"] = str(payload["email"]).lower()
    # If changing tower/apartment, verify uniqueness for principal cadastro
    if payload.get("tower_id") or payload.get("apartment"):
        new_tid = payload.get("tower_id", r["tower_id"])
        new_apt = payload.get("apartment", r["apartment"])
        clash = await db.users.find_one({
            "building_id": r["building_id"], "tower_id": new_tid,
            "apartment": new_apt, "role": "resident", "id": {"$ne": uid},
        })
        if clash:
            raise HTTPException(400, "Já existe outro morador principal nessa torre/apto")
    await db.users.update_one({"id": uid}, {"$set": payload})
    return {"ok": True}

@api.delete("/super/residents/{uid}")
async def super_delete_resident(uid: str, user=Depends(current_user)):
    await require_role(user, ["super_admin"])
    r = await db.users.find_one({"id": uid, "role": "resident"})
    if not r:
        raise HTTPException(404, "Morador não encontrado")
    await db.users.delete_one({"id": uid})
    return {"ok": True}

app.include_router(api)
