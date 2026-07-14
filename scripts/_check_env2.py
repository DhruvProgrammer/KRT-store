import os
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
print("files in cwd:", os.listdir("."))
print()

# Try reading the file directly
with open(".env", "rb") as f:
    raw = f.read()
print("first 8 bytes:", raw[:8])
print("len:", len(raw))
print()

# Try the dotenv parser
from dotenv.main import DotEnv
parser = DotEnv(dotenv_path=".env")
result = parser.dict()
print("parser.dict():", result)
print()
from dotenv import dotenv_values
vals = dotenv_values(".env")
print("dotenv_values:", vals)
