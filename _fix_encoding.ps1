$p = 'src\components\school\School_Management_App.tsx'
# Read file bytes (these are now valid UTF-8 of the corrupted strings)
$bytes = [System.IO.File]::ReadAllBytes($p)
# Decode as UTF-8 (we get the "ðŸ" garbage strings)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
# Convert each "garbage" char to its Latin-1 byte value (these were the original UTF-8 bytes)
$revertedBytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($text)
# Write back as raw bytes (now valid UTF-8 of original emoji)
[System.IO.File]::WriteAllBytes($p, $revertedBytes)
Write-Host 'Encoding fixed.'
