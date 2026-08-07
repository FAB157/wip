
$old = [System.IO.File]::ReadAllLines('c:\progetti\itainta\server.ts')
$newEndpoint = [System.IO.File]::ReadAllLines('c:\progetti\itainta\__new_endpoint.ts')
$before = $old[0..3663]
$after = $old[3853..($old.Length-1)]
$combined = @()
$combined += $before
$combined += $newEndpoint
$combined += $after
[System.IO.File]::WriteAllLines('c:\progetti\itainta\server.ts', $combined)
Write-Host "Done. Total lines: $($combined.Length)"
