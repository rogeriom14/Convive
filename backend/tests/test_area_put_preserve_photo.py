"""BUG-FIX tests (iteration 4): PUT /api/super/areas/{aid} must NOT wipe photo_url
when the client omits it. Backend now uses body.dict(exclude_none=True).

Covers:
  1. Upload photo → photo_url stored
  2. PUT WITHOUT photo_url (only name/description/fee_type/…) preserves photo_url
  3. photo_url still visible via GET /api/super/buildings/{bid}/areas
  4. photo_url still visible via GET /api/areas (resident, approved)
  5. PUT WITH photo_url overwrites correctly
  6. Empty string '' via PUT is stored as-is (edge case, documented)
"""
import base64
import os
import struct
import uuid
import zlib

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://morador-app.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _h(token=None, json_ct=True):
    h = {}
    if json_ct:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _post(p, json=None, token=None):
    return requests.post(f"{API}{p}", json=json, headers=_h(token), timeout=60)


def _put(p, json=None, token=None):
    return requests.put(f"{API}{p}", json=json, headers=_h(token), timeout=30)


def _get(p, token=None, params=None):
    return requests.get(f"{API}{p}", headers=_h(token, json_ct=False),
                        params=params, timeout=30)


def _delete(p, token=None):
    return requests.delete(f"{API}{p}", headers=_h(token, json_ct=False), timeout=30)


def _make_png(size=8):
    def chunk(kind, data):
        crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    raw = b""
    for _ in range(size):
        raw += b"\x00" + b"\xff\x00\x00" * size
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


ctx = {}


# ============== SETUP ==============
def test_setup_logins_and_resident():
    r = _post("/auth/login-admin", {"email": "super@convive.app", "password": "Convive@2026"})
    assert r.status_code == 200, r.text
    ctx["super_token"] = r.json()["access_token"]

    r = _get("/buildings/search", params={"q": "alp"})
    assert r.status_code == 200
    alp = next(b for b in r.json() if "Alpinus" in b["name"])
    ctx["bid"] = alp["id"]

    ra = _post("/auth/login-admin", {"email": "sindico@alpinus.com", "password": "Alpinus@2026"})
    assert ra.status_code == 200
    ctx["admin_token"] = ra.json()["access_token"]

    tors = _get(f"/buildings/{ctx['bid']}/towers").json()
    admin_residents = _get("/admin/residents", token=ctx["admin_token"]).json()
    taken = {(r_.get("tower_id"), r_.get("apartment"))
             for r_ in admin_residents if r_.get("status") in ("approved", "pending")}
    picked = None
    for t in tors:
        for a in t["apartments"]:
            if (t["id"], a) not in taken:
                picked = (t, a); break
        if picked: break
    if picked is None:
        srv = _get(f"/super/buildings/{ctx['bid']}/residents",
                   token=ctx["super_token"]).json()
        victim = next((r_ for r_ in srv if (r_.get("name") or "").startswith("TEST_")), None)
        assert victim is not None, "No apt free and no TEST_ resident to recycle"
        assert _delete(f"/super/residents/{victim['id']}",
                       token=ctx["super_token"]).status_code == 200
        tower = next(t for t in tors if t["id"] == victim["tower_id"])
        picked = (tower, victim["apartment"])
    tower, apt = picked
    ctx["tower_id"] = tower["id"]; ctx["apt"] = apt
    u = uuid.uuid4().hex[:6]
    reg = _post("/auth/register-resident", {
        "building_id": ctx["bid"], "tower_id": tower["id"], "apartment": apt,
        "name": f"TEST_ResPut_{u}", "phone": "(11) 90000-0000",
        "email": f"TEST_resput_{u}@example.com", "password": "Teste@2026",
    })
    assert reg.status_code == 200, reg.text
    ap = _post(f"/admin/residents/{reg.json()['id']}/approve", token=ctx["admin_token"])
    assert ap.status_code == 200
    lr = _post("/auth/login-resident", {
        "building_id": ctx["bid"], "tower_id": tower["id"],
        "apartment": apt, "password": "Teste@2026",
    })
    assert lr.status_code == 200
    ctx["res_token"] = lr.json()["access_token"]


def _create_area(suffix):
    r = _post(f"/super/buildings/{ctx['bid']}/areas", {
        "name": f"TEST_{suffix}_{uuid.uuid4().hex[:6]}",
        "description": "put-preserve test",
        "capacity": 5, "booking_type": "day",
        "fee_type": "fixed", "fee_value": 10.0, "cleaning_fee": 5.0,
        "rules": "R",
    }, token=ctx["super_token"])
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _upload_photo(aid):
    b64 = base64.b64encode(_make_png(6)).decode()
    r = _post(f"/super/areas/{aid}/photo",
              {"filename": "test.png", "content_type": "image/png", "data_base64": b64},
              token=ctx["super_token"])
    assert r.status_code == 200, r.text
    return r.json()["photo_url"]


def _get_area(aid):
    lst = _get(f"/super/buildings/{ctx['bid']}/areas", token=ctx["super_token"]).json()
    return next((x for x in lst if x["id"] == aid), None)


# ============== 1+2+3: PUT sem photo_url NÃO deve apagar ==============
def test_bugfix_put_without_photo_url_preserves_it():
    aid = _create_area("PutPreserve")
    ctx["aid"] = aid

    # 1. Upload photo
    photo_url = _upload_photo(aid)
    assert photo_url.startswith("/api/files/convive/areas/")
    ctx["photo_url"] = photo_url

    a_before = _get_area(aid)
    assert a_before["photo_url"] == photo_url

    # 2. PUT with body WITHOUT photo_url — only name/desc/fee etc
    put_body = {
        "name": a_before["name"] + "_edited",
        "description": "changed description",
        "capacity": 10,
        "booking_type": "day",
        "fee_type": "fixed",
        "fee_value": 15.0,
        "cleaning_fee": 7.0,
        "rules": "New rules",
        # photo_url intentionally NOT sent
    }
    r = _put(f"/super/areas/{aid}", put_body, token=ctx["super_token"])
    assert r.status_code == 200, r.text

    # 3. photo_url must still be intact via super admin GET
    a_after = _get_area(aid)
    assert a_after is not None
    assert a_after["photo_url"] == photo_url, (
        f"BUG NOT FIXED: photo_url was wiped by PUT. "
        f"expected={photo_url!r} got={a_after.get('photo_url')!r}"
    )
    # And the other fields WERE updated
    assert a_after["name"].endswith("_edited")
    assert a_after["description"] == "changed description"
    assert a_after["capacity"] == 10
    assert a_after["fee_value"] == 15.0


# ============== 4: photo_url visível no GET /api/areas do morador ==============
def test_bugfix_resident_sees_photo_url_after_put():
    aid = ctx["aid"]
    areas = _get("/areas", token=ctx["res_token"]).json()
    a = next((x for x in areas if x["id"] == aid), None)
    assert a is not None, "Resident cannot see area (maybe tower restriction?)"
    assert a.get("photo_url") == ctx["photo_url"], (
        f"Resident GET /areas photo_url mismatch: {a.get('photo_url')} vs {ctx['photo_url']}"
    )


# ============== 5: PUT COM photo_url sobrescreve corretamente ==============
def test_regression_put_with_photo_url_overwrites():
    aid = ctx["aid"]
    a_before = _get_area(aid)
    new_url = "/api/files/convive/areas/manually-set-test-url.png"
    put_body = {
        "name": a_before["name"],
        "description": a_before.get("description") or "",
        "capacity": a_before.get("capacity") or 5,
        "booking_type": a_before.get("booking_type") or "day",
        "fee_type": a_before.get("fee_type") or "fixed",
        "fee_value": a_before.get("fee_value") or 0,
        "cleaning_fee": a_before.get("cleaning_fee") or 0,
        "rules": a_before.get("rules") or "",
        "photo_url": new_url,
    }
    r = _put(f"/super/areas/{aid}", put_body, token=ctx["super_token"])
    assert r.status_code == 200, r.text
    a_after = _get_area(aid)
    assert a_after["photo_url"] == new_url, (
        f"PUT com photo_url não sobrescreveu: {a_after['photo_url']} != {new_url}"
    )


# ============== 6: PUT com photo_url='' — comportamento atual (documentar) ==============
def test_regression_put_with_empty_string_photo_url_documented():
    """Edge case: '' is truthy-empty for pydantic, exclude_none doesn't exclude ''.
    Expected current behavior: '' is stored (photo effectively cleared)."""
    aid = ctx["aid"]
    a_before = _get_area(aid)
    put_body = {
        "name": a_before["name"],
        "description": a_before.get("description") or "",
        "capacity": a_before.get("capacity") or 5,
        "booking_type": a_before.get("booking_type") or "day",
        "fee_type": a_before.get("fee_type") or "fixed",
        "fee_value": a_before.get("fee_value") or 0,
        "cleaning_fee": a_before.get("cleaning_fee") or 0,
        "rules": a_before.get("rules") or "",
        "photo_url": "",
    }
    r = _put(f"/super/areas/{aid}", put_body, token=ctx["super_token"])
    assert r.status_code == 200, r.text
    a_after = _get_area(aid)
    # Document actual behavior — either '' is stored or field is preserved
    print(f"[EDGE] photo_url after PUT '': {a_after.get('photo_url')!r}")
    # Assertion: current impl stores ''
    assert a_after.get("photo_url") == "", (
        f"Expected '' to be stored (documented edge). Got: {a_after.get('photo_url')!r}"
    )


# ============== CLEANUP ==============
def test_cleanup():
    aid = ctx.get("aid")
    if aid:
        d = _delete(f"/super/areas/{aid}", token=ctx["super_token"])
        assert d.status_code == 200
