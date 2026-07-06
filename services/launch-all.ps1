$base = "\`$env:KRT_TEST=1" 
$proc1 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\auth-service\index.js" -PassThru -WindowStyle Hidden
$proc2 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\catalog-service\index.js" -PassThru -WindowStyle Hidden
$proc3 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\cart-service\index.js" -PassThru -WindowStyle Hidden
$proc4 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\order-service\index.js" -PassThru -WindowStyle Hidden
$proc5 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\payment-service\index.js" -PassThru -WindowStyle Hidden
$proc6 = Start-Process -FilePath "node" -ArgumentList "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\api-gateway\index.js" -PassThru -WindowStyle Hidden

Write-Host "Services started. Waiting..."
Start-Sleep -Seconds 10

try {
  node "C:\Users\MR.PC\Desktop\wp-bot\design-goods\services\test-services.cjs"
} catch {
  Write-Error "Test script failed: $_"
}

Stop-Process -Id $proc1.Id -ErrorAction SilentlyContinue
Stop-Process -Id $proc2.Id -ErrorAction SilentlyContinue
Stop-Process -Id $proc3.Id -ErrorAction SilentlyContinue
Stop-Process -Id $proc4.Id -ErrorAction SilentlyContinue
Stop-Process -Id $proc5.Id -ErrorAction SilentlyContinue
Stop-Process -Id $proc6.Id -ErrorAction SilentlyContinue
Write-Host "Done."
