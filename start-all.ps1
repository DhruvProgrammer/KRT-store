# Boots the whole stack in separate windows:
#   notification :8000, order :3005, gateway :3001  (backend microservices)
#   storefront    :4321                                (npm run dev)
# Run from the repo root in your own terminal:  .\start-all.ps1
# Close the windows to stop. The storefront posts orders to the gateway
# via PUBLIC_API_URL (http://localhost:3001, set in /.env).
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
  -WorkingDirectory (Join-Path $root "services/order-service") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/api-gateway") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory (Join-Path $root "services/auth-service") `
  -ArgumentList "-NoExit", "-Command", "node index.js"

# Give the backend a moment to boot before starting the storefront.
Start-Sleep -Seconds 3

Start-Process powershell -WindowStyle Normal `
  -WorkingDirectory $root `
  -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host ""
Write-Host "Started 4 windows: notification :8000, order :3005, gateway :3001, storefront :4321."
Write-Host "Open http://localhost:4321 -> add a product -> checkout (use your email) -> receipt is emailed."
