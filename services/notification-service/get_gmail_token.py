"""One-time helper: obtain a Gmail OAuth2 refresh token.

Setup (do this once on your machine):
  1. Google Cloud Console -> create a project.
  2. Enable the "Gmail API".
  3. Credentials -> OAuth 2.0 Client ID -> type "Desktop app".
  4. Download the JSON and save it as `client_secret.json` next to this file.

Then run:
    python get_gmail_token.py
It opens a Google consent screen in your browser; approve, and it prints the
values to paste into services/notification-service/.env:
    GMAIL_CLIENT_ID=...
    GMAIL_CLIENT_SECRET=...
    GMAIL_REFRESH_TOKEN=...

The refresh token is long-lived; the service uses it to mint short-lived
access tokens automatically. No password / app password required.
"""
from google_auth_oauthlib.flow import InstalledAppFlow

# Send-only scope — the issued token cannot read or modify mail.
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def main() -> None:
    flow = InstalledAppFlow.from_client_secrets_file("client_secret.json", SCOPES)
    creds = flow.run_local_server(port=8080)
    print("\n--- Paste these into services/notification-service/.env ---")
    print(f"GMAIL_CLIENT_ID={creds.client_id}")
    print(f"GMAIL_CLIENT_SECRET={creds.client_secret}")
    print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
    print("----------------------------------------------------------\n")


if __name__ == "__main__":
    main()
