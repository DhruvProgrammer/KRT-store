import os
os.chdir(r"C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\notification-service")
from dotenv import load_dotenv

# Show os.environ before
print("Before load_dotenv, GMAIL_USER in environ:", "GMAIL_USER" in os.environ)
print()

result = load_dotenv()
print("load_dotenv returned:", result)
print()

# Show os.environ after
print("After load_dotenv, GMAIL_USER in environ:", "GMAIL_USER" in os.environ)
print()

# Try with explicit override
result2 = load_dotenv(override=True)
print("load_dotenv(override=True) returned:", result2)
print("After override, GMAIL_USER in environ:", "GMAIL_USER" in os.environ)
print("value via getenv:", os.getenv("GMAIL_USER", "<MISSING>"))
print()

# Try with verbose
result3 = load_dotenv(verbose=True)
print("load_dotenv(verbose=True) returned:", result3)
