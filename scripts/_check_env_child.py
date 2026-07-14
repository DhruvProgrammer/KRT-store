"""Test what env vars the Python interpreter sees when launched."""
import os
import sys
print("python executable:", sys.executable)
print()
print("CWD:", os.getcwd())
print()
print("Env vars in this process:")
for k in ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "NOTIFY_TOKEN", "PUBLIC_API_URL", "VIRTUAL_ENV"]:
    v = os.getenv(k, "<MISSING>")
    print(f"  {k} = {v[:30] if v != '<MISSING>' else v!r}")
