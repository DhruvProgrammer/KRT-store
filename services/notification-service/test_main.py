import os
import subprocess
import sys
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


def _otp(**overrides):
    payload = {
        "email": "user@example.com",
        "subject": "Your KRT Store verification code",
        "otp": "123456",
        "purpose": "registration",
        "store_name": "KRT Store",
    }
    payload.update(overrides)
    return payload


def _magic(**overrides):
    payload = {
        "email": "user@example.com",
        "subject": "Your KRT Store sign-in link",
        "link": "https://krt.example/magic-link?token=abc123&email=user%40example.com",
        "purpose": "signin",
        "store_name": "KRT Store",
    }
    payload.update(overrides)
    return payload


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


def test_invalid_payload(monkeypatch):
    """The ceilings: a bad email, an oversized order, an over-long field, an
    oversized body and a mail burst are all refused BEFORE any mail goes
    out."""
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    client = TestClient(main.app)

    order = _order()
    order["email"] = "not-an-email"
    r = client.post("/notify/order", json=order, headers={"x-notify-token": "secret"})
    assert r.status_code == 422
    send.assert_not_called()

    # 5000 item lines: refused with 422, no mail.
    huge = _order()
    huge["items"] = [
        {"name": f"Item {i}", "price": 1, "quantity": 1} for i in range(5000)
    ]
    r = client.post("/notify/order", json=huge, headers={"x-notify-token": "secret"})
    assert r.status_code == 422
    send.assert_not_called()

    # 21 lines is one over the ceiling (the order service's MAX_ITEMS is 20).
    over = _order()
    over["items"] = [
        {"name": f"Item {i}", "price": 1, "quantity": 1} for i in range(21)
    ]
    r = client.post("/notify/order", json=over, headers={"x-notify-token": "secret"})
    assert r.status_code == 422
    send.assert_not_called()

    # 20 lines still works -- the ceiling is not off by one.
    ok = _order()
    ok["items"] = [
        {"name": f"Item {i}", "price": 1, "quantity": 1} for i in range(20)
    ]
    r = client.post("/notify/order", json=ok, headers={"x-notify-token": "secret"})
    assert r.status_code == 200
    send.assert_called_once()

    # Every free-text field is bounded too.
    long_field = "x" * 201
    for payload, route in (
        ({**_order(), "order_id": long_field}, "/notify/order"),
        ({**_order(), "store_name": long_field}, "/notify/order"),
        ({**_otp(subject=long_field)}, "/notify/otp"),
        ({**_otp(otp=long_field)}, "/notify/otp"),
        ({**_otp(purpose=long_field)}, "/notify/otp"),
        ({**_magic(link="https://x.test/" + "x" * 2100)}, "/notify/magic-link"),
    ):
        r = client.post(route, json=payload, headers={"x-notify-token": "secret"})
        assert r.status_code == 422, route
        assert send.call_count == 1, route  # still only the one good receipt

    # An item name is bounded too.
    order = _order()
    order["items"] = [{"name": long_field, "price": 1, "quantity": 1}]
    r = client.post("/notify/order", json=order, headers={"x-notify-token": "secret"})
    assert r.status_code == 422
    assert send.call_count == 1

    # A body over the byte ceiling is refused before it is parsed.
    fat = _order()
    fat["created_at"] = "x" * (main.MAX_BODY_BYTES + 1024)
    r = client.post("/notify/order", json=fat, headers={"x-notify-token": "secret"})
    assert r.status_code == 413
    assert send.call_count == 1

    # The mail ceiling: a burst is refused with 429. It runs under its own
    # token so the shared bucket of the other tests is untouched.
    monkeypatch.setattr(main, "NOTIFY_TOKEN", "burst-token")
    monkeypatch.setattr(main, "NOTIFY_RATE_PER_MINUTE", 2)
    for _ in range(2):
        r = client.post(
            "/notify/otp", json=_otp(), headers={"x-notify-token": "burst-token"}
        )
        assert r.status_code == 200
    r = client.post("/notify/otp", json=_otp(), headers={"x-notify-token": "burst-token"})
    assert r.status_code == 429
    assert send.call_count == 3


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


def _part(raw, content_type):
    """Return the decoded body of one MIME part ("text/plain" / "text/html")."""
    import email

    msg = email.message_from_string(_decode(raw))
    for part in msg.walk():
        if part.get_content_type() == content_type:
            payload = part.get_payload(decode=True)
            if payload is None:
                return part.get_payload()
            charset = part.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
    return ""


# --- C10: fail closed on NOTIFY_TOKEN -------------------------------------


def test_empty_notify_token_refuses_to_start():
    """An unset NOTIFY_TOKEN must stop the service, not open it to everyone."""
    code = (
        "import os, dotenv;"
        "dotenv.load_dotenv = lambda *a, **k: False;"
        "os.environ.pop('NOTIFY_TOKEN', None);"
        "import main"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=os.path.dirname(os.path.abspath(__file__)),
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0, "service started without NOTIFY_TOKEN"
    assert "NOTIFY_TOKEN" in proc.stderr


def test_empty_notify_token_rejects_request(monkeypatch):
    """Same fail-closed rule on the request path (monkeypatched to empty)."""
    _configure(monkeypatch)
    monkeypatch.setattr(main, "NOTIFY_TOKEN", "")
    r = TestClient(main.app).post(
        "/notify/order", json=_order(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 503
    assert r.json()["detail"] != ""


def test_email_not_configured(monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(main, "GMAIL_CLIENT_ID", "")
    monkeypatch.setattr(main, "GMAIL_CLIENT_SECRET", "")
    monkeypatch.setattr(main, "GMAIL_REFRESH_TOKEN", "")
    r = TestClient(main.app).post(
        "/notify/order", json=_order(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 503
    assert r.json()["detail"] == "email not configured"


# --- C10: header injection -------------------------------------------------


def test_crlf_in_subject_rejected(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(subject="code\r\nBcc: attacker@evil.com"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 400
    send.assert_not_called()


def test_crlf_in_store_name_rejected(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(store_name="KRT\r\nBcc: attacker@evil.com"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 400
    send.assert_not_called()


def test_crlf_in_order_id_rejected(monkeypatch):
    """The order subject is server-built but embeds order_id."""
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    order = _order()
    order["order_id"] = "42\r\nBcc: attacker@evil.com"
    r = TestClient(main.app).post(
        "/notify/order", json=order, headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 400
    send.assert_not_called()


# --- C10: HTML escaping ----------------------------------------------------


def test_script_tag_escaped_in_store_name(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(store_name="<script>alert(1)</script>"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 200
    body = _part(send.call_args.kwargs["body"]["raw"], "text/html")
    assert "<script>" not in body
    assert "&lt;script&gt;" in body


def test_script_tag_escaped_in_item_name(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    order = _order()
    order["items"] = [
        {"name": "<script>alert(1)</script>", "price": 19, "quantity": 2}
    ]
    r = TestClient(main.app).post(
        "/notify/order", json=order, headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    body = _part(send.call_args.kwargs["body"]["raw"], "text/html")
    assert "<script>" not in body
    assert "&lt;script&gt;" in body


def test_script_tag_escaped_in_otp(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(otp="<script>alert(1)</script>"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 200
    body = _part(send.call_args.kwargs["body"]["raw"], "text/html")
    assert "<script>" not in body
    assert "&lt;script&gt;" in body


def test_unknown_purpose_rejected(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(purpose="<script>alert(1)</script>"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 400
    send.assert_not_called()


def test_render_otp_email_never_renders_raw_purpose():
    """Even if the allowlist is bypassed, the phrase is a fixed word."""
    o = main.OTPNotification(
        email="a@b.com",
        subject="s",
        otp="123456",
        purpose="<script>alert(1)</script>",
    )
    html = main.render_otp_email(o)
    assert "<script>" not in html
    assert "verification" in html


# --- C9: magic link --------------------------------------------------------


def test_magic_link_renders_link_and_button():
    o = main.MagicLinkNotification(**_magic())
    html = main.render_magic_link_email(o)
    assert "Sign in to KRT Store" in html
    assert (
        'href="https://krt.example/magic-link?token=abc123&amp;email=user%40example.com"'
        in html
    )
    assert "<script>" not in html


def test_magic_link_ok(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/magic-link", json=_magic(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    assert r.json()["sent"] is True
    raw = send.call_args.kwargs["body"]["raw"]
    assert "magic-link?token=abc123" in _part(raw, "text/plain")


def test_magic_link_rejects_non_http_link(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/magic-link",
        json=_magic(link="javascript:alert(1)"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 400
    send.assert_not_called()


def test_magic_link_escapes_store_name(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/magic-link",
        json=_magic(store_name="<script>alert(1)</script>"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 200
    body = _part(send.call_args.kwargs["body"]["raw"], "text/html")
    assert "<script>" not in body
    assert "&lt;script&gt;" in body


# --- C10: plain-text part matches the notification type -------------------


def test_plain_text_is_otp_summary(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp", json=_otp(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    raw = send.call_args.kwargs["body"]["raw"]
    plain = _part(raw, "text/plain")
    assert "123456" in plain
    assert "Thank you for your order" not in plain


def test_plain_text_is_magic_link_summary(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/magic-link", json=_magic(), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    raw = send.call_args.kwargs["body"]["raw"]
    plain = _part(raw, "text/plain")
    assert "magic-link?token=abc123" in plain
    assert "Thank you for your order" not in plain


# --- C10: structured payloads only, server-derived subject -----------------


def test_otp_needs_no_html_field(monkeypatch):
    """The auth service stopped sending a pre-rendered html body."""
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    payload = _otp()
    assert "html" not in payload
    r = TestClient(main.app).post(
        "/notify/otp", json=payload, headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    send.assert_called_once()


def test_legacy_html_field_is_ignored(monkeypatch):
    """A caller still sending html must not be able to inject a body."""
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp",
        json=_otp(html="<script>alert(1)</script>"),
        headers={"x-notify-token": "secret"},
    )
    assert r.status_code == 200
    body = _part(send.call_args.kwargs["body"]["raw"], "text/html")
    assert "<script>" not in body
    assert "Your verification code" in body


def test_blank_subject_is_derived(monkeypatch):
    _configure(monkeypatch)
    send = _patch_gmail(monkeypatch)
    r = TestClient(main.app).post(
        "/notify/otp", json=_otp(subject="   "), headers={"x-notify-token": "secret"}
    )
    assert r.status_code == 200
    raw = _decode(send.call_args.kwargs["body"]["raw"])
    assert "Subject: Your KRT Store verification code" in raw
