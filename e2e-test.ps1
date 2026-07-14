$root = $PSScriptRoot

# Free any stale services.
foreach ($port in @(8000, 3001, 3005)) {
  $p = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
  if ($p) { taskkill /F /PID $p | Out-Null }
}
Start-Sleep -Seconds 1

# 1) notification (Python/uvicorn)
$venv = Join-Path $root "services/notification-service/.venv/Scripts/python.exe"
Start-Process -FilePath $venv -ArgumentList "-m", "uvicorn", "main:app", "--port", "8000" `
  -WorkingDirectory (Join-Path $root "services/notification-service") `
  -RedirectStandardOutput (Join-Path $root "e2e-notify.log") -RedirectStandardError (Join-Path $root "e2e-notify.err")

# 2) order-service (now auto-loads NOTIFY_TOKEN via dotenv)
Start-Process -FilePath "node" -ArgumentList "index.js" `
  -WorkingDirectory (Join-Path $root "services/order-service") `
  -RedirectStandardOutput (Join-Path $root "e2e-order.log")

# 3) gateway
Start-Process -FilePath "node" -ArgumentList "index.js" `
  -WorkingDirectory (Join-Path $root "services/api-gateway") `
  -RedirectStandardOutput (Join-Path $root "e2e-gw.log")

Start-Sleep -Seconds 5

# Simulate the EXACT storefront checkout call.
$t = $env:TEMP
'{"email":"viboy840@gmail.com","items":[{"slug":"clarity-plugin","name":"Clarity Plugin","price":19,"quantity":2}],"total":38}' | Set-Content -Path "$t/e2e.json" -Encoding ascii

Write-Host "=== POST /api/orders via gateway (same as checkout form) ==="
curl.exe -s -m 10 -w "`n[%{http_code}]`n" -X POST http://localhost:3001/api/orders `
  -H "Content-Type: application/json" -H "x-user-id: guest-e2e" -d "@$t/e2e.json"

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "=== notification log (email send result) ==="
Get-Content (Join-Path $root "e2e-notify.log") | Select-Object -Last 12

# Cleanup
foreach ($port in @(8000, 3001, 3005)) {
  $p = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
  if ($p) { taskkill /F /PID $p | Out-Null }
}
Write-Host "`n(cleaned up test services)"
