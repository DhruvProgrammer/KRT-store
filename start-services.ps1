# Boots the three microservices in separate windows (notification :8000,
# order :3005, gateway :3001). Run from the repo root in your own terminal:
#   .\start-services.ps1
# Each service opens in its own window and stays running. Close the windows to stop.
$root = $PSScriptRoot

# Node services don't auto-load .env, so inject NOTIFY_TOKEN from the
# notification service's .env into the environment the order-service inherits.
# Without this, order-service calls the notification service with an empty
# token and the receipt email is rejected (401).
$notifyEnvPath = Join-Path $root "services/notification-service/.env"
$token = ""
if (Test-Path $notifyEnvPath) {
  $m = Select-String -Path $notifyEnvPath -Pattern '^NOTIFY_TOKEN=(.*)' | Select-Object -First 1
  if ($m) { $token = $m.Matches.Groups[1].Value.Trim() }
}
if ($token) { $env:NOTIFY_TOKEN = $token }

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/notification-service") `
  -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; uvicorn main:app --port 8000"

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/auth-service") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/order-service") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/api-gateway") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

Write-Host ""
Write-Host "Started 3 service windows. Wait ~3 seconds for them to boot."
Write-Host ""
Write-Host "Then test the email (replace YOU@domain.com and NOTIFY_TOKEN):"
Write-Host '  curl.exe -X POST http://localhost:8000/notify/order -H "x-notify-token: <NOTIFY_TOKEN>" -H "Content-Type: application/json" -d "{\"email\":\"YOU@domain.com\",\"order_id\":\"T1\",\"items\":[{\"name\":\"Clarity Plugin\",\"price\":19,\"quantity\":2}],\"total\":38}"'
Write-Host ""
Write-Host "  200 = working (check the inbox).  503 = .env still missing OAuth values."
