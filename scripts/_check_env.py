import os
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
from dotenv import load_dotenv
ok = load_dotenv()
print("load_dotenv returned:", ok)
print("current dir:", os.getcwd())
print("file exists:", os.path.exists(".env"))
print()
for k in ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "STORE_OWNER_EMAIL", "STORE_NAME", "NOTIFY_TOKEN"]:
    v = os.getenv(k, "<MISSING>")
    print(f"{k!r} = {v!r}")
