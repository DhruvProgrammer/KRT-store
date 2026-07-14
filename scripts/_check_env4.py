import os
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
import io
from dotenv.main import parse_stream

with open(".env", "r", encoding="utf-8") as f:
    content = f.read()
print("len(str):", len(content))

stream = io.StringIO(content)
result = parse_stream(stream)
print("parse_stream result type:", type(result))
for item in result:
    print("  item:", item)
print()

# Now try with explicit encoding
from dotenv import load_dotenv
load_dotenv(encoding="utf-8")
print("with utf-8:", os.getenv("GMAIL_USER", "<MISSING>"))

load_dotenv(encoding="utf-8-sig")
print("with utf-8-sig:", os.getenv("GMAIL_USER", "<MISSING>"))
print()

# Try to manually inject
from dotenv import dotenv_values
vals = dotenv_values(".env")
for k, v in vals.items():
    os.environ[k] = v
print("manual inject:", os.getenv("GMAIL_USER", "<MISSING>"))
print("GMAIL_REFRESH_TOKEN starts with:", os.getenv("GMAIL_REFRESH_TOKEN", "<MISSING>")[:8])
