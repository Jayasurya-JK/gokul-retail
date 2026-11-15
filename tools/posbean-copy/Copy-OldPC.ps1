# Copy-OldPC.ps1
# Gokul Retail - copies the old POSBean PC's data onto a NEW disk so the POSBean
# data can be read later. Run it FROM the new disk (copy this folder onto it first).
#
# TWO PHASES, to keep billing downtime short:
#   Phase A (POSBean closed, a few minutes): stop the database services cleanly,
#     copy every database file found in the inventory into
#     <backup>\database-files\<drive>\<original path>, verify sizes, restart services.
#   Phase B (POSBean may be running again): copy the whole D: drive, the POSBean
#     program folder and the C: user Desktop/Documents folders. Database files are
#     EXCLUDED from these copies (they were live); the clean copies are in database-files.
#
# SAFETY RULES (do not change these):
#  - Writes only inside ONE new folder on the new disk: <Dest>:\OldPC-Backup-<yyyyMMdd-HHmm>\
#  - Never formats, never deletes, never mirrors, never uses robocopy /MIR or /PURGE.
#  - Never writes to C: or D:. Never opens database contents (names, sizes, dates only).
#  - Never uses -Force on Stop-Service and never kills POSBean. The user closes it.
#  - Refuses C: and D: as the destination.
#
# Usage:
#   Copy-OldPC.ps1                                    normal run (Copy-OldPC.bat runs this)
#   Copy-OldPC.ps1 -WhatIf                            inventory and plan only; no prompts, no stopping, no copying
#   Copy-OldPC.ps1 -WhatIf -WhatIfFolder <folder> -DestDrive E
#
# Works on Windows PowerShell 4.0 (Windows 8.1 and 10).

param(
    [switch]$WhatIf,
    [string]$WhatIfFolder = (Join-Path $env:TEMP 'posbean-whatif'),
    [string]$DestDrive = ''
)

$ErrorActionPreference = 'Continue'

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

$script:LogFile = $null
$script:CopyLog = $null
$script:OutDir = $null
$script:Buffer = New-Object System.Collections.ArrayList
$script:Inv = New-Object System.Collections.ArrayList
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
    return @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' | Sort-Object DeviceID)
}

function Get-FolderBytes {
    param([string]$Path)
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    if ($m.Sum) { return [double]$m.Sum }
    return 0.0
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
            foreach ($sub in @(Get-ChildItem -LiteralPath 'C:\ProgramData\MySQL' -Directory -ErrorAction SilentlyContinue)) {
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

# Checks a drive letter for use as the destination. Returns Ok, Disk and Message.
function Get-DestCheck {
    param([string]$Letter, $Disks, [double]$NeededFree)
    $result = [PSCustomObject]@{ Ok = $false; Disk = $null; Message = '' }
    $id = $Letter.Trim().ToUpper().TrimEnd(':') + ':'
    if ($id -eq 'C:' -or $id -eq 'D:') {
        $result.Message = ('Refused. ' + $id + ' is one of the old PC''s own drives. The copy needs the NEW disk.')
        return $result
    }
    $pick = $Disks | Where-Object { $_.DeviceID -eq $id } | Select-Object -First 1
    if (-not $pick) {
        $result.Message = ('No drive ' + $id + ' was found.')
        return $result
    }
    if (-not $pick.Size -or [double]$pick.Size -le 0) {
        $result.Message = ('Refused. ' + $id + ' is not ready (no size reported).')
        return $result
    }
    if ([double]$pick.FreeSpace -lt $NeededFree) {
        $result.Message = ('Refused. ' + $id + ' has ' + (GB $pick.FreeSpace) + ' GB free but needs at least ' + (GB $NeededFree) + ' GB free.')
        return $result
    }
    $result.Ok = $true
    $result.Disk = $pick
    $result.Message = 'OK'
    return $result
}

function Select-Destination {
    param($Disks, [double]$NeededFree)
    while ($true) {
        Say ''
        Say 'Drives on this computer:' 'Cyan'
        foreach ($d in $Disks) {
            $kind = 'fixed'
            if ([int]$d.DriveType -eq 2) { $kind = 'removable / USB' }
            $label = [string]$d.VolumeName
            if ($label -eq '') { $label = '(no label)' }
            Say ('  ' + $d.DeviceID + '  "' + $label + '"  size ' + (GB $d.Size) + ' GB  free ' + (GB $d.FreeSpace) + ' GB  ' + $kind)
        }
        $typed = ([string](Read-Host 'Type the letter of the NEW disk (for example E), or press Enter to cancel')).Trim()
        if ($typed -eq '') { return $null }
        $check = Get-DestCheck -Letter $typed -Disks $Disks -NeededFree $NeededFree
        if ($check.Ok) { return $check.Disk }
        Say $check.Message 'Yellow'
    }
}

# Finds database-like files under one drive. Skips the Windows folder, WinSxS and junctions.
function Find-DbFiles {
    param([string]$Root)
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
                    [void]$results.Add([PSCustomObject]@{
                        Drive = $letter
                        Path = $f
                        Size = [int64]$fi.Length
                        LastWrite = $fi.LastWriteTime
                    })
                } catch { }
            }
        }
        try { $subs = [System.IO.Directory]::GetDirectories($dir) } catch { $subs = @() }
        foreach ($s in $subs) {
            $s2 = $s.TrimEnd('\')
            if ($s2 -ieq $winDir) { continue }
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
        [string[]]$ExcludeDirs = @()
    )
    $list = New-Object System.Collections.ArrayList
    [void]$list.Add($Source)
    [void]$list.Add($Target)
    if ($FileName -ne '') { [void]$list.Add($FileName) }
    foreach ($o in $Options) { [void]$list.Add($o) }
    [void]$list.Add('/R:1')
    [void]$list.Add('/W:1')
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
    Write-Host ''
    Write-Host '##################################################################' -ForegroundColor Green
    Write-Host '#                                                                #' -ForegroundColor Green
    Write-Host '#     BILLING CAN START AGAIN NOW. You can open POSBean.         #' -ForegroundColor Green
    Write-Host '#                                                                #' -ForegroundColor Green
    Write-Host '##################################################################' -ForegroundColor Green
    Write-Host ''
    $script:Buffer.Clear()
    if ($script:LogFile) {
        try { Add-Content -Path $script:LogFile -Value ((Get-Date -Format 'HH:mm:ss') + '  BILLING CAN START AGAIN NOW. You can open POSBean.') -Encoding ASCII } catch { }
    }
}

# ---------- start ----------

Say '=============================================================='
if ($WhatIf) {
    Say 'Gokul Retail - copy the old POSBean PC   [WHAT-IF MODE: plan only]'
} else {
    Say 'Gokul Retail - copy the old POSBean PC to a new disk (two phases)'
}
Say '=============================================================='

$isAdmin = Test-Admin
if (-not $isAdmin) {
    if (-not $WhatIf) {
        Write-Host 'This must run as Administrator. Double-click Copy-OldPC.bat instead.' -ForegroundColor Red
        exit 1
    }
    Say 'Note: not running as Administrator. Some folders may be skipped in this preview.' 'Yellow'
}

$disks = Get-Disks
$dDisk = $disks | Where-Object { $_.DeviceID -eq 'D:' } | Select-Object -First 1
$dUsed = 0.0
$neededFree = 0.0
if ($dDisk) {
    $dUsed = [double]($dDisk.Size - $dDisk.FreeSpace)
    $neededFree = $dUsed * 1.2
}

# ---------- STEP 1: destination (default = the drive this script runs from) ----------

Say ''
Say 'STEP 1 of 8 - Choose the NEW disk' 'Cyan'
if ($dDisk) {
    Say ('The old PC D: drive uses ' + (GB $dUsed) + ' GB, so the new disk needs at least ' + (GB $neededFree) + ' GB free (D: used space plus 20%).')
} else {
    Say 'There is no D: drive on this PC. Only C: and the database files will be copied.'
}

$scriptDrive = Split-Path -Qualifier $PSScriptRoot
Say ('This script is running from ' + $scriptDrive + ' (the new disk is expected to be this drive).')

$dest = $null
$destLetter = ''
if ($WhatIf) {
    if ($DestDrive -ne '') {
        $check = Get-DestCheck -Letter $DestDrive -Disks $disks -NeededFree $neededFree
        if ($check.Ok) {
            $dest = $check.Disk
            Say ('WhatIf: using ' + $dest.DeviceID + ' as the destination for the plan (nothing is written there).')
        } else {
            Say ('WhatIf: ' + $check.Message) 'Yellow'
        }
    } else {
        $checkScript = Get-DestCheck -Letter $scriptDrive -Disks $disks -NeededFree $neededFree
        if ($checkScript.Ok) {
            $dest = $checkScript.Disk
            Say ('WhatIf: the real run would use ' + $dest.DeviceID + ' (the script''s own drive) after a YES.')
        } else {
            Say ('WhatIf: ' + $checkScript.Message + ' The real run would ask for a letter.') 'Yellow'
        }
    }
} else {
    $checkScript = Get-DestCheck -Letter $scriptDrive -Disks $disks -NeededFree $neededFree
    if ($checkScript.Ok) {
        $dest = $checkScript.Disk
        Say ('The script is on ' + $dest.DeviceID + ', which is a suitable new disk.') 'Green'
    } else {
        Say ($checkScript.Message) 'Yellow'
        Say 'Type the letter of the NEW disk instead.' 'Yellow'
        $dest = Select-Destination -Disks $disks -NeededFree $neededFree
        if (-not $dest) {
            Say 'Cancelled. Nothing was changed.'
            exit 0
        }
    }
    $destLabel = [string]$dest.VolumeName
    if ($destLabel -eq '') { $destLabel = '(no label)' }
    Say ''
    Say ('Destination: ' + $dest.DeviceID + '  label "' + $destLabel + '"  size ' + (GB $dest.Size) + ' GB  free ' + (GB $dest.FreeSpace) + ' GB') 'Cyan'
    $yes = ([string](Read-Host ('Copy to this disk (' + $dest.DeviceID + ')? Type YES to continue'))).Trim()
    if ($yes -cne 'YES') {
        Say 'Not confirmed with YES. Nothing was changed.'
        exit 0
    }
}
if ($dest) { $destLetter = $dest.DeviceID.Substring(0, 1) }

# Output folder: the only folder this script creates.
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if ($WhatIf) {
    if (-not (Test-Path -LiteralPath $WhatIfFolder)) {
        New-Item -ItemType Directory -Path $WhatIfFolder -Force | Out-Null
    }
    $script:OutDir = $WhatIfFolder
    if ($dest) {
        $plannedBackup = $dest.DeviceID + '\OldPC-Backup-' + $stamp
    } else {
        $plannedBackup = '<NEW DISK>:\OldPC-Backup-' + $stamp
    }
} else {
    $root = $dest.DeviceID + '\OldPC-Backup-' + $stamp
    if (Test-Path -LiteralPath $root) {
        $root = $dest.DeviceID + '\OldPC-Backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    }
    New-Item -ItemType Directory -Path $root | Out-Null
    $script:OutDir = $root
    $plannedBackup = $root
}

$script:LogFile = Join-Path $script:OutDir 'run-log.txt'
$script:CopyLog = Join-Path $script:OutDir 'copy-log.txt'
foreach ($early in $script:Buffer) {
    try { Add-Content -Path $script:LogFile -Value $early -Encoding ASCII } catch { }
}
$script:Buffer.Clear()
Say ('Backup folder: ' + $plannedBackup)
Say ('Log file: ' + (Join-Path $script:OutDir 'run-log.txt'))

# ---------- STEP 2: inventory (read only) ----------

Say ''
Say 'STEP 2 of 8 - Inventory (reading only, nothing is changed)' 'Cyan'

$os = Get-CimInstance -ClassName Win32_OperatingSystem
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
        [void]$programs.Add([PSCustomObject]@{
            Name = [string]$p.DisplayName
            Version = [string]$p.DisplayVersion
            Publisher = [string]$p.Publisher
            Folder = $folder
        })
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
    foreach ($dir in @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $PosBeanRegex })) {
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

$services = @(Get-CimInstance -ClassName Win32_Service | Where-Object { $_.Name -match $ServiceRegex -or $_.DisplayName -match $ServiceRegex })
Add-Inv ''
Add-Inv 'DATABASE SERVICES (SQL, Firebird, MySQL)'
if ($services.Count -eq 0) { Add-Inv '  (none found)' }
foreach ($s in $services) {
    Add-Inv ('  ' + $s.Name + '  |  ' + $s.DisplayName + '  |  status: ' + $s.State + '  |  start mode: ' + $s.StartMode)
}

$dbFiles = New-Object System.Collections.ArrayList
foreach ($d in $disks) {
    if ([int]$d.DriveType -ne 3) { continue }
    Say ('Searching ' + $d.DeviceID + ' for database files (names only, nothing is opened)...')
    foreach ($f in @(Find-DbFiles -Root $d.DeviceID)) { [void]$dbFiles.Add($f) }
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
    if ($edir -ne '') { [void]$EngineDirs.Add([PSCustomObject]@{ Service = $s.Name; Dir = $edir }) }
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

$inventoryPath = Join-Path $script:OutDir 'inventory.txt'
Set-Content -Path $inventoryPath -Value $script:Inv -Encoding ASCII

$dbBytes = 0.0
foreach ($f in $dbFiles) { $dbBytes += [double]$f.Size }

$posBytes = 0.0
foreach ($pf in $posbeanFolders) { $posBytes += (Get-FolderBytes -Path $pf) }

$userFolders = New-Object System.Collections.ArrayList
$userBytes = 0.0
if (Test-Path -LiteralPath 'C:\Users') {
    foreach ($u in @(Get-ChildItem -LiteralPath 'C:\Users' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^(Public|Default|Default User|All Users|defaultuser0)$' })) {
        foreach ($sub in @('Desktop', 'Documents')) {
            $p = Join-Path $u.FullName $sub
            $pExists = $false
            try { $pExists = Test-Path -LiteralPath $p -ErrorAction Stop } catch { $pExists = $false }
            if ($pExists) {
                [void]$userFolders.Add([PSCustomObject]@{ User = $u.Name; Sub = $sub; Path = $p })
                $userBytes += (Get-FolderBytes -Path $p)
            }
        }
    }
}

$dUsedBytes = 0.0
if ($dDisk) { $dUsedBytes = $dUsed }
$neededTotal = ($dUsedBytes * 1.2) + $dbBytes + $posBytes + $userBytes

Say ('Inventory written: ' + $inventoryPath) 'Green'
Say ('Programs matched: ' + $programs.Count + '   Database services: ' + $services.Count + '   Database-like files: ' + $dbFiles.Count + '   POSBean folders: ' + $posbeanFolders.Count)
Say ('Database files total: ' + (GB $dbBytes) + ' GB.   POSBean folder: ' + (GB $posBytes) + ' GB.   C: Desktop/Documents: ' + (GB $userBytes) + ' GB.')
Say ('Space needed on the new disk (estimate): ' + (GB $neededTotal) + ' GB')

# Time estimates (you cannot tell USB 2 from USB 3, so both are shown)
Say ''
Say 'TIME ESTIMATE' 'Cyan'
Say ('Phase A (POSBean closed) copies only the database files: ' + (GB $dbBytes) + ' GB.')
Say ('   at 30 MB/s (USB 2): about ' + (Get-MinText -Bytes $dbBytes -MBps 30) + '   at 100 MB/s (USB 3): about ' + (Get-MinText -Bytes $dbBytes -MBps 100))
Say ('Phase B (POSBean may run) copies the D: drive, POSBean folder and Desktop/Documents: about ' + (GB ($dUsedBytes + $posBytes + $userBytes)) + ' GB.')
Say ('   at 30 MB/s (USB 2): about ' + (Get-MinText -Bytes ($dUsedBytes + $posBytes + $userBytes) -MBps 30) + '   at 100 MB/s (USB 3): about ' + (Get-MinText -Bytes ($dUsedBytes + $posBytes + $userBytes) -MBps 100))

# (the stop plan and engine directories were built in the inventory step above)

# ---------- WHAT-IF: print the plan and stop here ----------

if ($WhatIf) {
    Say ''
    Say '==================== WHAT-IF PLAN ====================' 'Cyan'
    Say 'Nothing below is done in WhatIf mode. No prompts, no services stopped, nothing copied.'
    Say ''
    if ($dest) {
        $fitText = 'OK'
        if ([double]$dest.FreeSpace -lt $neededTotal) { $fitText = 'NOT ENOUGH SPACE' }
        Say ('Destination: ' + $dest.DeviceID + '  free ' + (GB $dest.FreeSpace) + ' GB  needs about ' + (GB $neededTotal) + ' GB  -> ' + $fitText)
    } else {
        Say ('Destination: you would type the new disk letter. Space needed: about ' + (GB $neededTotal) + ' GB.')
    }
    Say ('Backup folder that would be created: ' + $plannedBackup)
    Say ''
    Say '1. Destination: default is the script''s own drive; C: and D: refused; YES required.'
    Say ('2. Inventory: written to ' + $inventoryPath + ' (done).')
    Say '3. PHASE A (POSBean closed):'
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
    Say ('     - Copy ALL ' + $dbFiles.Count + ' database file(s), ' + (GB $dbBytes) + ' GB, into ' + $plannedBackup + '\database-files\<drive>\<original path>, then verify sizes.')
    Say '     - Restart the services in a finally block, then print: BILLING CAN START AGAIN NOW.'
    Say '4. PHASE B (POSBean may run again):'
    if ($dDisk) {
        Say ('     - Copy the whole D: drive to ' + $plannedBackup + '\D-drive, excluding database file extensions and engine data directories.')
    } else {
        Say '     - No D: drive on this PC: skipped.'
    }
    Say ('     - Copy POSBean program folder(s) to ' + $plannedBackup + '\posbean-program\, excluding database file extensions:')
    if ($posbeanFolders.Count -eq 0) { Say '          (none found)' }
    foreach ($pf in $posbeanFolders) { Say ('          - ' + $pf) }
    Say ('     - Copy C: user Desktop and Documents to ' + $plannedBackup + '\C-user-files\:')
    if ($userFolders.Count -eq 0) { Say '          (none found)' }
    foreach ($uf in $userFolders) { Say ('          - ' + $uf.Path) }
    Say ('5. Write README-in-backup.txt explaining that database-files holds the clean copy.')
    Say '6. Verify: verify.txt lists OK / MISSING / SIZE MISMATCH per database file.'
    Say '7. Summary printed. Bring this disk back. Nothing on this computer was changed.'
    Say ''
    Say 'WhatIf finished. Nothing was stopped and nothing was copied.' 'Green'
    exit 0
}

# ---------- Space check before anything is stopped ----------

if ([double]$dest.FreeSpace -lt $neededTotal) {
    Problem ('The new disk has ' + (GB $dest.FreeSpace) + ' GB free but about ' + (GB $neededTotal) + ' GB is needed. Use a bigger disk. Nothing was stopped or copied.')
    Say 'Stopped before copying. Nothing on this computer was changed.' 'Yellow'
    exit 1
}

# ---------- PHASE A: POSBean closed, database files ----------

Say ''
Say '==================== PHASE A: billing stop (keep it short) ====================' 'Cyan'
$phaseAStart = Get-Date
$phaseAOk = $true
$allRestarted = $true

try {
    # A1: POSBean must be closed by the user. Never killed.
    $pbNow = Get-PosBeanProcs
    while ($pbNow.Count -gt 0) {
        Say 'POSBean is still open. Please close POSBean normally (File, Exit, or the window close button).' 'Yellow'
        [void](Read-Host 'Close POSBean, then type DONE and press Enter')
        $pbNow = Get-PosBeanProcs
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
                [void]$EngineVerify.Add('OK             ' + $e.Dir + '   ->   ' + $edTarget + '   (' + (MB $srcBytes) + ' MB, ' + $dstBytes + ' bytes)')
            } else {
                [void]$EngineVerify.Add('SIZE MISMATCH  ' + $e.Dir + '   copy has ' + $dstBytes + ' bytes, source has ' + $srcBytes + ' bytes')
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
    # A5: ALWAYS restart what was stopped
    # Restart in REVERSE stop order: the main engine first, then its dependents
    $restartOrder = @($StoppedServices)
    [array]::Reverse($restartOrder)
    foreach ($name in $restartOrder) {
        try {
            $svc2 = Get-Service -Name $name -ErrorAction Stop
            if ($svc2.Status -ne 'Running') { Start-Service -Name $name -ErrorAction Stop }
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

if (-not $phaseAOk) {
    Say ''
    Say 'Phase A did not finish. Phase B was NOT started. Billing has been restarted.' 'Red'
    Say ('Partial files, if any, are in ' + $script:OutDir + '. Check run-log.txt.') 'Yellow'
    exit 1
}

# ---------- PHASE B: POSBean may be running ----------

Say ''
Say '==================== PHASE B: copy the rest (POSBean may be running) ====================' 'Cyan'

Say 'STEP 4 of 8 - Copy the whole D: drive (database files excluded: they were live)' 'Cyan'
if ($dDisk) {
    $dTarget = Join-Path $script:OutDir 'D-drive'
    $excDirs = @('$RECYCLE.BIN', 'System Volume Information')
    foreach ($e in $EngineDirs) { $excDirs += $e.Dir }
    $code = Invoke-Robo -Source 'D:\' -Target $dTarget -Options @('/E', '/COPY:DAT', '/DCOPY:T', '/XJ') -ExcludeFiles $LiveExcludeExt -ExcludeDirs $excDirs
    [void](Test-RoboCode -Code $code -What 'D: copy')
} else {
    Say 'No D: drive on this PC. Skipping the D: copy.'
}

Say ''
Say 'STEP 5 of 8 - Copy the POSBean program folder(s) and C: Desktop/Documents' 'Cyan'
$pbIndex = 0
foreach ($pf in $posbeanFolders) {
    $pbIndex++
    $leaf = Split-Path -Path $pf -Leaf
    $safeLeaf = $leaf -replace '[^A-Za-z0-9._-]', '_'
    $pbTarget = $script:OutDir + '\posbean-program\' + $pbIndex + '-' + $safeLeaf
    $pbExc = @()
    foreach ($e in $EngineDirs) { $pbExc += $e.Dir }
    $code = Invoke-Robo -Source $pf -Target $pbTarget -Options @('/E', '/COPY:DAT', '/XJ') -ExcludeFiles $LiveExcludeExt -ExcludeDirs $pbExc
    [void](Test-RoboCode -Code $code -What ('POSBean program folder ' + $pf))
}
if ($posbeanFolders.Count -eq 0) {
    Say 'No POSBean program folder was found. If you know where it is, copy it by hand into posbean-program.' 'Yellow'
}
foreach ($uf in $userFolders) {
    $ufTarget = $script:OutDir + '\C-user-files\' + $uf.User + '\' + $uf.Sub
    $code = Invoke-Robo -Source $uf.Path -Target $ufTarget -Options @('/E', '/COPY:DAT', '/XJ')
    [void](Test-RoboCode -Code $code -What ('C: ' + $uf.User + ' ' + $uf.Sub))
}
if ($userFolders.Count -eq 0) { Say 'No Desktop or Documents folders found under C:\Users.' }

# README in the backup folder
$readme = @(
    'README - read this first',
    '',
    'database-files\  holds the CLEAN copy of every database file (for example .mdf, .mdb, .bak).',
    '                 These were copied while POSBean was closed and the database services were stopped.',
    '                 Use these files to read the POSBean data.',
    '',
    'D-drive\, posbean-program\ and C-user-files\ do NOT contain database files, because those',
    'database files were live (possibly open) while POSBean could run. The clean copies are in database-files\.',
    '',
    'verify.txt lists each database file copy as OK, MISSING or SIZE MISMATCH.',
    'run-log.txt and copy-log.txt hold the full record of the run.'
)
Set-Content -Path (Join-Path $script:OutDir 'README-in-backup.txt') -Value $readme -Encoding ASCII

# ---------- STEP 6 (verify) and STEP 7 ----------

Say ''
Say 'STEP 7 of 8 - Verify' 'Cyan'
$all = Get-ChildItem -LiteralPath $script:OutDir -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
$totalFiles = [int]$all.Count
$totalBytes = 0.0
if ($all.Sum) { $totalBytes = [double]$all.Sum }

$cntOk = @($VerifyResults | Where-Object { $_ -like 'OK*' }).Count
$cntBad = @($VerifyResults).Count - $cntOk + @($EngineVerify | Where-Object { $_ -notlike 'OK*' }).Count

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

# ---------- STEP 8: summary ----------

Say ''
Say '==================== DONE ====================' 'Cyan'
Say ('Backup folder: ' + $script:OutDir)
Say ('Clean database files copied and verified: ' + $cntOk + ' of ' + $dbFiles.Count)
Say ('Total: ' + $totalFiles + ' files, ' + (GB $totalBytes) + ' GB')
if ($Problems.Count -eq 0) {
    Say 'Failures: none.' 'Green'
} else {
    Say ('Failures or warnings (' + $Problems.Count + '):') 'Yellow'
    foreach ($pb in $Problems) { Say ('  - ' + $pb) 'Yellow' }
}
Say ''
Say 'Bring this disk back. Nothing on this computer was changed.' 'Green'
exit 0
