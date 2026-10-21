# Register an hourly ClimateShield ingest task. Run in an elevated PowerShell if needed.
# This does not start a dashboard.
$repo = 'C:\Users\Code\Desktop\climateshield-360\pipeline'
$py = (Get-Command python).Source
$action = "$py -m climateshield ingest-hourly --once"
Set-Location $repo
schtasks /Create /F /TN ClimateShield360HourlyIngest /SC HOURLY /MO 1 /TR $action
Write-Output "Registered ClimateShield360HourlyIngest to run hourly in $repo"
Write-Output "Manual run: python -m climateshield ingest-hourly --once"
Write-Output "Foreground loop: python -m climateshield ingest-hourly --schedule"
