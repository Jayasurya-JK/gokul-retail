# Export-OldPC.ps1
# Gokul Retail - Windows 7 / PowerShell 2.0 variant of Copy-OldPC.ps1.
# Copies the old POSBean PC's data into a NEW folder. Destination (default): the drive this
# script runs from, if it is not C: or D: and has enough free space, as <drive>:\OldPC-Backup-<stamp>\.
# Otherwise: C:\GokulExport\OldPC-<stamp>\ on the old PC. The user types YES before anything stops.
# Zips (DATABASE and REST) are made only when the destination is C:\GokulExport.
#
# TWO PHASES, to keep billing downtime short:
#   Phase A (POSBean closed, a few minutes): stop the database services cleanly
#     (dependents first, Stop-Service without -Force), copy every database file found
#     and every engine data directory into database-files\, verify sizes, then ALWAYS
#     restart the services in reverse order.
#   Phase B (POSBean may be running again). External disk destination: copy the WHOLE C: drive
#     (C-drive\) and the WHOLE D: drive (D-drive\) with robocopy /R:0 /W:0. Locked Windows files
#     are skipped and logged (normal). Fallback (C:\GokulExport): copy D:, the POSBean folder and
#     Desktop/Documents only, because copying C: would copy the output into itself.
#     Database files are excluded from all Phase B copies.
#   ZIP: OldPC-<stamp>-DATABASE.zip (database-files, inventory.txt, verify.txt) and
#     OldPC-<stamp>-REST.zip (everything else). Made with the Windows shell (Shell.Application).
#
# SAFETY RULES (do not change these):
#  - Writes only inside C:\GokulExport. Never formats, never deletes, never mirrors
#    (no robocopy /MIR, no /PURGE).
#  - C:\GokulExport itself is never scanned for database files and never copied (no recursion).
#  - Never uses -Force on Stop-Service and never kills POSBean. The user closes it.
#  - Never opens database contents (names, sizes, dates only).
#
# Usage:
#   Export-OldPC.ps1                                   normal run (Export-OldPC.bat runs this)
#   Export-OldPC.ps1 -WhatIf                           inventory and plan only; no prompts, no stops, copies or zips
#   Export-OldPC.ps1 -WhatIf -WhatIfFolder <folder>    same, but the WhatIf inventory goes to <folder>
#
# Written for Windows 7 with PowerShell 2.0. Do not use PowerShell 3+ syntax here:
# no Get-CimInstance, no -File/-Directory filters, no [PSCustomObject], no $PSScriptRoot,
# no Compress-Archive, no -in/-notin, no ternary, no ??, no && or ||.

param(
    [switch]$WhatIf,
    [string]$WhatIfFolder = ''
)

$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ExportRoot = 'C:\GokulExport'
$DbExtensions = @('.mdf', '.ldf', '.ndf', '.bak', '.mdb', '.accdb', '.fdb', '.gdb', '.db', '.sqlite', '.db3', '.dbf', '.sdf', '.ibd', '.frm')
# Extra live-file types excluded from the Phase B copies only
$LiveExcludeExt = @('*.mdf', '*.ldf', '*.ndf', '*.mdb', '*.accdb', '*.fdb', '*.gdb', '*.ldb', '*.laccdb', '*.bak', '*.db', '*.sqlite', '*.db3', '*.dbf', '*.sdf', '*.ibd', '*.frm')
$ServiceRegex = 'SQL|Firebird|MySQL|MariaDB|postgres'
# Database engines that are stopped (plus their running dependents, dependents first)
$EngineRegex = '^MSSQL\$|^MSSQLSERVER$|^MySQL|^MariaDB|^postgresql|^FirebirdServer|^FirebirdGuardian'
# Engines whose whole data directory is copied (these keep files with no extension)
$EngineDirRegex = '^MySQL|^MariaDB|^postgresql'
# Helper services that are never stopped
$LeaveRunningRegex = 'SQLWriter|SQLBrowser|CEIP|TELEMETRY|VSS'
$ProgramRegex = 'POSBean|POS|SQL|Firebird|MySQL|Access'
$PosBeanRegex = 'POSBean'
$StopTimeoutSec = 90
$SpaceFactor = 2.2
# External disk: needed = (C: used + D: used) x 1.1
$ExternalFactor = 1.1
$ZipMaxFileBytes = 3.9 * 1GB
$DbZipItems = @('database-files', 'inventory.txt', 'verify.txt')

$script:LogFile = $null
$script:CopyLog = $null
$script:OutDir = $null
$script:Buffer = New-Object System.Collections.ArrayList
$script:Inv = New-Object System.Collections.ArrayList
$script:ZipLines = New-Object System.Collections.ArrayList
$StoppedServices = New-Object System.Collections.ArrayList
$Problems = New-Object System.Collections.ArrayList
$VerifyResults = New-Object System.Collections.ArrayList
$EngineVerify = New-Object System.Collections.ArrayList
$StopPlan = New-Object System.Collections.ArrayList
$LeftRunning = New-Object System.Collections.ArrayList
$EngineDirs = New-Object System.Collections.ArrayList

# ---------- helpers ----------

function Say {
    param([string]$Text, [string]$Color = 'Gray')
    Write-Host $Text -ForegroundColor $Color
    $line = (Get-Date -Format 'HH:mm:ss') + '  ' + $Text
    if ($script:LogFile) {
        try { Add-Content -Path $script:LogFile -Value $line -Encoding ASCII } catch { }
    } else {
        [void]$script:Buffer.Add($line)
    }
}

function Problem {
    param([string]$Text)
    [void]$Problems.Add($Text)
    Say ('PROBLEM: ' + $Text) 'Red'
}

function Add-Inv {
    param([string]$Line)
    [void]$script:Inv.Add($Line)
}

function GB {
    param($Bytes)
    if (-not $Bytes) { return 0 }
    return [math]::Round(([double]$Bytes) / 1GB, 2)
}

function MB {
    param($Bytes)
    if (-not $Bytes) { return 0 }
    return [math]::Round(([double]$Bytes) / 1MB, 1)
}

function Get-MinText {
    param([double]$Bytes, [double]$MBps)
    if ($MBps -le 0) { return 'unknown' }
    $minutes = $Bytes / ($MBps * 1MB) / 60
    return ([math]::Round($minutes, 1)).ToString() + ' min'
}

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Disks {
    return @(Get-WmiObject -Class Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' | Sort-Object DeviceID)
}

# Total bytes of all files under a folder (names and sizes only)
function Get-FolderBytes {
    param([string]$Path)
    $total = 0.0
    $files = @(Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer })
    foreach ($f in $files) { $total += [double]$f.Length }
    return $total
}

# Largest single file under a path (a file or a folder). Used for the 3.9 GB zip rule.
function Get-MaxFileBytes {
    param([string]$Path)
    $max = 0.0
    if (-not (Test-Path -LiteralPath $Path)) { return 0.0 }
    $item = Get-Item -LiteralPath $Path
    if (-not $item.PSIsContainer) { return [double]$item.Length }
    $files = @(Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer })
    foreach ($f in $files) {
        if ([double]$f.Length -gt $max) { $max = [double]$f.Length }
    }
    return $max
}

function Get-PosBeanProcs {
    return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match $PosBeanRegex })
}

# Adds a running service to the stop plan AFTER its running dependents,
# so dependents are stopped first and the engine last.
function Add-StopItem {
    param([string]$Name)
    if ($StopPlan -contains $Name) { return }
    if ($LeftRunning -contains $Name) { return }
    if ($Name -match $LeaveRunningRegex) { [void]$LeftRunning.Add($Name); return }
    $sc = $null
    try { $sc = Get-Service -Name $Name -ErrorAction Stop } catch { $sc = $null }
    if ($sc) {
        foreach ($dep in @($sc.DependentServices)) {
            if ($dep.Status -eq 'Running') { Add-StopItem -Name $dep.Name }
        }
    }
    [void]$StopPlan.Add($Name)
}

# Finds the data directory of a MySQL, MariaDB or PostgreSQL service. Returns '' if not found.
# Reads only the service command line and the my.ini config file, never database contents.
function Get-EngineDataDir {
    param([string]$ServiceName, [string]$PathName)
    $found = ''
    if ($ServiceName -match '^MySQL|^MariaDB') {
        $m = [regex]::Match($PathName, '--datadir="([^"]+)"')
        if ($m.Success) { $found = $m.Groups[1].Value }
        if ($found -eq '') {
            $ini = ''
            $mi = [regex]::Match($PathName, '--defaults-file="([^"]+)"')
            if (-not $mi.Success) { $mi = [regex]::Match($PathName, '--defaults-file=(\S+)') }
            if ($mi.Success) { $ini = $mi.Groups[1].Value }
            if ($ini -ne '' -and (Test-Path -LiteralPath $ini)) {
                foreach ($line in @(Get-Content -LiteralPath $ini -ErrorAction SilentlyContinue)) {
                    $lm = [regex]::Match($line, '^\s*datadir\s*=\s*(.+?)\s*$', 'IgnoreCase')
                    if ($lm.Success) { $found = $lm.Groups[1].Value; break }
                }
            }
        }
        if ($found -eq '' -and (Test-Path -LiteralPath 'C:\ProgramData\MySQL')) {
            $subs = @(Get-ChildItem -LiteralPath 'C:\ProgramData\MySQL' -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer })
            foreach ($sub in $subs) {
                $cand = Join-Path $sub.FullName 'Data'
                if (Test-Path -LiteralPath $cand) { $found = $cand; break }
            }
        }
    } elseif ($ServiceName -match '^postgresql') {
        $m = [regex]::Match($PathName, '-D\s+"([^"]+)"')
        if (-not $m.Success) { $m = [regex]::Match($PathName, '-D\s+(\S+)') }
        if ($m.Success) { $found = $m.Groups[1].Value }
    }
    $found = $found.Trim().Trim('"').Replace('/', '\').TrimEnd('\')
    if ($found -ne '' -and (Test-Path -LiteralPath $found)) { return $found }
    return ''
}

# Finds database-like files under one drive. Skips the Windows folder, WinSxS,
# junctions and the export folder itself (SkipDir). Names and sizes only.
function Find-DbFiles {
    param([string]$Root, [string]$SkipDir)
    $results = New-Object System.Collections.ArrayList
    $letter = $Root.Substring(0, 1)
    $winDir = $Root + '\Windows'
    $stack = New-Object System.Collections.Stack
    $stack.Push($Root + '\')
    while ($stack.Count -gt 0) {
        $dir = [string]$stack.Pop()
        try { $files = [System.IO.Directory]::GetFiles($dir) } catch { $files = @() }
        foreach ($f in $files) {
            $ext = [System.IO.Path]::GetExtension($f).ToLower()
            if ($DbExtensions -contains $ext) {
                try {
                    $fi = New-Object System.IO.FileInfo($f)
                    $entry = New-Object PSObject -Property @{
                        Drive = $letter
                        Path = $f
                        Size = [int64]$fi.Length
                        LastWrite = $fi.LastWriteTime
                    }
                    [void]$results.Add($entry)
                } catch { }
            }
        }
        try { $subs = [System.IO.Directory]::GetDirectories($dir) } catch { $subs = @() }
        foreach ($s in $subs) {
            $s2 = $s.TrimEnd('\')
            if ($s2 -ieq $winDir) { continue }
            if ($SkipDir -ne '' -and ($s2 -ieq $SkipDir)) { continue }
            if ([System.IO.Path]::GetFileName($s2) -ieq 'WinSxS') { continue }
            try {
                $attr = [System.IO.File]::GetAttributes($s2)
                if (($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
            } catch { continue }
            $stack.Push($s2 + '\')
        }
    }
    return $results
}

# Turns an install location, icon or uninstall string into a folder path.
function Get-InstallFolder {
    param($Prog)
    $loc = ([string]$Prog.InstallLocation).Trim().Trim('"')
    if ($loc -ne '' -and (Test-Path -LiteralPath $loc)) { return $loc.TrimEnd('\') }
    foreach ($raw in @([string]$Prog.DisplayIcon, [string]$Prog.UninstallString)) {
        $m = [regex]::Match($raw, '[A-Za-z]:\\[^",*?<>|]*?\.(exe|msi|dll)', 'IgnoreCase')
        if ($m.Success) {
            $f = Split-Path -Path $m.Value -Parent
            if ($f -and (Test-Path -LiteralPath $f)) { return $f }
        }
    }
    return ''
}

function Test-RoboCode {
    param([int]$Code, [string]$What)
    if ($Code -lt 8) {
        Say ($What + ' - done (robocopy code ' + $Code + ', OK).') 'Green'
        return $true
    }
    Problem ($What + ' - some files FAILED to copy (robocopy code ' + $Code + '). Details are in copy-log.txt.')
    return $false
}

# Runs robocopy. Never uses /MIR or /PURGE. Returns the robocopy exit code.
function Invoke-Robo {
    param(
        [string]$Source,
        [string]$Target,
        [string[]]$Options,
        [string]$FileName = '',
        [string[]]$ExcludeFiles = @(),
        [string[]]$ExcludeDirs = @(),
        [string]$Retry = '1'
    )
    $list = New-Object System.Collections.ArrayList
    [void]$list.Add($Source)
    [void]$list.Add($Target)
    if ($FileName -ne '') { [void]$list.Add($FileName) }
    foreach ($o in $Options) { [void]$list.Add($o) }
    [void]$list.Add('/R:' + $Retry)
    [void]$list.Add('/W:' + $Retry)
    [void]$list.Add('/NP')
    [void]$list.Add('/TEE')
    [void]$list.Add('/LOG+:' + $script:CopyLog)
    if ($ExcludeFiles.Count -gt 0) {
        [void]$list.Add('/XF')
        foreach ($x in $ExcludeFiles) { [void]$list.Add($x) }
    }
    if ($ExcludeDirs.Count -gt 0) {
        [void]$list.Add('/XD')
        foreach ($x in $ExcludeDirs) { [void]$list.Add($x) }
    }
    & robocopy.exe @($list.ToArray()) | Out-Host
    return [int]$LASTEXITCODE
}

function Show-Billing-Banner {
    $hashes = ''.PadRight(66, '#')
    $blank = '#' + ''.PadRight(64, ' ') + '#'
    $msg = '#' + ''.PadRight(7, ' ') + 'BILLING CAN START AGAIN NOW. You can open POSBean.' + ''.PadRight(7, ' ') + '#'
    Write-Host ''
    Write-Host $hashes -ForegroundColor Green
    Write-Host $blank -ForegroundColor Green
    Write-Host $msg -ForegroundColor Green
    Write-Host $blank -ForegroundColor Green
    Write-Host $hashes -ForegroundColor Green
    Write-Host ''
    $script:Buffer.Clear()
    if ($script:LogFile) {
        try { Add-Content -Path $script:LogFile -Value ((Get-Date -Format 'HH:mm:ss') + '  BILLING CAN START AGAIN NOW. You can open POSBean.') -Encoding ASCII } catch { }
    }
}

# Builds a zip with the Windows shell (Shell.Application). Starts from an empty zip
# (the 22-byte end-of-central-directory header), copies the named items in, and waits
# until the zip holds all of them and its size has stopped changing.
function New-ShellZip {
    param([string]$SourceDir, [string[]]$ItemNames, [string]$ZipPath)
    $expected = $ItemNames.Count
    $hdr = New-Object byte[] 22
    $hdr[0] = 80
    $hdr[1] = 75
    $hdr[2] = 5
    $hdr[3] = 6
    try {
        [System.IO.File]::WriteAllBytes($ZipPath, $hdr)
    } catch {
        Problem ('Could not create the zip ' + $ZipPath + ': ' + $_.Exception.Message)
        return $false
    }
    $shell = New-Object -ComObject Shell.Application
    $srcNs = $shell.NameSpace($SourceDir)
    $zipNs = $shell.NameSpace($ZipPath)
    if (($srcNs -eq $null) -or ($zipNs -eq $null)) {
        Problem ('The Windows zip service could not open ' + $SourceDir + ' or ' + $ZipPath + '.')
        return $false
    }
    $items = $srcNs.Items()
    $picked = 0
    for ($i = 0; $i -lt $items.Count; $i++) {
        $it = $items.Item($i)
        if ($ItemNames -contains $it.Name) {
            $zipNs.CopyHere($it, 20)
            $picked = $picked + 1
        }
    }
    if ($picked -lt $expected) {
        Problem ('Only ' + $picked + ' of ' + $expected + ' items were found in ' + $SourceDir + ' for the zip.')
        return $false
    }
    # Wait until the zip holds every item and its size has stopped changing
    $lastSize = -1.0
    $stable = 0
    $idle = 0
    $done = $false
    while (-not $done) {
        Start-Sleep -Seconds 3
        $count = [int]$shell.NameSpace($ZipPath).Items().Count
        $size = [double](Get-Item -LiteralPath $ZipPath).Length
        if ($size -eq $lastSize) { $idle = $idle + 3 } else { $idle = 0 }
        if (($count -ge $expected) -and ($size -eq $lastSize)) { $stable = $stable + 3 } else { $stable = 0 }
        if (($count -ge $expected) -and ($stable -ge 9)) { $done = $true }
        if ($idle -ge 1200) {
            Problem ('The zip ' + $ZipPath + ' did not change for 20 minutes. It may be incomplete. Nothing was deleted.')
            return $false
        }
        $lastSize = $size
    }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($zipNs) } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($srcNs) } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) } catch { }
    return $true
}

# Makes one zip part, unless a single file is over the 3.9 GB limit of the built-in zip.
function Make-ZipPart {
    param([string]$Label, [string]$ZipPath, [string[]]$ItemNames)
    if ($ItemNames.Count -eq 0) {
        Say ('Nothing to put in the ' + $Label + ' zip.')
        return
    }
    $bigBytes = 0.0
    foreach ($n in $ItemNames) {
        $b = Get-MaxFileBytes -Path (Join-Path $script:OutDir $n)
        if ($b -gt $bigBytes) { $bigBytes = $b }
    }
    if ($bigBytes -gt $ZipMaxFileBytes) {
        Problem ($Label + ' zip skipped: a file is ' + (GB $bigBytes) + ' GB, over the 3.9 GB limit of the Windows zip.')
        Say ('Use 7-Zip for this folder: ' + $script:OutDir) 'Yellow'
        return
    }
    if (Test-Path -LiteralPath $ZipPath) {
        Problem ('The zip ' + $ZipPath + ' already exists. It was not overwritten.')
        return
    }
    Say ('Making the ' + $Label + ' zip: ' + $ZipPath + ' ...') 'Cyan'
    $ok = New-ShellZip -SourceDir $script:OutDir -ItemNames $ItemNames -ZipPath $ZipPath
    if ($ok) {
        $zsize = (Get-Item -LiteralPath $ZipPath).Length
        Say ($Label + ' zip done: ' + $ZipPath + '   ' + (MB $zsize) + ' MB') 'Green'
        [void]$script:ZipLines.Add($Label + ' zip: ' + $ZipPath + '   ' + (MB $zsize) + ' MB')
    } else {
        Say ($Label + ' zip was NOT completed. See the PROBLEM lines above. The backup folder is untouched.') 'Yellow'
    }
}

# ---------- start ----------

Say '=============================================================='
if ($WhatIf) {
    Say 'Gokul Retail - export the old POSBean PC (Windows 7)   [WHAT-IF MODE: plan only]'
} else {
    Say 'Gokul Retail - export the old POSBean PC (Windows 7, two phases)'
}
Say '=============================================================='

$isAdmin = Test-Admin
if (-not $isAdmin) {
    if (-not $WhatIf) {
        Write-Host 'This must run as Administrator. Double-click Export-OldPC.bat instead.' -ForegroundColor Red
        exit 1
    }
    Say 'Note: not running as Administrator. Some folders may be skipped in this preview.' 'Yellow'
}

$disks = Get-Disks
$cDisk = $disks | Where-Object { $_.DeviceID -eq 'C:' } | Select-Object -First 1
$dDisk = $disks | Where-Object { $_.DeviceID -eq 'D:' } | Select-Object -First 1
$dUsed = 0.0
if ($dDisk) { $dUsed = [double]($dDisk.Size - $dDisk.FreeSpace) }

if (-not $cDisk) {
    Write-Host 'No C: drive was found on this PC. Nothing was changed.' -ForegroundColor Red
    exit 1
}

# ---------- STEP 1: inventory (read only; the output folder is chosen after this) ----------

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$outName = 'OldPC-' + $stamp
$script:OutDir = ''

Say ''
Say 'STEP 1 - Inventory (reading only, nothing is changed)' 'Cyan'

$os = Get-WmiObject -Class Win32_OperatingSystem
Add-Inv 'OLD PC INVENTORY'
Add-Inv ('Made: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
Add-Inv ('Windows: ' + $os.Caption + ' (version ' + $os.Version + ')')
Add-Inv ('Computer name: ' + $env:COMPUTERNAME)
Add-Inv ''
Add-Inv 'DRIVES  (type 2 = removable, 3 = fixed)'
foreach ($d in $disks) {
    Add-Inv ('  ' + $d.DeviceID + '  type=' + $d.DriveType + '  label="' + [string]$d.VolumeName + '"  size=' + (GB $d.Size) + ' GB  free=' + (GB $d.FreeSpace) + ' GB')
}

$programs = New-Object System.Collections.ArrayList
$regKeys = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($key in $regKeys) {
    if (-not (Test-Path -LiteralPath $key)) { continue }
    foreach ($item in @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)) {
        $p = Get-ItemProperty -LiteralPath $item.PSPath -ErrorAction SilentlyContinue
        if (-not $p -or -not $p.DisplayName) { continue }
        if ([string]$p.DisplayName -notmatch $ProgramRegex) { continue }
        $folder = Get-InstallFolder -Prog $p
        [void]$programs.Add((New-Object PSObject -Property @{
            Name = [string]$p.DisplayName
            Version = [string]$p.DisplayVersion
            Publisher = [string]$p.Publisher
            Folder = $folder
        }))
    }
}
Add-Inv ''
Add-Inv 'INSTALLED PROGRAMS matching POSBean, POS, SQL, Firebird, MySQL, Access'
if ($programs.Count -eq 0) { Add-Inv '  (none found)' }
foreach ($pr in $programs) {
    $folderText = $pr.Folder
    if ($folderText -eq '') { $folderText = '(install folder not recorded)' }
    Add-Inv ('  ' + $pr.Name + '  version ' + $pr.Version + '  publisher ' + $pr.Publisher)
    Add-Inv ('      install path: ' + $folderText)
}

$posbeanFolders = New-Object System.Collections.ArrayList
foreach ($pr in $programs) {
    if ($pr.Name -match $PosBeanRegex -and $pr.Folder -ne '' -and -not ($posbeanFolders -contains $pr.Folder)) {
        [void]$posbeanFolders.Add($pr.Folder)
    }
}
$searchBases = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData, 'C:\', 'D:\')
foreach ($base in $searchBases) {
    if (-not $base -or -not (Test-Path -LiteralPath $base)) { continue }
    $dirs = @(Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer -and $_.Name -match $PosBeanRegex })
    foreach ($dir in $dirs) {
        $full = $dir.FullName.TrimEnd('\')
        if (-not ($posbeanFolders -contains $full)) { [void]$posbeanFolders.Add($full) }
    }
}
Add-Inv ''
Add-Inv 'POSBEAN PROGRAM FOLDERS FOUND'
if ($posbeanFolders.Count -eq 0) { Add-Inv '  (none found - copy the POSBean folder by hand if you know where it is)' }
foreach ($pf in $posbeanFolders) {
    Add-Inv ('  ' + $pf)
}

$services = @(Get-WmiObject -Class Win32_Service | Where-Object { $_.Name -match $ServiceRegex -or $_.DisplayName -match $ServiceRegex })
Add-Inv ''
Add-Inv 'DATABASE SERVICES (SQL, Firebird, MySQL)'
if ($services.Count -eq 0) { Add-Inv '  (none found)' }
foreach ($s in $services) {
    Add-Inv ('  ' + $s.Name + '  |  ' + $s.DisplayName + '  |  status: ' + $s.State + '  |  start mode: ' + $s.StartMode)
}

$dbFiles = New-Object System.Collections.ArrayList
foreach ($d in $disks) {
    if ([int]$d.DriveType -ne 3) { continue }
    Say ('Searching ' + $d.DeviceID + ' for database files (names only, nothing is opened; ' + $ExportRoot + ' is skipped)...')
    foreach ($f in @(Find-DbFiles -Root $d.DeviceID -SkipDir $ExportRoot)) { [void]$dbFiles.Add($f) }
}
Add-Inv ''
Add-Inv ('DATABASE-LIKE FILES FOUND: ' + $dbFiles.Count)
Add-Inv ('  (extensions: ' + ($DbExtensions -join ' ') + ')')
foreach ($f in $dbFiles) {
    Add-Inv ('  ' + $f.Path + '  |  ' + (MB $f.Size) + ' MB  |  last written ' + $f.LastWrite.ToString('yyyy-MM-dd HH:mm'))
}

# Stop plan: running engines, with their running dependents first
$engineRoots = @($services | Where-Object { $_.State -eq 'Running' -and $_.Name -match $EngineRegex })
foreach ($root in $engineRoots) { Add-StopItem -Name $root.Name }
foreach ($s in $services) {
    if ($s.State -eq 'Running' -and -not ($StopPlan -contains $s.Name) -and -not ($LeftRunning -contains $s.Name)) {
        [void]$LeftRunning.Add($s.Name)
    }
}

# Engine data directories (MySQL/MariaDB/PostgreSQL keep extension-less files)
foreach ($s in $services) {
    if ($s.Name -notmatch $EngineDirRegex) { continue }
    $edir = Get-EngineDataDir -ServiceName $s.Name -PathName ([string]$s.PathName)
    if ($edir -ne '') { [void]$EngineDirs.Add((New-Object PSObject -Property @{ Service = $s.Name; Dir = $edir })) }
}

Add-Inv ''
Add-Inv 'SERVICE STOP PLAN (dependents first; stopped with Stop-Service, never -Force)'
if ($StopPlan.Count -eq 0) { Add-Inv '  (no database engine is running)' }
foreach ($n in $StopPlan) { Add-Inv ('  stop: ' + $n) }
Add-Inv ''
Add-Inv 'LEFT RUNNING (helper services, or not database engines)'
if ($LeftRunning.Count -eq 0) { Add-Inv '  (none)' }
foreach ($n in $LeftRunning) { Add-Inv ('  ' + $n) }
Add-Inv ''
Add-Inv 'ENGINE DATA DIRECTORIES (copied whole in Phase A, excluded from Phase B)'
if ($EngineDirs.Count -eq 0) { Add-Inv '  (none found)' }
foreach ($e in $EngineDirs) { Add-Inv ('  ' + $e.Service + '  ->  ' + $e.Dir) }

$dbBytes = 0.0
foreach ($f in $dbFiles) { $dbBytes += [double]$f.Size }

$posBytes = 0.0
foreach ($pf in $posbeanFolders) { $posBytes += (Get-FolderBytes -Path $pf) }

$userFolders = New-Object System.Collections.ArrayList
$userBytes = 0.0
if (Test-Path -LiteralPath 'C:\Users') {
    $users = @(Get-ChildItem -LiteralPath 'C:\Users' -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer -and ($_.Name -notmatch '^(Public|Default|Default User|All Users|defaultuser0)$') })
    foreach ($u in $users) {
        foreach ($sub in @('Desktop', 'Documents')) {
            $p = Join-Path $u.FullName $sub
            $pExists = $false
            try { $pExists = Test-Path -LiteralPath $p -ErrorAction Stop } catch { $pExists = $false }
            if ($pExists) {
                [void]$userFolders.Add((New-Object PSObject -Property @{ User = $u.Name; Sub = $sub; Path = $p }))
                $userBytes += (Get-FolderBytes -Path $p)
            }
        }
    }
}

$dUsedBytes = 0.0
if ($dDisk) { $dUsedBytes = $dUsed }

Say ('Programs matched: ' + $programs.Count + '   Database services: ' + $services.Count + '   Database-like files: ' + $dbFiles.Count + '   POSBean folders: ' + $posbeanFolders.Count)
Say ('Database files total: ' + (GB $dbBytes) + ' GB.   POSBean folder: ' + (GB $posBytes) + ' GB.   C: Desktop/Documents: ' + (GB $userBytes) + ' GB.')

# ---------- STEP 2: choose the destination ----------
# Default: the drive this script runs from (the new external disk), if it is not C: or D:
# and has enough free space. Otherwise: C:\GokulExport\OldPC-<stamp>\ on this PC.

Say ''
Say 'STEP 2 - Choose where the copy goes' 'Cyan'
$cFree = [double]$cDisk.FreeSpace
$needC = ($dbBytes + $dUsedBytes) * $SpaceFactor
$cUsedBytes = [double]($cDisk.Size - $cDisk.FreeSpace)
$needExt = ($cUsedBytes + $dUsedBytes) * $ExternalFactor
$scriptDrive = ([string](Split-Path -Qualifier $ScriptDir)).ToUpper()
$extDisk = $disks | Where-Object { $_.DeviceID -eq $scriptDrive } | Select-Object -First 1
$toExternal = $false
$whyNot = ''
if ($scriptDrive -eq '') {
    $whyNot = 'the script location has no drive letter'
} elseif (($scriptDrive -eq 'C:') -or ($scriptDrive -eq 'D:')) {
    $whyNot = 'the script runs from ' + $scriptDrive + ', which is one of the old PC''s own drives'
} elseif ((-not $extDisk) -or (-not $extDisk.Size)) {
    $whyNot = 'drive ' + $scriptDrive + ' is not a ready disk'
} elseif ([double]$extDisk.FreeSpace -le $needExt) {
    $whyNot = 'drive ' + $scriptDrive + ' has ' + (GB $extDisk.FreeSpace) + ' GB free but needs more than ' + (GB $needExt) + ' GB'
} else {
    $toExternal = $true
}

if ($toExternal) {
    $outName = 'OldPC-Backup-' + $stamp
    if (Test-Path -LiteralPath ($scriptDrive + '\' + $outName)) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $outName = 'OldPC-Backup-' + $stamp
    }
    $plannedOut = $scriptDrive + '\' + $outName
    $destIsExport = $false
    $spaceOk = $true
    $destText = 'the new disk ' + $scriptDrive + ' (the drive this script runs from)'
    $spaceLine = $scriptDrive + ' free ' + (GB $extDisk.FreeSpace) + ' GB; needs more than ' + (GB $needExt) + ' GB = (C: used ' + (GB $cUsedBytes) + ' GB + D: used ' + (GB $dUsedBytes) + ' GB) x 1.1.   -> OK'
} else {
    $outName = 'OldPC-' + $stamp
    if (Test-Path -LiteralPath ($ExportRoot + '\' + $outName)) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $outName = 'OldPC-' + $stamp
    }
    $plannedOut = $ExportRoot + '\' + $outName
    $destIsExport = $true
    $spaceOk = ($cFree -gt $needC)
    $destText = 'C:\GokulExport on this PC (fallback: ' + $whyNot + ')'
    $okText = 'OK'
    if (-not $spaceOk) { $okText = 'NOT ENOUGH SPACE' }
    $spaceLine = 'C: free ' + (GB $cFree) + ' GB; needs more than ' + (GB $needC) + ' GB = (database files ' + (GB $dbBytes) + ' GB + D: used ' + (GB $dUsedBytes) + ' GB) x 2.2, because the zip needs room too.   -> ' + $okText
}
Say ('Destination: ' + $plannedOut)
Say ('   ' + $destText)
Say ('   ' + $spaceLine)
if (-not $toExternal) {
    Say ('Note: the POSBean folder and Desktop/Documents (' + (GB ($posBytes + $userBytes)) + ' GB) are also copied. Check C: has room for them too.') 'Yellow'
}

if ((-not $spaceOk) -and (-not $WhatIf)) {
    Problem ('Not enough free space at ' + $plannedOut + '. Nothing was stopped or copied.')
    exit 1
}

# Create the output folder (the only folder written) and the inventory
if ($WhatIf) {
    if ($WhatIfFolder -eq '') { $WhatIfFolder = $ExportRoot + '\WhatIf-' + $stamp }
    $script:OutDir = $WhatIfFolder
} else {
    $script:OutDir = $plannedOut
}
try {
    if ((-not $WhatIf) -and $destIsExport) { [void][System.IO.Directory]::CreateDirectory($ExportRoot) }
    [void][System.IO.Directory]::CreateDirectory($script:OutDir)
} catch {
    Write-Host ('Could not create the output folder ' + $script:OutDir + ': ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Nothing was stopped or copied.' -ForegroundColor Red
    exit 1
}
$script:LogFile = Join-Path $script:OutDir 'run-log.txt'
$script:CopyLog = Join-Path $script:OutDir 'copy-log.txt'
foreach ($early in $script:Buffer) {
    try { Add-Content -Path $script:LogFile -Value $early -Encoding ASCII } catch { }
}
$script:Buffer.Clear()
$inventoryPath = Join-Path $script:OutDir 'inventory.txt'
Set-Content -Path $inventoryPath -Value $script:Inv -Encoding ASCII
Say ('Output folder: ' + $script:OutDir)
Say ('Inventory written: ' + $inventoryPath) 'Green'

# ---------- Time estimates ----------
if ($toExternal) {
    $phaseBBytes = $cUsedBytes + $dUsedBytes
    $phaseBDesc = 'the WHOLE C: drive and the WHOLE D: drive'
} else {
    $phaseBBytes = $dUsedBytes + $posBytes + $userBytes
    $phaseBDesc = 'the D: drive, POSBean folder and Desktop/Documents'
}
Say ''
Say 'TIME ESTIMATE' 'Cyan'
Say ('Phase A (POSBean closed) copies only the database files: ' + (GB $dbBytes) + ' GB.')
Say ('   at 30 MB/s (USB 2): about ' + (Get-MinText -Bytes $dbBytes -MBps 30) + '   at 100 MB/s (USB 3): about ' + (Get-MinText -Bytes $dbBytes -MBps 100))
Say ('Phase B (POSBean may run) copies ' + $phaseBDesc + ': about ' + (GB $phaseBBytes) + ' GB.')
Say ('   at 30 MB/s: about ' + (Get-MinText -Bytes $phaseBBytes -MBps 30) + '   at 100 MB/s: about ' + (Get-MinText -Bytes $phaseBBytes -MBps 100))

# ---------- PRE-CHECK screen (one console screen, for the owner to photograph) ----------

if (-not $WhatIf) { Clear-Host }
Say '================================ PRE-CHECK ================================' 'Cyan'
Say ('Windows: ' + $os.Caption + '  (version ' + $os.Version + ')')
Say ('C: used ' + (GB $cUsedBytes) + ' GB      D: used ' + (GB $dUsedBytes) + ' GB')
if ($toExternal) {
    Say ('Destination: ' + $plannedOut + '   (' + $scriptDrive + ' free ' + (GB $extDisk.FreeSpace) + ' GB)')
} else {
    Say ('Destination: ' + $plannedOut + '   (C: free ' + (GB $cFree) + ' GB; fallback)')
}
Say ('POSBean folders found: ' + $posbeanFolders.Count)
foreach ($pf in $posbeanFolders) { Say ('   - ' + $pf) }
Say ('Database services found: ' + $services.Count)
foreach ($s in $services) { Say ('   ' + $s.Name + '   status ' + $s.State) }
Say 'Planned stop order (dependents first):'
if ($StopPlan.Count -eq 0) { Say '   (no database engine is running)' }
$stopNo = 0
foreach ($n in $StopPlan) { $stopNo = $stopNo + 1; Say ('   ' + $stopNo + '. ' + $n) }
Say 'Engine data directories:'
if ($EngineDirs.Count -eq 0) { Say '   (none)' }
foreach ($e in $EngineDirs) { Say ('   ' + $e.Service + ' -> ' + $e.Dir) }
Say ('Database files: ' + $dbFiles.Count + '   total ' + (GB $dbBytes) + ' GB')
Say '10 largest database files:'
$topDb = @($dbFiles | Sort-Object -Property Size -Descending | Select-Object -First 10)
foreach ($t in $topDb) { Say ('   ' + (MB $t.Size) + ' MB   ' + $t.Path) }
Say ('Time, Phase A (POSBean closed): about ' + (Get-MinText -Bytes $dbBytes -MBps 30) + ' at 30 MB/s, ' + (Get-MinText -Bytes $dbBytes -MBps 100) + ' at 100 MB/s')
Say ('Time, Phase B (POSBean may run): about ' + (Get-MinText -Bytes $phaseBBytes -MBps 30) + ' at 30 MB/s, ' + (Get-MinText -Bytes $phaseBBytes -MBps 100) + ' at 100 MB/s')
Say '==========================================================================='

if (-not $WhatIf) {
    $go = ([string](Read-Host 'PRE-CHECK done. Take a PHOTO of this screen and send it. When you are told to continue, type GO (anything else exits safely)')).Trim()
    if ($go -cne 'GO') {
        Say 'Not GO. Exiting safely. Nothing was stopped, copied, zipped or removed.' 'Yellow'
        exit 0
    }
}

# ---------- WHAT-IF: print the plan and stop here ----------

if ($WhatIf) {
    Say ''
    Say '==================== WHAT-IF PLAN ====================' 'Cyan'
    Say 'Nothing below is done in WhatIf mode. No prompts, no services stopped, nothing copied, nothing zipped.'
    Say ''
    if (-not $spaceOk) { Say 'NOT ENOUGH SPACE: the real run would stop here.' 'Yellow' }
    Say ''
    Say ('1. Destination the real run would use: ' + $plannedOut + '   (' + $destText + ')')
    Say ('2. Inventory: written to ' + $inventoryPath + ' (done). Only this WhatIf folder was written.')
    Say '3. Confirmation: the real run asks you to type YES before anything is stopped.'
    Say '4. PHASE A (POSBean closed):'
    Say '     - Ask the user to close POSBean normally and type DONE. Never kill POSBean.'
    if ($StopPlan.Count -eq 0) {
        Say '     - No database services are running. Nothing to stop.'
    } else {
        Say '     - Stop these services with Stop-Service (no -Force), dependents first, up to 90 s each:'
        foreach ($n in $StopPlan) { Say ('          - ' + $n) }
    }
    if ($LeftRunning.Count -gt 0) { Say ('     - Left running: ' + ($LeftRunning -join ', ')) }
    Say '     - Engine data directories copied whole while the engine is stopped:'
    if ($EngineDirs.Count -eq 0) { Say '          (none found)' }
    foreach ($e in $EngineDirs) { Say ('          - ' + $e.Service + ' -> ' + $e.Dir) }
    Say ('     - Copy ALL ' + $dbFiles.Count + ' database file(s), ' + (GB $dbBytes) + ' GB, into ' + $plannedOut + '\database-files\<drive>\<original path>, then verify sizes.')
    Say '     - Restart the services in a finally block, then print: BILLING CAN START AGAIN NOW.'
    Say '5. PHASE B (POSBean may run again):'
    if ($toExternal) {
        Say ('     - Copy the WHOLE C: drive to ' + $plannedOut + '\C-drive\  (robocopy /E /COPY:DAT /DCOPY:T /R:0 /W:0 /XJ /NP).')
        Say '          Excluded files: pagefile.sys, hiberfil.sys, swapfile.sys, database file extensions (already in database-files\).'
        Say ('          Excluded folders: $RECYCLE.BIN, System Volume Information, engine data dirs, ' + $ExportRoot + ', the output folder.')
        if ($dDisk) {
            Say ('     - Copy the WHOLE D: drive to ' + $plannedOut + '\D-drive\  with the same options.')
        } else {
            Say '     - No D: drive on this PC: skipped.'
        }
        Say '     - Skipped locked Windows files are NORMAL. database-files\ is the important part.'
        Say '     - POSBean program folder(s) and Desktop/Documents are inside C:, so they are copied by the C: copy.'
        Say '     POSBean program folder(s) found (kept in inventory.txt):'
        if ($posbeanFolders.Count -eq 0) { Say '          (none found)' }
        foreach ($pf in $posbeanFolders) { Say ('          - ' + $pf) }
    } else {
        Say ('     - Copy the whole D: drive to ' + $plannedOut + '\D-drive, excluding database file extensions, engine data directories and ' + $ExportRoot + '.')
        Say ('     - Copy POSBean program folder(s) to ' + $plannedOut + '\posbean-program\, excluding database file extensions:')
        if ($posbeanFolders.Count -eq 0) { Say '          (none found)' }
        foreach ($pf in $posbeanFolders) { Say ('          - ' + $pf) }
        Say ('     - Copy C: user Desktop and Documents to ' + $plannedOut + '\C-user-files\, excluding database file extensions:')
        if ($userFolders.Count -eq 0) { Say '          (none found)' }
        foreach ($uf in $userFolders) { Say ('          - ' + $uf.Path) }
    }
    Say '6. Write README-in-backup.txt and verify.txt (OK / MISSING / SIZE MISMATCH per database file).'
    if ($destIsExport) {
        Say '7. ZIP (next to the folder, in C:\GokulExport):'
        Say ('     - ' + $ExportRoot + '\' + $outName + '-DATABASE.zip : database-files, inventory.txt, verify.txt  (copy this one first)')
        Say ('     - ' + $ExportRoot + '\' + $outName + '-REST.zip : everything else (optional)')
        Say '     - A zip is skipped and "Use 7-Zip for this folder" is printed if any single file is over 3.9 GB.'
    } else {
        Say '7. ZIP: none. The destination is the external disk, so nothing is zipped.'
    }
    Say ''
    Say 'WhatIf finished. Nothing was stopped, copied or zipped.' 'Green'
    exit 0
}

# ---------- Confirmation: last point before anything is stopped ----------

Say ''
Say ('About to copy to ' + $script:OutDir + '.') 'Cyan'
Say 'Nothing is stopped until you type YES. Only this new folder is written.' 'Cyan'
$yes = ([string](Read-Host 'Type YES to continue, or press Enter to cancel')).Trim()
if ($yes -cne 'YES') {
    Say 'Not confirmed with YES. Nothing was stopped or copied.'
    exit 0
}

# ---------- PHASE A: POSBean closed, database files ----------

Say ''
Say '==================== PHASE A: billing stop (keep it short) ====================' 'Cyan'
$phaseAStart = Get-Date
$phaseAOk = $true
$allRestarted = $true

try {
    # A1: POSBean must be closed by the user. Never killed.
    # Always ask, even if no POSBean process is detected (its .exe name may not contain "POSBean").
    Say 'Finish or cancel the current bill, then CLOSE POSBean normally (File, Exit, or the window close button).' 'Yellow'
    $ack = ''
    while ($ack -ne 'DONE') {
        $ack = ([string](Read-Host 'When POSBean is fully closed, type DONE and press Enter')).Trim().ToUpper()
    }
    $pbNow = @(Get-PosBeanProcs)
    while ($pbNow.Count -gt 0) {
        Say 'POSBean is still open. Please close POSBean normally (File, Exit, or the window close button).' 'Yellow'
        [void](Read-Host 'Close POSBean, then type DONE and press Enter')
        $pbNow = @(Get-PosBeanProcs)
        if ($pbNow.Count -gt 0) { Say 'POSBean is still running. Close it normally, then type DONE again.' 'Yellow' }
    }
    Say 'POSBean is closed.' 'Green'

    # A2: stop the database engines cleanly (no -Force), dependents first
    if ($StopPlan.Count -eq 0) {
        Say 'No database services are running. Nothing to stop.'
    } else {
        foreach ($name in @($StopPlan)) {
            try {
                $live = Get-Service -Name $name -ErrorAction Stop
                if ($live.Status -ne 'Running') {
                    Say ('Already stopped: ' + $name)
                    continue
                }
                $svcCtl = Get-Service -Name $name -ErrorAction Stop; $svcCtl.Stop()  # clean SCM stop (same as net stop); Stop-Service refuses any service that has dependents, even stopped ones
                [void]$StoppedServices.Add($name)
                $svcObj = Get-Service -Name $name -ErrorAction Stop
                $svcObj.WaitForStatus('Stopped', (New-TimeSpan -Seconds $StopTimeoutSec))
                Say ('Stopped ' + $name)
            } catch {
                Problem ('Service ' + $name + ' did not stop cleanly within ' + $StopTimeoutSec + ' s: ' + $_.Exception.Message)
                $phaseAOk = $false
                break
            }
        }
    }

    if ($phaseAOk) {
        # A3a: engine data directories, copied whole while the engine is stopped
        foreach ($e in $EngineDirs) {
            $safeSvc = $e.Service -replace '[^A-Za-z0-9._-]', '_'
            $edTarget = $script:OutDir + '\database-files\engine-data\' + $safeSvc
            $code = Invoke-Robo -Source $e.Dir -Target $edTarget -Options @('/E', '/COPY:DAT', '/XJ')
            [void](Test-RoboCode -Code $code -What ('Engine data ' + $e.Dir))
            $srcBytes = Get-FolderBytes -Path $e.Dir
            $dstBytes = Get-FolderBytes -Path $edTarget
            if ([int64]$srcBytes -eq [int64]$dstBytes) {
                [void]$EngineVerify.Add('OK             ' + $e.Dir + '   ->   ' + $edTarget + '   (' + (MB $srcBytes) + ' MB, ' + ([int64]$dstBytes) + ' bytes)')
            } else {
                [void]$EngineVerify.Add('SIZE MISMATCH  ' + $e.Dir + '   copy has ' + ([int64]$dstBytes) + ' bytes, source has ' + ([int64]$srcBytes) + ' bytes')
            }
        }

        # A3: copy ALL database files (any drive, including D:)
        Say ''
        Say 'Copying all database files into database-files\ ...' 'Cyan'
        foreach ($f in $dbFiles) {
            $srcDir = Split-Path -Path $f.Path -Parent
            $fileName = Split-Path -Path $f.Path -Leaf
            $targetDir = $script:OutDir + '\database-files\' + $f.Drive + $srcDir.Substring(2)
            $code = Invoke-Robo -Source $srcDir -Target $targetDir -Options @('/COPY:DAT', '/XJ') -FileName $fileName
            if ($code -ge 8) {
                Problem ('Could not copy ' + $f.Path + ' (robocopy code ' + $code + ').')
            }
        }

        # A4: verify sizes
        foreach ($f in $dbFiles) {
            $srcDirV = Split-Path -Path $f.Path -Parent
            $dirV = $script:OutDir + '\database-files\' + $f.Drive + $srcDirV.Substring(2)
            $expect = [System.IO.Path]::Combine($dirV, (Split-Path -Path $f.Path -Leaf))
            if (Test-Path -LiteralPath $expect) {
                $copied = Get-Item -LiteralPath $expect
                if ([int64]$copied.Length -eq [int64]$f.Size) {
                    [void]$VerifyResults.Add('OK             ' + $f.Path + '   ->   ' + $expect + '   (' + (MB $f.Size) + ' MB)')
                } else {
                    [void]$VerifyResults.Add('SIZE MISMATCH  ' + $f.Path + '   copy is ' + $copied.Length + ' bytes, original was ' + $f.Size + ' bytes')
                }
            } else {
                [void]$VerifyResults.Add('MISSING        ' + $f.Path + '   expected at ' + $expect)
            }
        }
        $badCount = @($VerifyResults | Where-Object { $_ -notlike 'OK*' }).Count
        Say ('Database files verified: ' + (@($VerifyResults).Count - $badCount) + ' OK, ' + $badCount + ' not OK. Details in verify.txt.')
    }
} catch {
    Problem ('Phase A stopped with an error: ' + $_.Exception.Message)
    $phaseAOk = $false
} finally {
    # A5: ALWAYS restart what was stopped, in REVERSE stop order (main engine first, then dependents)
    $restartOrder = @($StoppedServices)
    [array]::Reverse($restartOrder)
    foreach ($name in $restartOrder) {
        try {
            $svc2 = Get-Service -Name $name -ErrorAction Stop
            # If it is still shutting down, wait for it to finish stopping before starting it again.
            if ([string]$svc2.Status -eq 'StopPending') {
                Say ('Waiting for ' + $name + ' to finish stopping before restarting it...') 'Yellow'
                try { $svc2.WaitForStatus('Stopped', (New-TimeSpan -Seconds 300)) } catch { }
                $svc2.Refresh()
            }
            if ($svc2.Status -ne 'Running') { Start-Service -Name $name -ErrorAction Stop }
            try { $svc2.WaitForStatus('Running', (New-TimeSpan -Seconds 120)) } catch { }
            $svc3 = Get-Service -Name $name -ErrorAction Stop
            Say ('Service ' + $name + ' status now: ' + $svc3.Status)
            if ($svc3.Status -ne 'Running') { $allRestarted = $false }
        } catch {
            $allRestarted = $false
            Problem ('Could not restart ' + $name + ': ' + $_.Exception.Message + '. Start it from Services (services.msc) before opening POSBean.')
        }
    }
    $phaseAElapsed = (Get-Date) - $phaseAStart
    if ($allRestarted) {
        Show-Billing-Banner
    } else {
        Write-Host 'WARNING: a database service did not restart. Start it in Services before opening POSBean.' -ForegroundColor Red
    }
    Say ('Phase A took ' + [math]::Floor($phaseAElapsed.TotalMinutes) + ' min ' + $phaseAElapsed.Seconds + ' s.') 'Cyan'
}

$script:FallbackUsed = $false
$script:FallbackBakOk = 0
if (-not $phaseAOk) {
    # FALLBACK: the live database could not be paused. POSBean's own backup files (*.bak) are
    # complete, consistent copies and are NOT held open by SQL Server, so copy those instead,
    # then carry on with Phase B. Nothing is stopped here.
    Say ''
    Say 'The live database could not be paused, so it was NOT copied. Billing is running.' 'Yellow'
    Say 'Copying POSBean''s own backup files (*.bak) instead - these are full, clean copies of the database...' 'Cyan'
    $script:FallbackUsed = $true
    $VerifyResults.Clear()
    $bakFiles = @($dbFiles | Where-Object { $_.Path.ToLower().EndsWith('.bak') })
    foreach ($f in $bakFiles) {
        $srcDir = Split-Path -Path $f.Path -Parent
        $fileName = Split-Path -Path $f.Path -Leaf
        $targetDir = $script:OutDir + '\database-files\' + $f.Drive + $srcDir.Substring(2)
        $code = Invoke-Robo -Source $srcDir -Target $targetDir -Options @('/COPY:DAT', '/XJ') -FileName $fileName
        $expect = [System.IO.Path]::Combine($targetDir, $fileName)
        if ((Test-Path -LiteralPath $expect) -and ([int64](Get-Item -LiteralPath $expect).Length -eq [int64]$f.Size)) {
            $script:FallbackBakOk++
            [void]$VerifyResults.Add('OK             ' + $f.Path + '   ->   ' + $expect + '   (' + (MB $f.Size) + ' MB)')
        } else {
            [void]$VerifyResults.Add('NOT COPIED     ' + $f.Path + '   (robocopy code ' + $code + ')')
        }
    }
    Say ('Backup files copied and verified: ' + $script:FallbackBakOk + ' of ' + $bakFiles.Count) 'Cyan'
    Say 'Continuing with the rest of the copy (C: and D:). You can keep billing.' 'Cyan'
}

# ---------- PHASE B: POSBean may be running ----------

Say ''
Say '==================== PHASE B: copy the rest (POSBean may be running) ====================' 'Cyan'

# Whole-drive copies (external disk): locked Windows files are skipped fast and logged.
# Robocopy code 8-15 means some files were skipped. That is NORMAL here.
function Test-WholeCopy {
    param([int]$Code, [string]$What)
    if ($Code -lt 8) {
        Say ($What + ' - done (robocopy code ' + $Code + ', OK).') 'Green'
        return $true
    }
    if ($Code -lt 16) {
        Say ($What + ' - done. Some files were skipped (robocopy code ' + $Code + '). Skipped locked Windows files are NORMAL. Details are in copy-log.txt.') 'Yellow'
        return $true
    }
    Problem ($What + ' - the copy FAILED (robocopy code ' + $Code + '). Details are in copy-log.txt.')
    return $false
}

$skipSysFiles = @('pagefile.sys', 'hiberfil.sys', 'swapfile.sys')
$wholeExcFiles = @($LiveExcludeExt + $skipSysFiles)
$wholeExcDirs = @('$RECYCLE.BIN', 'System Volume Information', $ExportRoot, $script:OutDir)
foreach ($e in $EngineDirs) { $wholeExcDirs += $e.Dir }

if ($toExternal) {
    Say 'STEP 4 - Copy the WHOLE C: drive to C-drive\ (database files excluded: they are in database-files\)' 'Cyan'
    $code = Invoke-Robo -Source 'C:\' -Target (Join-Path $script:OutDir 'C-drive') -Options @('/E', '/COPY:DAT', '/DCOPY:T', '/XJ') -Retry '0' -ExcludeFiles $wholeExcFiles -ExcludeDirs $wholeExcDirs
    [void](Test-WholeCopy -Code $code -What 'C: whole-drive copy')

    Say ''
    Say 'STEP 5 - Copy the WHOLE D: drive to D-drive\ (database files excluded)' 'Cyan'
    if ($dDisk) {
        $code = Invoke-Robo -Source 'D:\' -Target (Join-Path $script:OutDir 'D-drive') -Options @('/E', '/COPY:DAT', '/DCOPY:T', '/XJ') -Retry '0' -ExcludeFiles $wholeExcFiles -ExcludeDirs $wholeExcDirs
        [void](Test-WholeCopy -Code $code -What 'D: whole-drive copy')
    } else {
        Say 'No D: drive on this PC. Skipping the D: copy.'
    }
} else {
    # Fallback (destination is C:\GokulExport): copying all of C: would copy the output into itself,
    # so only D:, the POSBean folder and Desktop/Documents are copied.
    Say 'STEP 4 - Copy the whole D: drive (database files excluded: they were live)' 'Cyan'
    if ($dDisk) {
        $dTarget = Join-Path $script:OutDir 'D-drive'
        $excDirs = @('$RECYCLE.BIN', 'System Volume Information', $ExportRoot, $script:OutDir)
        foreach ($e in $EngineDirs) { $excDirs += $e.Dir }
        $code = Invoke-Robo -Source 'D:\' -Target $dTarget -Options @('/E', '/COPY:DAT', '/DCOPY:T', '/XJ') -ExcludeFiles $LiveExcludeExt -ExcludeDirs $excDirs
        [void](Test-RoboCode -Code $code -What 'D: copy')
    } else {
        Say 'No D: drive on this PC. Skipping the D: copy.'
    }

    Say ''
    Say 'STEP 5 - Copy the POSBean program folder(s) and C: Desktop/Documents' 'Cyan'
    $pbIndex = 0
    foreach ($pf in $posbeanFolders) {
        $pbIndex++
        $leaf = Split-Path -Path $pf -Leaf
        $safeLeaf = $leaf -replace '[^A-Za-z0-9._-]', '_'
        $pbTarget = $script:OutDir + '\posbean-program\' + $pbIndex + '-' + $safeLeaf
        $pbExc = @($ExportRoot, $script:OutDir)
        foreach ($e in $EngineDirs) { $pbExc += $e.Dir }
        $code = Invoke-Robo -Source $pf -Target $pbTarget -Options @('/E', '/COPY:DAT', '/XJ') -ExcludeFiles $LiveExcludeExt -ExcludeDirs $pbExc
        [void](Test-RoboCode -Code $code -What ('POSBean program folder ' + $pf))
    }
    if ($posbeanFolders.Count -eq 0) {
        Say 'No POSBean program folder was found. If you know where it is, copy it by hand into posbean-program.' 'Yellow'
    }
    foreach ($uf in $userFolders) {
        $ufTarget = $script:OutDir + '\C-user-files\' + $uf.User + '\' + $uf.Sub
        $code = Invoke-Robo -Source $uf.Path -Target $ufTarget -Options @('/E', '/COPY:DAT', '/XJ') -ExcludeFiles $LiveExcludeExt
        [void](Test-RoboCode -Code $code -What ('C: ' + $uf.User + ' ' + $uf.Sub))
    }
    if ($userFolders.Count -eq 0) { Say 'No Desktop or Documents folders found under C:\Users.' }
}

# README in the backup folder
$readme = @(
    'README - read this first',
    '',
    'database-files\  holds the CLEAN copy of every database file (for example .mdf, .mdb, .bak).',
    '                 These were copied while POSBean was closed and the database services were stopped.',
    '                 Use these files to read the POSBean data.',
    '',
    'C-drive\, D-drive\, posbean-program\ and C-user-files\ do NOT contain database files, because those',
    'database files were live (possibly open) while POSBean could run. The clean copies are in database-files\.',
    'database-files\ is the important part.',
    '',
    'Locked Windows system files that were skipped during the copy are NORMAL. They are listed in copy-log.txt.',
    '',
    'verify.txt lists each database file copy as OK, MISSING or SIZE MISMATCH.',
    'run-log.txt and copy-log.txt hold the full record of the run.'
)
Set-Content -Path (Join-Path $script:OutDir 'README-in-backup.txt') -Value $readme -Encoding ASCII

# ---------- STEP 6: verify ----------

Say ''
Say 'STEP 6 - Verify' 'Cyan'
$allFiles = @(Get-ChildItem -LiteralPath $script:OutDir -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer })
$totalFiles = $allFiles.Count
$totalBytes = 0.0
foreach ($af in $allFiles) { $totalBytes += [double]$af.Length }

$cntOk = @($VerifyResults | Where-Object { $_ -like 'OK*' }).Count
$cntBad = @($VerifyResults | Where-Object { $_ -notlike 'OK*' }).Count + @($EngineVerify | Where-Object { $_ -notlike 'OK*' }).Count

$verifyLines = New-Object System.Collections.ArrayList
[void]$verifyLines.Add('VERIFY - ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
[void]$verifyLines.Add('')
[void]$verifyLines.Add('Database files (clean copies in database-files\):')
foreach ($v in $VerifyResults) { [void]$verifyLines.Add($v) }
[void]$verifyLines.Add('')
[void]$verifyLines.Add('Engine data directories (whole-directory copies, Phase A):')
if ($EngineVerify.Count -eq 0) { [void]$verifyLines.Add('  (none)') }
foreach ($v in $EngineVerify) { [void]$verifyLines.Add($v) }
[void]$verifyLines.Add('')
[void]$verifyLines.Add('Database files in inventory: ' + $dbFiles.Count + '   OK: ' + $cntOk + '   not OK: ' + $cntBad)
[void]$verifyLines.Add('Files in the backup folder: ' + $totalFiles + '   total size: ' + (GB $totalBytes) + ' GB')
Set-Content -Path (Join-Path $script:OutDir 'verify.txt') -Value $verifyLines -Encoding ASCII
Say ('Database files: ' + $dbFiles.Count + '   OK: ' + $cntOk + '   not OK: ' + $cntBad)
Say ('Backup folder now holds ' + $totalFiles + ' files, ' + (GB $totalBytes) + ' GB. Details in verify.txt.')
if ($cntBad -gt 0) {
    Problem ('Verify found ' + $cntBad + ' database file(s) not OK. See verify.txt.')
}

# ---------- STEP 7: zip (two zips, next to the folder) ----------

Say ''
Say 'STEP 6b - Export Windows settings (registry) - read only, nothing is changed' 'Cyan'
$regDir = Join-Path $script:OutDir 'registry'
try { New-Item -ItemType Directory -Path $regDir -Force | Out-Null } catch { }
$regKeys = @(
    @('HKLM\SOFTWARE', 'HKLM-SOFTWARE.reg'),
    @('HKCU\Software', 'HKCU-Software.reg'),
    @('HKLM\SYSTEM\CurrentControlSet\Services', 'HKLM-Services.reg')
)
foreach ($rk in $regKeys) {
    $outReg = Join-Path $regDir $rk[1]
    Say ('Exporting ' + $rk[0] + ' ...')
    & reg.exe export $rk[0] $outReg /y | Out-Host
    if (Test-Path -LiteralPath $outReg) { Say ('  saved ' + $rk[1] + ' (' + (MB (Get-Item -LiteralPath $outReg).Length) + ' MB)') 'Green' }
    else { Problem ('Registry export failed for ' + $rk[0]) }
}
try {
    Get-WmiObject -Class Win32_Service | Select-Object Name, DisplayName, State, StartMode, PathName | Out-File -FilePath (Join-Path $regDir 'services.txt') -Encoding ASCII -Width 400
} catch { }
try {
    $env:COMPUTERNAME | Out-File -FilePath (Join-Path $regDir 'computer-name.txt') -Encoding ASCII
    & ipconfig.exe /all | Out-File -FilePath (Join-Path $regDir 'network.txt') -Encoding ASCII
} catch { }

Say 'STEP 7 - Zip (only when the destination is C:\GokulExport)' 'Cyan'
if ($destIsExport) {
    $restItems = @()
    $topItems = @(Get-ChildItem -LiteralPath $script:OutDir -Force -ErrorAction SilentlyContinue)
    foreach ($ti in $topItems) {
        if ($DbZipItems -notcontains $ti.Name) { $restItems += $ti.Name }
    }
    $dbZipPath = $ExportRoot + '\' + $outName + '-DATABASE.zip'
    $restZipPath = $ExportRoot + '\' + $outName + '-REST.zip'
    Make-ZipPart -Label 'DATABASE' -ZipPath $dbZipPath -ItemNames $DbZipItems
    Make-ZipPart -Label 'REST' -ZipPath $restZipPath -ItemNames $restItems
} else {
    Say 'Zip skipped: the copy went to the external disk, so nothing is zipped there.' 'Cyan'
}

# ---------- STEP 8: summary ----------

Say ''
Say '==================== DONE ====================' 'Cyan'
Say ('Output folder: ' + $script:OutDir)
Say ('Clean database files copied and verified: ' + $cntOk + ' of ' + $dbFiles.Count)
Say ('Total: ' + $totalFiles + ' files, ' + (GB $totalBytes) + ' GB')
foreach ($zl in $script:ZipLines) { Say $zl 'Green' }
Say ''
Say 'Copy the DATABASE zip to a pen drive or upload it to Google Drive first. The REST zip is optional.' 'Yellow'
if ($Problems.Count -eq 0) {
    Say 'Failures: none.' 'Green'
} else {
    Say ('Failures or warnings (' + $Problems.Count + '):') 'Yellow'
    foreach ($pb in $Problems) { Say ('  - ' + $pb) 'Yellow' }
}
Say ''
Say ('Nothing on this computer was deleted, formatted or changed except the new folder ' + $script:OutDir + '.') 'Green'
Write-Host ''
$bar = ''.PadRight(66, '#')
if ($script:FallbackUsed) {
    if ($script:FallbackBakOk -gt 0) {
        Write-Host $bar -ForegroundColor Yellow
        Write-Host '#   JOB DONE (USING POSBEAN BACKUP FILES).  YOU CAN CLOSE THIS.   #' -ForegroundColor Yellow
        Write-Host '#   The live database was busy, but POSBean''s own full backups   #' -ForegroundColor Yellow
        Write-Host '#   (.bak) were copied. Eject the disk and bring it back.        #' -ForegroundColor Yellow
        Write-Host $bar -ForegroundColor Yellow
        try { Add-Content -Path $script:LogFile -Value 'JOB DONE USING BAK BACKUPS (live DB not paused).' -Encoding ASCII } catch { }
    } else {
        Write-Host $bar -ForegroundColor Red
        Write-Host '#   JOB NOT COMPLETE - no database copy was made.                #' -ForegroundColor Red
        Write-Host '#   Take a PHOTO of this screen and send it before closing.      #' -ForegroundColor Red
        Write-Host $bar -ForegroundColor Red
        try { Add-Content -Path $script:LogFile -Value 'JOB NOT COMPLETE (no database copy).' -Encoding ASCII } catch { }
    }
} elseif ($cntBad -eq 0 -and $cntOk -eq $dbFiles.Count) {
    Write-Host $bar -ForegroundColor Green
    Write-Host '#                                                                #' -ForegroundColor Green
    Write-Host '#        JOB COMPLETE - ALL DATA COPIED.  YOU CAN CLOSE THIS.     #' -ForegroundColor Green
    Write-Host '#        Eject the disk and bring it back.                       #' -ForegroundColor Green
    Write-Host '#                                                                #' -ForegroundColor Green
    Write-Host $bar -ForegroundColor Green
    try { Add-Content -Path $script:LogFile -Value 'JOB COMPLETE - ALL DATA COPIED.' -Encoding ASCII } catch { }
} else {
    Write-Host $bar -ForegroundColor Red
    Write-Host '#   JOB NOT COMPLETE - some database files did not copy.         #' -ForegroundColor Red
    Write-Host '#   Take a PHOTO of this screen and send it before closing.      #' -ForegroundColor Red
    Write-Host $bar -ForegroundColor Red
    try { Add-Content -Path $script:LogFile -Value 'JOB NOT COMPLETE.' -Encoding ASCII } catch { }
}
exit 0
