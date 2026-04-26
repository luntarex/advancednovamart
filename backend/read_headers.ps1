Get-ChildItem -Path ".\src\main\resources\raw-datasets\" -Filter "*.csv" | ForEach-Object {
    Write-Host ("=== " + $_.Name + " ===")
    Get-Content -Path $_.FullName -TotalCount 3
    Write-Host ""
}
