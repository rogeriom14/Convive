"""Tests for BUG-FIX: POST /api/super/areas/{aid}/photo now uses JSON base64 payload
(instead of multipart) — fixes Expo 'Unsupported FormDataPart Implementation'.

Covers:
  1. Super admin: valid small PNG base64 → 200 + {photo_url:'/api/files/convive/areas/...'}
  2. GET /api/super/buildings/{bid}/areas returns area with photo_url set
  3. GET /api/files/{path} returns original bytes + correct Content-Type
  4. No token → 401
  5. Resident token → 403
  6. Invalid base64 → 400
  7. Accepts 'data:image/jpeg;base64,...' prefix
  8. Payload > 8MB → 400
  9. Regression: DELETE hard/soft still works
 10. Regression: super endpoints previously validated + resident flow
"""
import base64
import os
import struct
import uuid
import zlib
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://morador-app.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- helpers ----------------
def _h(token=None, json_ct=True):
    h = {}
    if json_ct:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _post(path, json=None, token=None):
    return requests.post(f"{API}{path}", json=json, headers=_h(token), timeout=60)


def _get(path, token=None, params=None):
    return requests.get(f"{API}{path}", headers=_h(token, json_ct=False),
                        params=params, timeout=30)


def _delete(path, token=None):
    return requests.delete(f"{API}{path}", headers=_h(token, json_ct=False), timeout=30)


def _make_png(size=8):
    """Minimal valid PNG."""
    def chunk(kind, data):
        crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)
    raw = b""
    for _ in range(size):
        raw += b"\x00" + b"\xff\x00\x00" * size
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


ctx = {}


# ====================== Setup ======================
def test_setup_login_super_and_resident():
    r = _post("/auth/login-admin", {"email": "super@convive.app", "password": "Convive@2026"})
    assert r.status_code == 200, r.text
    ctx["super_token"] = r.json()["access_token"]

    r = _get("/buildings/search", params={"q": "alp"})
    assert r.status_code == 200
    alp = next(b for b in r.json() if "Alpinus" in b["name"])
    ctx["alpinus_id"] = alp["id"]

    ra = _post("/auth/login-admin", {"email": "sindico@alpinus.com", "password": "Alpinus@2026"})
    assert ra.status_code == 200, ra.text
    ctx["admin_token"] = ra.json()["access_token"]

    tors = _get(f"/buildings/{ctx['alpinus_id']}/towers").json()
    assert len(tors) >= 1
    # Register a fresh resident on any tower/apt not yet taken so we can get a real resident token
    admin_residents = _get("/admin/residents", token=ctx["admin_token"]).json()
    taken = {(r_.get("tower_id"), r_.get("apartment"))
             for r_ in admin_residents if r_.get("status") in ("approved", "pending")}
    picked = None
    for t in tors:
        for a in t["apartments"]:
            if (t["id"], a) not in taken:
                picked = (t, a)
                break
        if picked:
            break
    # If no free apartment, delete a previous TEST_ resident (via super) to free one
    if picked is None:
        super_residents = _get(f"/super/buildings/{ctx['alpinus_id']}/residents",
                               token=ctx["super_token"]).json()
        victim = next((r_ for r_ in super_residents
                       if (r_.get("name") or "").startswith("TEST_")), None)
        assert victim is not None, "No free apartment and no TEST_ resident to recycle"
        d = _delete(f"/super/residents/{victim['id']}", token=ctx["super_token"])
        assert d.status_code == 200, d.text
        # pick the freed slot
        tower = next(t for t in tors if t["id"] == victim["tower_id"])
        picked = (tower, victim["apartment"])
    tower, apt = picked
    ctx["tower_id"] = tower["id"]
    unique = uuid.uuid4().hex[:6]
    reg = _post("/auth/register-resident", {
        "building_id": ctx["alpinus_id"], "tower_id": tower["id"], "apartment": apt,
        "name": f"TEST_Res_{unique}", "phone": "(11) 90000-0000",
        "email": f"TEST_res_{unique}@example.com", "password": "Teste@2026",
    })
    assert reg.status_code == 200, reg.text
    uid = reg.json()["id"]
    ap = _post(f"/admin/residents/{uid}/approve", token=ctx["admin_token"])
    assert ap.status_code == 200, ap.text
    lr = _post("/auth/login-resident", {
        "building_id": ctx["alpinus_id"], "tower_id": tower["id"],
        "apartment": apt, "password": "Teste@2026",
    })
    assert lr.status_code == 200, lr.text
    ctx["res_token"] = lr.json()["access_token"]


def _create_area(name_suffix):
    payload = {
        "name": f"TEST_{name_suffix}_{uuid.uuid4().hex[:6]}",
        "description": "photo/delete test",
        "capacity": 5, "booking_type": "day",
        "fee_type": "fixed", "fee_value": 10.0, "cleaning_fee": 5.0,
        "rules": "Regras",
    }
    r = _post(f"/super/buildings/{ctx['alpinus_id']}/areas", payload, token=ctx["super_token"])
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ====================== 1. valid base64 PNG → 200 ======================
def test_upload_photo_base64_valid_small_png_returns_200():
    aid = _create_area("Photo")
    ctx["photo_area_id"] = aid
    png = _make_png(8)
    b64 = base64.b64encode(png).decode()
    ctx["png_bytes"] = png

    r = _post(f"/super/areas/{aid}/photo",
              {"filename": "test.png", "content_type": "image/png", "data_base64": b64},
              token=ctx["super_token"])
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    body = r.json()
    assert "photo_url" in body
    photo_url = body["photo_url"]
    assert photo_url.startswith("/api/files/convive/areas/"), photo_url
    ctx["photo_url"] = photo_url


# ====================== 2. area now has photo_url ======================
def test_area_has_photo_url_after_upload():
    aid = ctx["photo_area_id"]
    lst = _get(f"/super/buildings/{ctx['alpinus_id']}/areas", token=ctx["super_token"]).json()
    a = next((x for x in lst if x["id"] == aid), None)
    assert a is not None, "Area disappeared"
    assert a.get("photo_url") == ctx["photo_url"], a.get("photo_url")


# ====================== 3. GET file returns bytes + Content-Type ======================
def test_get_file_returns_original_bytes():
    full = BASE_URL + ctx["photo_url"]
    g = requests.get(full, timeout=30)
    assert g.status_code == 200, g.status_code
    assert len(g.content) == len(ctx["png_bytes"]), \
        f"len mismatch {len(g.content)} vs {len(ctx['png_bytes'])}"
    assert g.content == ctx["png_bytes"], "bytes differ"
    ct = g.headers.get("Content-Type", "")
    assert ct.startswith("image/"), ct


# ====================== 4. no token → 401 ======================
def test_upload_photo_without_auth_returns_401():
    r = requests.post(f"{API}/super/areas/anything/photo",
                      json={"data_base64": "AAAA"}, timeout=15)
    assert r.status_code == 401, r.status_code


# ====================== 5. resident token → 403 ======================
def test_upload_photo_with_resident_token_returns_403():
    r = _post("/super/areas/anything/photo",
              {"data_base64": "AAAA"},
              token=ctx["res_token"])
    assert r.status_code == 403, r.status_code


# ====================== 6. invalid base64 → 400 ======================
def test_upload_photo_invalid_base64_returns_400():
    aid = ctx["photo_area_id"]
    # b64decode is lenient in Python by default; use validate-triggering garbage
    r = _post(f"/super/areas/{aid}/photo",
              {"filename": "x.png", "content_type": "image/png",
               "data_base64": "!!!not-valid-base64$$$###@@@"},
              token=ctx["super_token"])
    # Server does base64.b64decode without validate=True → most junk still decodes to bytes.
    # But server also raises on decode Exception. Accept either 400 (strict) or 200 (lenient).
    # Per spec, it should be 400 with clear message.
    if r.status_code == 200:
        pytest.fail("Expected 400 for garbage base64 but got 200 — b64decode is too lenient. "
                    "Backend should validate strictness or content magic bytes.")
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    body = r.json()
    msg = (body.get("detail") or "").lower()
    assert "base64" in msg or "inválid" in msg or "invalid" in msg, body


# ====================== 7. accepts data:image/...;base64 prefix ======================
def test_upload_photo_accepts_data_uri_prefix():
    aid = _create_area("PhotoPrefix")
    png = _make_png(8)
    b64 = base64.b64encode(png).decode()
    payload = {"filename": "test.jpg", "content_type": "image/jpeg",
               "data_base64": f"data:image/jpeg;base64,{b64}"}
    r = _post(f"/super/areas/{aid}/photo", payload, token=ctx["super_token"])
    assert r.status_code == 200, f"prefix upload failed: {r.status_code} {r.text}"
    assert r.json()["photo_url"].startswith("/api/files/convive/areas/")
    # cleanup
    _delete(f"/super/areas/{aid}", token=ctx["super_token"])


# ====================== 8. payload > 8MB → 400 ======================
def test_upload_photo_payload_over_8mb_returns_400():
    aid = ctx["photo_area_id"]
    big = b"\x00" * (8 * 1024 * 1024 + 10)  # 8MB + 10 bytes
    b64 = base64.b64encode(big).decode()
    r = _post(f"/super/areas/{aid}/photo",
              {"filename": "big.png", "content_type": "image/png", "data_base64": b64},
              token=ctx["super_token"])
    assert r.status_code == 400, f"expected 400 for >8MB, got {r.status_code}: {r.text}"
    msg = (r.json().get("detail") or "").lower()
    assert "8" in msg or "grande" in msg or "large" in msg, r.json()


# ====================== 9. area not found → 404 (bonus) ======================
def test_upload_photo_nonexistent_area_returns_404():
    b64 = base64.b64encode(_make_png(4)).decode()
    r = _post("/super/areas/nonexistent-abc-123/photo",
              {"filename": "x.png", "content_type": "image/png", "data_base64": b64},
              token=ctx["super_token"])
    assert r.status_code == 404, r.status_code


# ====================== REGRESSION: delete hard/soft ======================
def test_regression_delete_area_hard_when_no_reservations():
    aid = _create_area("HardDel")
    d = _delete(f"/super/areas/{aid}", token=ctx["super_token"])
    assert d.status_code == 200, d.text
    assert d.json().get("mode") == "hard", d.json()
    lst = _get(f"/super/buildings/{ctx['alpinus_id']}/areas", token=ctx["super_token"]).json()
    assert not any(a["id"] == aid for a in lst)


def test_regression_delete_area_soft_when_reservations_exist():
    aid = _create_area("SoftDel")
    date = (datetime.now(timezone.utc).date() + timedelta(days=25)).isoformat()
    rr = _post("/reservations",
               {"area_id": aid, "date": date, "accepted_rules": True},
               token=ctx["res_token"])
    assert rr.status_code == 200, rr.text
    d = _delete(f"/super/areas/{aid}", token=ctx["super_token"])
    assert d.status_code == 200
    assert d.json().get("mode") == "soft"
    lst = _get(f"/super/buildings/{ctx['alpinus_id']}/areas", token=ctx["super_token"]).json()
    assert not any(a["id"] == aid for a in lst)


# ====================== REGRESSION: super endpoints ======================
def test_regression_super_stats():
    r = _get("/super/stats", token=ctx["super_token"])
    assert r.status_code == 200
    for k in ["total_buildings", "total_residents", "total_reservations"]:
        assert k in r.json()


def test_regression_super_buildings_list():
    r = _get("/super/buildings", token=ctx["super_token"])
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_regression_super_pending_residents():
    r = _get("/super/pending-residents", token=ctx["super_token"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_super_building_detail():
    r = _get(f"/super/buildings/{ctx['alpinus_id']}", token=ctx["super_token"])
    assert r.status_code == 200
    assert r.json()["id"] == ctx["alpinus_id"]


def test_regression_super_towers_and_residents():
    t = _get(f"/super/buildings/{ctx['alpinus_id']}/towers", token=ctx["super_token"])
    assert t.status_code == 200
    assert len(t.json()) >= 1
    rr = _get(f"/super/buildings/{ctx['alpinus_id']}/residents", token=ctx["super_token"])
    assert rr.status_code == 200


def test_regression_super_put_tower_and_resident_404():
    r = requests.put(f"{API}/super/towers/nonexistent-x",
                     json={"name": "X"}, headers=_h(ctx["super_token"]), timeout=30)
    assert r.status_code == 404, r.status_code
    r2 = requests.put(f"{API}/super/residents/nonexistent-x",
                      json={"name": "X"}, headers=_h(ctx["super_token"]), timeout=30)
    assert r2.status_code == 404, r2.status_code


# ====================== REGRESSION: resident flow ======================
def test_regression_resident_areas():
    r = _get("/areas", token=ctx["res_token"])
    assert r.status_code == 200
    areas = r.json()
    assert len(areas) >= 2
    for a in areas:
        assert a["building_id"] == ctx["alpinus_id"]
        assert "total" in a


def test_regression_resident_reservation_create_and_cancel():
    import random
    areas = _get("/areas", token=ctx["res_token"]).json()
    fixed = next((a for a in areas if a["fee_type"] == "fixed"), None)
    assert fixed is not None
    # try a few dates far in the future to avoid collision with other tests / seeded reservations
    rr = None
    for offset in random.sample(range(3, 55), 20):
        date = (datetime.now(timezone.utc).date() + timedelta(days=offset)).isoformat()
        rr = _post("/reservations",
                   {"area_id": fixed["id"], "date": date, "accepted_rules": True},
                   token=ctx["res_token"])
        if rr.status_code == 200:
            break
    assert rr is not None and rr.status_code == 200, rr.text if rr else "no attempt"
    rid = rr.json()["id"]
    c = _post(f"/reservations/{rid}/cancel", token=ctx["res_token"])
    assert c.status_code == 200


# ====================== Cleanup ======================
def test_cleanup_photo_area():
    aid = ctx.get("photo_area_id")
    if not aid:
        pytest.skip("no photo area")
    d = _delete(f"/super/areas/{aid}", token=ctx["super_token"])
    assert d.status_code == 200
