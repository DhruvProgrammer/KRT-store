import base64
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel, EmailStr

load_dotenv()

# ponytail: creds only from env (.env is gitignored); never logged.
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
STORE_OWNER_EMAIL = os.getenv("STORE_OWNER_EMAIL", "")
STORE_NAME = os.getenv("STORE_NAME", "KRT Store")
NOTIFY_TOKEN = os.getenv("NOTIFY_TOKEN", "")

# Send-only scope — the token cannot read mail or do anything else.
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
TOKEN_URI = "https://oauth2.googleapis.com/token"

app = FastAPI(title="KRT Notification Service")


class Item(BaseModel):
    name: str
    price: float
    quantity: int = 1


class OrderNotification(BaseModel):
    email: EmailStr
    order_id: str
    items: list[Item]
    total: float
    store_name: str = STORE_NAME
    created_at: str = ""


# ponytail: inline-CSS HTML only — email clients strip <style>/external CSS.
# Amazon-style receipt, site palette (#00a2ff accent, slate surfaces).
def render_invoice(o: OrderNotification) -> str:
    rows = "".join(
        f"""<tr>
            <td style='padding:14px 0;border-bottom:1px solid #2a3140;color:#f1f5f9;font-size:15px;'>{it.name}</td>
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
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">{o.store_name}</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Order receipt</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Thank you for your order!</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Order <strong style="color:#00a2ff;">#{o.order_id}</strong>{(" · " + o.created_at) if o.created_at else ""}</p>
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
        © {o.store_name}. This is a receipt for your purchase.
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_raw_message(from_addr: str, to_addr: str, bcc_addr: str, subject: str, html: str) -> dict:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    if bcc_addr:
        msg["Bcc"] = bcc_addr
    msg.attach(MIMEText("Thank you for your order. This email contains your KRT Store receipt.", "plain"))
    msg.attach(MIMEText(html, "html"))
    # Gmail API wants URL-safe base64 of the RFC822 message.
    return {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")}


def send_email(to_addr: str, subject: str, html: str) -> None:
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
        html=html,
    )
    service.users().messages().send(userId="me", body=body).execute()


@app.post("/notify/order")
async def notify_order(o: OrderNotification, x_notify_token: str = Header("")):
    if NOTIFY_TOKEN and x_notify_token != NOTIFY_TOKEN:
        raise HTTPException(status_code=401, detail="invalid token")
    if not (GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN):
        raise HTTPException(status_code=503, detail="email not configured")
    html = render_invoice(o)
    try:
        send_email(o.email, f"Your {o.store_name} order #{o.order_id} — receipt", html)
    except Exception as exc:  # ponytail: log, never crash the caller's checkout
        print(f"[notify] email send failed: {exc}")
        raise HTTPException(status_code=502, detail="email send failed")
    return {"sent": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
