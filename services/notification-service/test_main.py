from unittest.mock import MagicMock

import main
from fastapi.testclient import TestClient


def _patch_gmail(monkeypatch):
    """Replace OAuth creds + Gmail API client with mocks (no network)."""
    fake_creds = MagicMock()
    monkeypatch.setattr(main, "Credentials", lambda **kw: fake_creds)
    monkeypatch.setattr(main, "Request", MagicMock())

    service = MagicMock()
    monkeypatch.setattr(main, "build", lambda *a, **k: service)
    return service.users.return_value.messages.return_value.send


def _configure(monkeypatch):
    monkeypatch.setattr(main, "NOTIFY_TOKEN", "secret")
    monkeypatch.setattr(main, "GMAIL_CLIENT_ID", "cid")
    monkeypatch.setattr(main, "GMAIL_CLIENT_SECRET", "csec")
    monkeypatch.setattr(main, "GMAIL_REFRESH_TOKEN", "rtok")
    monkeypatch.setattr(main, "GMAIL_USER", "from@x.com")
    monkeypatch.setattr(main, "STORE_OWNER_EMAIL", "owner@x.com")


def _order():
    return {
        "email": "buyer@example.com",
        "order_id": "42",
        "items": [{"name": "Clarity Plugin", "price": 19, "quantity": 2}],
        "total": 38,
        "created_at": "2026-07-13",
    }


def test_health():
    assert TestClient(main.app).get("/health").json()["status"] == "ok"


def test_send_ok(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)

    r = TestClient(main.app).post(
        "/notify/order", json=_order(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    assert r.json()["sent"] is True
    send.assert_called_once()
    body = send.call_args.kwargs["body"]
    decoded = _decode(body["raw"])
    assert "multipart/alternative" in decoded  # html + plain parts
    assert "buyer@example.com" in decoded  # To header is plaintext
    assert "owner@x.com" in decoded  # Bcc header is plaintext


def test_bad_token(monkeypatch):
    _configure(monkeypatch)
    r = TestClient(main.app).post("/notify/order", json=_order())
    assert r.status_code == 401


def test_not_configured(monkeypatch):
    monkeypatch.setattr(main, "NOTIFY_TOKEN", "")
    monkeypatch.setattr(main, "GMAIL_CLIENT_ID", "")
    monkeypatch.setattr(main, "GMAIL_CLIENT_SECRET", "")
    monkeypatch.setattr(main, "GMAIL_REFRESH_TOKEN", "")
    r = TestClient(main.app).post(
        "/notify/order", json=_order(), headers={"x-notify-token": "x"}
    )
    assert r.status_code == 503


def test_invalid_email(monkeypatch):
    _configure(monkeypatch)
    order = _order()
    order["email"] = "not-an-email"
    r = TestClient(main.app).post(
        "/notify/order", json=order, headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 422


def test_invoice_renders_total_and_items():
    from main import render_invoice, OrderNotification

    o = OrderNotification(**_order())
    html = render_invoice(o)
    assert "Thank you for your order!" in html
    assert "Clarity Plugin" in html
    assert "$38.00" in html
    assert "#00a2ff" in html


def _decode(raw):
    import base64

    return base64.urlsafe_b64decode(raw).decode("utf-8")
