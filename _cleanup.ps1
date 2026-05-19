$p = 'src\components\school\School_Management_App.tsx'
$c = Get-Content $p
$new = $c[0..1920] + $c[2251..($c.Length-1)]
Set-Content -Path $p -Value $new -Encoding UTF8
Write-Host ('Lines removed: ' + ($c.Length - $new.Length))
Write-Host ('Final line count: ' + $new.Length)
