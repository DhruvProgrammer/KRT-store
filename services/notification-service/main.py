import base64
import hmac
import html
import os
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel, EmailStr, Field

load_dotenv()

# ponytail: creds only from env (.env is gitignored); never logged.
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
STORE_OWNER_EMAIL = os.getenv("STORE_OWNER_EMAIL", "")
STORE_NAME = os.getenv("STORE_NAME", "KRT Store")


def _require_notify_token() -> str:
    """Fail closed: an unset NOTIFY_TOKEN used to skip the auth check entirely.

    The service now refuses to start instead of accepting every caller.
    """
    token = os.getenv("NOTIFY_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "NOTIFY_TOKEN is not set. The notification service refuses to start "
            "without it (an empty token would accept every caller)."
        )
    return token


NOTIFY_TOKEN = _require_notify_token()

# Send-only scope — the token cannot read mail or do anything else.
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
TOKEN_URI = "https://oauth2.googleapis.com/token"

# ponytail: fixed purpose allowlist. An unknown purpose is rejected with 400
# and never reaches a template, so it cannot be used to smuggle markup in.
ALLOWED_PURPOSES = ("registration", "login", "checkout", "signin")

# purpose -> human phrase. Unknown values collapse to a fixed word, so the
# phrase can never carry caller-controlled markup even if the allowlist check
# is bypassed somewhere else.
_PURPOSE_LABELS = {
    "registration": "registration",
    "login": "sign-in",
    "checkout": "checkout",
    "signin": "sign-in",
}
_DEFAULT_PURPOSE_LABEL = "verification"

# Fallback subject when the caller sends a blank one.
_SUBJECT_TEMPLATES = {
    "registration": "Your {store} verification code",
    "login": "Your {store} sign-in code",
    "checkout": "Your {store} verification code",
    "signin": "Your {store} sign-in link",
}

# ponytail: the interactive API docs are OFF. This service is internal and
# every endpoint is guarded by the x-notify-token, but /docs and
# /openapi.json were unauthenticated FastAPI defaults -- a free, public
# description of the service for anyone who could reach it. The schema is
# not a secret; the endpoint map does not need to be one.
app = FastAPI(title="KRT Notification Service", docs_url=None, redoc_url=None, openapi_url=None)

# ponytail: the request ceilings. Every accepted request sends a real email
# from the store's mailbox, so an unbounded service is an unbounded Gmail
# quota (over-sending gets the mailbox suspended) and an unbounded body is
# an unbounded parse in the worker. 20 item lines matches the order
# service's MAX_ITEMS = 20, so every order the store can place can be
# receipted -- and no receipt can be a 5000-line email.
MAX_ITEMS = 20
MAX_TEXT = 200  # every free-text field: order_id, store_name, subject, otp, purpose, item name
MAX_LINK = 2048  # a magic link is a URL
# 1 MB: a 5000-item body (~225 KB) still reaches pydantic, so the item
# ceiling is what answers an oversized order (422). The byte ceiling is the
# backstop against a huge PARSE, not against a huge order.
MAX_BODY_BYTES = 1024 * 1024

# ponytail: the mail ceiling. A fixed window, in-process, no dependency: one
# window, one counter, keyed by the only identity there is (the token).
# Ceiling: per-process and lost on restart, so N replicas allow N x the
# limit. Upgrade path: a shared counter (Redis). The gateway already caps
# the /api/notify route at 10/min per IP -- this is the inner belt.
NOTIFY_RATE_PER_MINUTE = int(os.getenv("NOTIFY_RATE_PER_MINUTE", "60"))
_RATE_WINDOW_MS = 60_000
_rate_hits: dict[str, dict] = {}


class BodySizeLimit:
    """Refuse a body over MAX_BODY_BYTES before FastAPI parses it.

    ponytail: pure ASGI, no dependency. Content-Length alone is not enough --
    a chunked request has none -- so the body is counted as it arrives.
    FastAPI re-raises an HTTPException that comes out of the body read (it
    has an explicit `except HTTPException: raise`), so the 413 survives --
    a plain exception would be swallowed into a 400 "error parsing the body".
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(
                        status_code=413, detail="Request body is too large"
                    )
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)


# ponytail: every string is bounded (email is bounded by EmailStr itself,
# 254 chars). The fields are echoed into the mail body, so an unbounded
# field is an unbounded email -- and the ceilings are checked by pydantic
# BEFORE the handler runs, so an over-long request never reaches Gmail.
class Item(BaseModel):
    name: Annotated[str, Field(max_length=MAX_TEXT)]
    price: float
    quantity: int = 1


class OrderNotification(BaseModel):
    email: EmailStr
    order_id: Annotated[str, Field(max_length=MAX_TEXT)]
    items: Annotated[list[Item], Field(max_length=MAX_ITEMS)]
    total: float
    store_name: Annotated[str, Field(max_length=MAX_TEXT)] = STORE_NAME
    created_at: Annotated[str, Field(max_length=MAX_TEXT)] = ""


class OTPNotification(BaseModel):
    email: EmailStr
    subject: Annotated[str, Field(max_length=MAX_TEXT)]
    otp: Annotated[str, Field(max_length=MAX_TEXT)]
    purpose: Annotated[str, Field(max_length=MAX_TEXT)] = "registration"
    store_name: Annotated[str, Field(max_length=MAX_TEXT)] = STORE_NAME


class MagicLinkNotification(BaseModel):
    email: EmailStr
    subject: Annotated[str, Field(max_length=MAX_TEXT)]
    link: Annotated[str, Field(max_length=MAX_LINK)]
    purpose: Annotated[str, Field(max_length=MAX_TEXT)] = "signin"
    store_name: Annotated[str, Field(max_length=MAX_TEXT)] = STORE_NAME


def _escape(value: str) -> str:
    """HTML-escape anything that arrived on the wire."""
    return html.escape(str(value), quote=True)


def _header_safe(value: str, field: str) -> str:
    """Reject CRLF in any value that ends up in a MIME header.

    Raises 400 instead of stripping: a stripped newline silently changes the
    subject, while a rejected one tells the caller the value is unusable.
    """
    if "\r" in value or "\n" in value:
        raise HTTPException(status_code=400, detail=f"invalid {field}")
    return value


def _check_purpose(purpose: str) -> str:
    if purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail="invalid purpose")
    return purpose


def _purpose_label(purpose: str) -> str:
    return _PURPOSE_LABELS.get(purpose, _DEFAULT_PURPOSE_LABEL)


def _default_subject(purpose: str, store_name: str) -> str:
    template = _SUBJECT_TEMPLATES.get(purpose, _SUBJECT_TEMPLATES["registration"])
    return template.format(store=store_name)


def _check_link(link: str) -> str:
    """Only http(s) links — keeps javascript:/data: URLs out of the button."""
    if not link.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="invalid link")
    return link


# ponytail: inline-CSS HTML only — email clients strip <style>/external CSS.
# Amazon-style receipt, site palette (#00a2ff accent, slate surfaces).
def render_invoice(o: OrderNotification) -> str:
    store_name = _escape(o.store_name)
    order_id = _escape(o.order_id)
    created_at = _escape(o.created_at)
    rows = "".join(
        f"""<tr>
            <td style='padding:14px 0;border-bottom:1px solid #2a3140;color:#f1f5f9;font-size:15px;'>{_escape(it.name)}</td>
            <td style='padding:14px 0;border-bottom:1px solid #2a3140;color:#94a3b8;font-size:15px;text-align:center;'>{it.quantity}</td>
            <td style='padding:14px 0;border-bottom:1px solid #2a3140;color:#f1f5f9;font-size:15px;text-align:right;'>${it.price * it.quantity:,.2f}</td>
        </tr>"""
        for it in o.items
    )
    return f"""<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">{store_name}</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Order receipt</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Thank you for your order!</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Order <strong style="color:#00a2ff;">#{order_id}</strong>{(" · " + created_at) if created_at else ""}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:0 0 10px;text-align:left;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">Item</th>
              <th style="padding:0 0 10px;text-align:center;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">Qty</th>
              <th style="padding:0 0 10px;text-align:right;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">Price</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid #2a3140;">
          <tr>
            <td style="padding:16px 0 0;color:#94a3b8;font-size:14px;text-align:right;">Subtotal</td>
            <td style="padding:16px 0 0;color:#f1f5f9;font-size:14px;text-align:right;width:120px;">${o.total:,.2f}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:14px;text-align:right;">Tax</td>
            <td style="padding:6px 0;color:#94a3b8;font-size:14px;text-align:right;">$0.00</td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;border-top:1px solid #2a3140;color:#f1f5f9;font-size:16px;font-weight:800;text-align:right;">Total</td>
            <td style="padding:12px 0 0;border-top:1px solid #2a3140;color:#00a2ff;font-size:18px;font-weight:900;text-align:right;">${o.total:,.2f}</td>
          </tr>
        </table>
        <p style="margin:24px 0 0;padding:16px 18px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#94a3b8;font-size:13px;line-height:1.6;">
          Your download links and license keys will arrive in a separate email shortly. Questions? Just reply to this receipt.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #2a3140;color:#64748b;font-size:12px;text-align:center;">
        © {store_name}. This is a receipt for your purchase.
      </td>
    </tr>
  </table>
</body>
</html>"""


def render_otp_email(o: OTPNotification) -> str:
    store_name = _escape(o.store_name)
    label = _purpose_label(o.purpose)
    otp = _escape(o.otp)
    return f"""<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">{store_name}</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Verification code</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Your verification code</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Use the code below to complete your {label}. This code expires in 10 minutes.</p>
        <div style="margin:24px 0;padding:24px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;text-align:center;">
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Your code</p>
          <p style="margin:0;color:#00a2ff;font-size:36px;font-weight:900;letter-spacing:0.3em;font-family:'SF Mono','Fira Code',monospace;">{otp}</p>
        </div>
        <p style="margin:24px 0 0;padding:16px 18px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#94a3b8;font-size:13px;line-height:1.6;">
          If you didn't request this code, please ignore this email. This code expires in 10 minutes for security.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #2a3140;color:#64748b;font-size:12px;text-align:center;">
        © {store_name}. Never share this code with anyone.
      </td>
    </tr>
  </table>
</body>
</html>"""


def render_magic_link_email(o: MagicLinkNotification) -> str:
    store_name = _escape(o.store_name)
    link = _escape(o.link)
    label = _purpose_label(o.purpose)
    return f"""<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">{store_name}</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Sign in with magic link</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Sign in to your account</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Click the button below to complete your {label}. This link expires in 15 minutes.</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="{link}" style="display:inline-block;padding:16px 32px;background:#00a2ff;color:#0f1218;font-size:16px;font-weight:900;text-decoration:none;border-radius:12px;letter-spacing:0.02em;">Sign in to {store_name}</a>
        </div>
        <p style="margin:24px 0 0;padding:16px 18px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#94a3b8;font-size:13px;line-height:1.6;">
          If you didn't request this link, you can safely ignore this email. The link will expire automatically.
          <br><br>
          <strong>Link:</strong> {link}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #2a3140;color:#64748b;font-size:12px;text-align:center;">
        © {store_name}. This is an automated sign-in email.
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_raw_message(
    from_addr: str, to_addr: str, bcc_addr: str, subject: str, text: str, html_body: str
) -> dict:
    msg = MIMEMultipart("alternative")
    # ponytail: every header value is checked here too — the request layer
    # already rejects CRLF, this is the backstop for values built elsewhere.
    for name, value in (
        ("Subject", subject),
        ("From", from_addr),
        ("To", to_addr),
        ("Bcc", bcc_addr),
    ):
        if value:
            _header_safe(value, name)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    if bcc_addr:
        msg["Bcc"] = bcc_addr
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    # Gmail API wants URL-safe base64 of the RFC822 message.
    return {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")}


def send_email(to_addr: str, subject: str, text: str, html_body: str) -> None:
    creds = Credentials(
        token=None,
        refresh_token=GMAIL_REFRESH_TOKEN,
        client_id=GMAIL_CLIENT_ID,
        client_secret=GMAIL_CLIENT_SECRET,
        token_uri=TOKEN_URI,
        scopes=GMAIL_SCOPES,
    )
    creds.refresh(Request())  # exchange refresh token for a fresh access token
    service = build("gmail", "v1", credentials=creds)
    body = _build_raw_message(
        from_addr=f"{STORE_NAME} <{GMAIL_USER}>",
        to_addr=to_addr,
        bcc_addr=STORE_OWNER_EMAIL,
        subject=subject,
        text=text,
        html_body=html_body,
    )
    service.users().messages().send(userId="me", body=body).execute()


def _authorize(x_notify_token: str) -> None:
    """Fail closed: no server token means nobody is allowed, not everybody."""
    if not NOTIFY_TOKEN:
        raise HTTPException(status_code=503, detail="notification service not configured")
    # ponytail: constant-time compare so the token cannot be timed out.
    if not hmac.compare_digest(x_notify_token.encode("utf-8"), NOTIFY_TOKEN.encode("utf-8")):
        raise HTTPException(status_code=401, detail="invalid token")


def _require_gmail_config() -> None:
    if not (GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN):
        raise HTTPException(status_code=503, detail="email not configured")


def _rate_limit() -> None:
    """Refuse a mail burst before a single mail goes out.

    ponytail: one window, one counter -- every caller shares the token, so
    the token is the only identity there is. Counted per MAIL ATTEMPT, not
    per request: a request that never sends (a rejected payload) must not
    eat the budget of the real receipts.
    """
    now = time.time()
    entry = _rate_hits.get(NOTIFY_TOKEN)
    if entry is None or now > entry["resetAt"]:
        entry = {"count": 0, "resetAt": now + _RATE_WINDOW_MS}
    entry["count"] += 1
    _rate_hits[NOTIFY_TOKEN] = entry
    if entry["count"] > NOTIFY_RATE_PER_MINUTE:
        raise HTTPException(status_code=429, detail="too many notifications")


# ponytail: plain `def` handlers — FastAPI runs them in its threadpool, so the
# blocking Gmail calls below never sit on the asyncio event loop.
@app.post("/notify/order")
def notify_order(o: OrderNotification, x_notify_token: str = Header("")):
    _authorize(x_notify_token)
    _require_gmail_config()
    _header_safe(o.store_name, "store_name")
    subject = _header_safe(
        f"Your {o.store_name} order #{o.order_id} — receipt", "subject"
    )
    _rate_limit()
    html_body = render_invoice(o)
    text = (
        f"Thank you for your order #{o.order_id}. "
        f"This email contains your {o.store_name} receipt."
    )
    try:
        send_email(o.email, subject, text, html_body)
        print(f"[notify] receipt sent to {o.email} (order {o.order_id})")
    except HTTPException:
        raise
    except Exception as exc:  # ponytail: log, never crash the caller's checkout
        print(f"[notify] email send failed: {exc}")
        raise HTTPException(status_code=502, detail="email send failed")
    return {"sent": True}


@app.post("/notify/otp")
def notify_otp(o: OTPNotification, x_notify_token: str = Header("")):
    _authorize(x_notify_token)
    _require_gmail_config()
    _check_purpose(o.purpose)
    _header_safe(o.store_name, "store_name")
    subject = _header_safe(o.subject.strip() or _default_subject(o.purpose, o.store_name), "subject")
    _rate_limit()
    html_body = render_otp_email(o)
    text = (
        f"Your {_purpose_label(o.purpose)} code is {o.otp}. "
        "It expires in 10 minutes."
    )
    try:
        send_email(o.email, subject, text, html_body)
        print(f"[notify] OTP sent to {o.email} (purpose: {o.purpose})")
    except HTTPException:
        raise
    except Exception as exc:  # ponytail: log, never crash the caller
        print(f"[notify] OTP email send failed: {exc}")
        raise HTTPException(status_code=502, detail="email send failed")
    return {"sent": True}


@app.post("/notify/magic-link")
def notify_magic_link(o: MagicLinkNotification, x_notify_token: str = Header("")):
    _authorize(x_notify_token)
    _require_gmail_config()
    _check_purpose(o.purpose)
    _header_safe(o.store_name, "store_name")
    _check_link(o.link)
    subject = _header_safe(o.subject.strip() or _default_subject(o.purpose, o.store_name), "subject")
    _rate_limit()
    html_body = render_magic_link_email(o)
    text = f"Sign in to {o.store_name}: {o.link}"
    try:
        send_email(o.email, subject, text, html_body)
        print(f"[notify] magic link sent to {o.email} (purpose: {o.purpose})")
    except HTTPException:
        raise
    except Exception as exc:  # ponytail: log, never crash the caller
        print(f"[notify] magic link email send failed: {exc}")
        raise HTTPException(status_code=502, detail="email send failed")
    return {"sent": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
