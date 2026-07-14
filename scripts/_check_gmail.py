import os, sys
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
from dotenv import load_dotenv
load_dotenv()
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

creds = Credentials(
    token=None,
    refresh_token=os.getenv("GMAIL_REFRESH_TOKEN"),
    client_id=os.getenv("GMAIL_CLIENT_ID"),
    client_secret=os.getenv("GMAIL_CLIENT_SECRET"),
    token_uri="https://oauth2.googleapis.com/token",
    scopes=[
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
    ],
)
creds.refresh(Request())
print("TOKEN OK, expires", creds.expiry)
service = build("gmail", "v1", credentials=creds)
prof = service.users().getProfile(userId="me").execute()
print("Gmail address:", prof.get("emailAddress"))
print("Total messages:", prof.get("messagesTotal"))
print("Threads total:", prof.get("threadsTotal"))

print("\n--- SENT folder (latest 10) ---")
try:
    sent = service.users().messages().list(userId="me", labelIds=["SENT"], maxResults=10).execute()
    msgs = sent.get("messages", [])
    print(f"Returned {len(msgs)} sent messages")
    for m in msgs[:10]:
        full = service.users().messages().get(
            userId="me", id=m["id"], format="metadata",
            metadataHeaders=["To", "Subject", "Date"]
        ).execute()
        hdrs = {h["name"]: h["value"] for h in full.get("payload", {}).get("headers", [])}
        print(f"  id={m['id']}  To={hdrs.get('To')}  Subject={hdrs.get('Subject')[:60] if hdrs.get('Subject') else None}  Date={hdrs.get('Date')}")
except Exception as e:
    print("Sent listing failed:", e)

print("\n--- INBOX (latest 10 subject lines) ---")
try:
    inbox = service.users().messages().list(userId="me", labelIds=["INBOX"], maxResults=10).execute()
    msgs = inbox.get("messages", [])
    print(f"Returned {len(msgs)} inbox messages")
    for m in msgs[:10]:
        full = service.users().messages().get(
            userId="me", id=m["id"], format="metadata",
            metadataHeaders=["From", "Subject", "Date"]
        ).execute()
        hdrs = {h["name"]: h["value"] for h in full.get("payload", {}).get("headers", [])}
        print(f"  id={m['id']}  From={hdrs.get('From')}  Subject={hdrs.get('Subject')[:60] if hdrs.get('Subject') else None}  Date={hdrs.get('Date')}")
except Exception as e:
    print("Inbox listing failed:", e)
