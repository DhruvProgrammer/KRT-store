$services = @(
  @{ Dir="auth-service"; Port=3002 },
  @{ Dir="catalog-service"; Port=3003 },
  @{ Dir="cart-service"; Port=3004 },
  @{ Dir="order-service"; Port=3005 },
  @{ Dir="payment-service"; Port=3006 },
  @{ Dir="api-gateway"; Port=3001 }
)

$jobs = @()
foreach ($s in $services) {
  $path = "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\$($s.Dir)\index.js"
  $job = Start-Job -ScriptBlock {
    param($scriptPath)
    node $scriptPath
  } -ArgumentList $path
  $jobs += $job
  Write-Host "Started $($s.Dir) on port $($s.Port)"
}

Write-Host "Waiting for services to start..."
Start-Sleep -Seconds 5

try {
  node "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\test-services.cjs"
} catch {
  Write-Error "Test script failed: $_"
}

Write-Host "Stopping background jobs..."
$jobs | Stop-Job -ErrorAction SilentlyContinue
$jobs | Remove-Job -Force -ErrorAction SilentlyContinue
Write-Host "Done."
