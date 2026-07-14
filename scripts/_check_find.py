"""Show what find_dotenv returns when run from the notification-service dir."""
import os
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
from dotenv import load_dotenv, find_dotenv
print("CWD:", os.getcwd())
print("find_dotenv():", find_dotenv())
print()
print("--- This is what load_dotenv() actually loads ---")
load_dotenv()  # uses find_dotenv()
import os
for k in ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "PUBLIC_API_URL"]:
    print(f"  {k!r} = {os.getenv(k, '<MISSING>')!r}")
print()
print("--- Now with explicit path ---")
load_dotenv(dotenv_path=r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service\.env", override=True)
for k in ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]:
    print(f"  {k!r} = {os.getenv(k, '<MISSING>')[:40]!r}")
