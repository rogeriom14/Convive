"""Convive backend API tests - full flow coverage."""
import os
import uuid
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://morador-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# ---------------- helpers ----------------

def _post(path, json=None, token=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json, headers=h, timeout=timeout)

def _get(path, token=None, params=None, timeout=30):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=timeout)

def _put(path, json=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.put(f"{API}{path}", json=json, headers=h, timeout=30)


# ---------------- shared state ----------------
ctx = {}


# =================================================================
# Buildings / towers search
# =================================================================
def test_buildings_search_alpinus():
    r = _get("/buildings/search", params={"q": "alp"})
    assert r.status_code == 200
    data = r.json()
    assert any("Alpinus" in b["name"] for b in data), f"Alpinus not in {data}"
    alp = next(b for b in data if "Alpinus" in b["name"])
    ctx["alpinus_id"] = alp["id"]
    ctx["condo_fee"] = alp.get("default_condo_fee")


def test_buildings_search_horizonte():
    r = _get("/buildings/search", params={"q": "hori"})
    assert r.status_code == 200
    data = r.json()
    h = next((b for b in data if "Horizonte" in b["name"]), None)
    assert h is not None
    ctx["horizonte_id"] = h["id"]


def test_towers_alpinus():
    r = _get(f"/buildings/{ctx['alpinus_id']}/towers")
    assert r.status_code == 200
    towers = r.json()
    assert len(towers) == 2
    names = {t["name"] for t in towers}
    assert {"Torre A", "Torre B"}.issubset(names)
    ctx["torre_a"] = next(t["id"] for t in towers if t["name"] == "Torre A")
    ctx["torre_b"] = next(t["id"] for t in towers if t["name"] == "Torre B")


def test_towers_horizonte():
    r = _get(f"/buildings/{ctx['horizonte_id']}/towers")
    assert r.status_code == 200
    towers = r.json()
    assert len(towers) == 1
    ctx["torre_h"] = towers[0]["id"]


# =================================================================
# Auth
# =================================================================
def test_login_super_admin():
    r = _post("/auth/login-admin", {"email": "super@convive.app", "password": "Convive@2026"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "super_admin"
    ctx["super_token"] = body["access_token"]


def test_login_admin_alpinus():
    r = _post("/auth/login-admin", {"email": "sindico@alpinus.com", "password": "Alpinus@2026"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert body["user"]["building_id"] == ctx["alpinus_id"]
    ctx["admin_alp_token"] = body["access_token"]


def test_login_admin_horizonte():
    r = _post("/auth/login-admin", {"email": "sindico@horizonte.com", "password": "Horizonte@2026"})
    assert r.status_code == 200
    ctx["admin_h_token"] = r.json()["access_token"]


def test_login_resident_alpinus_a_101():
    r = _post("/auth/login-resident", {
        "building_id": ctx["alpinus_id"], "tower_id": ctx["torre_a"],
        "apartment": "101", "password": "Morador@2026",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["status"] == "approved"
    assert body["user"]["role"] == "resident"
    ctx["res_alp_token"] = body["access_token"]
    ctx["res_alp_user"] = body["user"]


def test_login_resident_wrong_password():
    r = _post("/auth/login-resident", {
        "building_id": ctx["alpinus_id"], "tower_id": ctx["torre_a"],
        "apartment": "102", "password": "wrong",
    })
    assert r.status_code == 401


def test_me_endpoint_populates_building_and_tower():
    r = _get("/auth/me", token=ctx["res_alp_token"])
    assert r.status_code == 200
    body = r.json()
    assert body.get("building", {}).get("name") == "Condomínio Alpinus"
    assert body.get("tower", {}).get("name") == "Torre A"


def test_register_resident_creates_pending():
    unique = uuid.uuid4().hex[:6]
    payload = {
        "building_id": ctx["alpinus_id"], "tower_id": ctx["torre_a"],
        "apartment": f"9{unique[:2]}",  # unique apt
        "name": f"TEST_User_{unique}", "phone": "(11) 90000-0000",
        "email": f"TEST_{unique}@example.com", "password": "Teste@2026",
    }
    r = _post("/auth/register-resident", payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    ctx["pending_uid"] = body["id"]
    ctx["pending_apt"] = payload["apartment"]


def test_register_resident_duplicate_apt_rejected():
    payload = {
        "building_id": ctx["alpinus_id"], "tower_id": ctx["torre_a"],
        "apartment": "101",
        "name": "TEST_Dup", "phone": "(11) 90000-0000",
        "email": f"TEST_dup_{uuid.uuid4().hex[:6]}@example.com",
        "password": "Teste@2026",
    }
    r = _post("/auth/register-resident", payload)
    assert r.status_code == 400


def test_protected_endpoint_requires_token():
    r = _get("/areas")
    assert r.status_code == 401


# =================================================================
# Areas & multi-tenant
# =================================================================
def test_areas_for_resident_includes_totals():
    r = _get("/areas", token=ctx["res_alp_token"])
    assert r.status_code == 200
    areas = r.json()
    assert len(areas) >= 2
    for a in areas:
        assert a["building_id"] == ctx["alpinus_id"]
        assert "total" in a
    ctx["area_id_alp"] = areas[0]["id"]
    # fixed fee 150 + 100
    fixed = next((a for a in areas if a["fee_type"] == "fixed" and a["fee_value"] == 150.0), None)
    assert fixed is not None and fixed["total"] == 250.0


def test_multitenant_isolation_resident_only_sees_own_building():
    r = _get("/areas", token=ctx["res_alp_token"])
    areas = r.json()
    for a in areas:
        assert a["building_id"] == ctx["alpinus_id"]


def test_resident_cannot_access_other_building_area():
    # Get horizonte area id via admin
    ar = _get("/areas", token=ctx["admin_h_token"])
    assert ar.status_code == 200
    h_areas = ar.json()
    assert len(h_areas) >= 1
    horiz_area_id = h_areas[0]["id"]
    ctx["horiz_area_id"] = horiz_area_id
    r = _get(f"/areas/{horiz_area_id}", token=ctx["res_alp_token"])
    assert r.status_code == 403


# =================================================================
# Reservations
# =================================================================
def test_create_reservation_and_dup_conflict():
    date = (datetime.now(timezone.utc).date() + timedelta(days=10)).isoformat()
    ctx["res_date"] = date
    r = _post("/reservations", {
        "area_id": ctx["area_id_alp"], "date": date, "accepted_rules": True,
    }, token=ctx["res_alp_token"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "confirmed"
    assert body["total"] > 0
    ctx["reservation_id"] = body["id"]

    # duplicate
    r2 = _post("/reservations", {
        "area_id": ctx["area_id_alp"], "date": date, "accepted_rules": True,
    }, token=ctx["res_alp_token"])
    assert r2.status_code == 409


def test_my_reservations_lists_new():
    r = _get("/reservations/mine", token=ctx["res_alp_token"])
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert ctx["reservation_id"] in ids


def test_cancel_reservation():
    r = _post(f"/reservations/{ctx['reservation_id']}/cancel", token=ctx["res_alp_token"])
    assert r.status_code == 200


# =================================================================
# Admin endpoints
# =================================================================
def test_admin_dashboard():
    r = _get("/admin/dashboard", token=ctx["admin_alp_token"])
    assert r.status_code == 200
    body = r.json()
    for k in ["reservas_mes", "cadastros_pendentes", "valor_total_mes", "total_moradores", "total_areas"]:
        assert k in body


def test_admin_pending_residents_contains_new_registration():
    r = _get("/admin/pending-residents", token=ctx["admin_alp_token"])
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert ctx["pending_uid"] in ids


def test_admin_approve_pending():
    r = _post(f"/admin/residents/{ctx['pending_uid']}/approve", token=ctx["admin_alp_token"])
    assert r.status_code == 200
    # Verify status change via /admin/residents
    lr = _get("/admin/residents", token=ctx["admin_alp_token"])
    approved = next((u for u in lr.json() if u["id"] == ctx["pending_uid"]), None)
    assert approved and approved["status"] == "approved"


def test_admin_create_area():
    payload = {
        "name": f"TEST_Area_{uuid.uuid4().hex[:6]}", "description": "test",
        "capacity": 10, "booking_type": "day",
        "fee_type": "fixed", "fee_value": 20.0, "cleaning_fee": 10.0,
    }
    r = _post("/admin/areas", payload, token=ctx["admin_alp_token"])
    assert r.status_code == 200
    body = r.json()
    assert body["building_id"] == ctx["alpinus_id"]


def test_admin_get_and_put_rules():
    g = _get("/admin/rules", token=ctx["admin_alp_token"])
    assert g.status_code == 200
    payload = {"min_days_ahead": 2, "max_days_ahead": 60, "max_active_per_apt": 3,
               "free_cancel_hours": 24, "late_cancel_charge": "cleaning"}
    p = _put("/admin/rules", payload, token=ctx["admin_alp_token"])
    assert p.status_code == 200
    g2 = _get("/admin/rules", token=ctx["admin_alp_token"])
    assert g2.json().get("max_active_per_apt") == 3


def test_admin_reservations_list():
    r = _get("/admin/reservations", token=ctx["admin_alp_token"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# =================================================================
# Super admin
# =================================================================
def test_super_stats():
    r = _get("/super/stats", token=ctx["super_token"])
    assert r.status_code == 200
    body = r.json()
    assert body["total_buildings"] >= 2


def test_super_buildings_list():
    r = _get("/super/buildings", token=ctx["super_token"])
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    for b in data:
        assert "residents" in b


def test_admin_cannot_access_super_stats():
    r = _get("/super/stats", token=ctx["admin_alp_token"])
    assert r.status_code == 403
