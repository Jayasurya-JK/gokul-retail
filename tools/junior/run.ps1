# Runs the "junior developer" (Claude Code CLI on DeepSeek, headless) against one task file.
#
# Example:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\junior\run.ps1 -Task tools\junior\tasks\selftest.md -Model flash -MaxTurns 5
#
# Never commits or pushes. The API key is read from the User environment and is never printed.
# Env vars are set inside this script's own process only, so the caller's shell is unaffected.

param(
    [Parameter(Mandatory = $true)][string]$Task,
    [ValidateSet('pro', 'flash')][string]$Model = 'pro',
    [int]$MaxTurns = 120
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
try { Start-Process -WindowStyle Hidden -FilePath powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $repoRoot 'tools\team-room\open-team-room.ps1')) } catch {}

# --- Task file (resolved before changing directory, so relative paths work from the caller's folder)
if (-not (Test-Path -LiteralPath $Task -PathType Leaf)) { throw "Task file not found: $Task" }
$taskPath = (Resolve-Path -LiteralPath $Task).Path
$taskName = [IO.Path]::GetFileNameWithoutExtension($taskPath)
Set-Location -LiteralPath $repoRoot
$taskText = [IO.File]::ReadAllText($taskPath, [Text.Encoding]::UTF8)

# --- Branch guard: only wip/* branches, never main or fresh-start -----------
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'git rev-parse failed. Is this the repo?' }
if ($branch -eq 'main' -or $branch -like '*fresh-start*' -or $branch -notlike 'wip/*') {
    throw "Refusing to run on branch '$branch'. The junior only runs on a wip/* branch."
}

$headBefore = (& git rev-parse HEAD).Trim()

# --- Model and DeepSeek environment (child-process scope only) --------------
$modelId = if ($Model -eq 'pro') { 'deepseek-v4-pro' } else { 'deepseek-flash' }

$apiKey = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'DEEPSEEK_API_KEY is not set in the User environment.' }

$env:ANTHROPIC_BASE_URL                       = 'https://api.deepseek.com/anthropic'
$env:ANTHROPIC_AUTH_TOKEN                     = $apiKey
$env:ANTHROPIC_MODEL                          = $modelId
$env:ANTHROPIC_SMALL_FAST_MODEL               = 'deepseek-flash'
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
# deepseek-flash is not in the CLI's model table, so it would assume a 200k window. DeepSeek documents 1M for it.
$env:CLAUDE_CODE_MAX_CONTEXT_TOKENS           = '1000000'
# Keep user-level plugins' MCP servers and bundled skills out of the junior's context.
$env:CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS      = '1'
$env:CLAUDE_CODE_DISABLE_BUNDLED_SKILLS       = '1'
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$apiKey = $null

# --- Logs --------------------------------------------------------------------
$logDir      = Join-Path $scriptDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp       = Get-Date -Format 'yyyyMMdd-HHmmss'
$base        = "$taskName-$stamp"
$logPath     = Join-Path $logDir "$base.jsonl"
$errPath     = Join-Path $logDir "$base.stderr.txt"
$summaryPath = Join-Path $logDir "$base-summary.md"
$settingsPath = Join-Path $scriptDir 'settings.json'

$prompt = "You are the JUNIOR developer. Follow CLAUDE.md and the task file exactly. Task file: $taskPath. Read it first.`n`n" + `
    "Prefer Grep/Glob/Read with offset/limit; never read whole large files (>400 lines) at once; keep tool outputs short (pipe through head). Do not use cd: the working directory is already the repo root, so run plain commands such as grep -n ... file | head -40.`n`n" + $taskText

$lines     = New-Object System.Collections.Generic.List[string]
$exitCode  = -1
$startTime = Get-Date
$writer    = New-Object IO.StreamWriter($logPath, $false, (New-Object Text.UTF8Encoding($false)))
$writer.AutoFlush = $true

Write-Host "Junior run: task=$taskName model=$modelId maxTurns=$MaxTurns branch=$branch"
Write-Host "Log: $logPath"

try {
    # Prompt goes through stdin: avoids cmd.exe quoting problems with a multi-line prompt.
    # Stderr goes to its own file; native stderr is not allowed to abort the script here.
    $ErrorActionPreference = 'Continue'
    $prompt | & claude -p `
        --model $modelId `
        --max-turns $MaxTurns `
        --permission-mode acceptEdits `
        --permission-prompts none `
        --settings $settingsPath `
        --setting-sources 'project,local' `
        --strict-mcp-config `
        --mcp-config (Join-Path $scriptDir 'empty-mcp.json') `
        --output-format stream-json `
        --verbose `
        2> $errPath | ForEach-Object {
            $line = [string]$_
            $lines.Add($line)
            $writer.WriteLine($line)
            try {
                $evt = $line | ConvertFrom-Json
                if ($evt.type -eq 'assistant' -and $evt.message.content) {
                    foreach ($block in $evt.message.content) {
                        if ($block.type -eq 'tool_use') { Write-Host "  tool: $($block.name)" }
                    }
                }
            } catch { }
        }
    $exitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = 'Stop'
    $writer.Dispose()
    $endTime = Get-Date

    # --- Summary -------------------------------------------------------------
    $resultEvt = $null
    $assistantTurns = 0
    $denials = New-Object System.Collections.Generic.List[string]
    foreach ($l in $lines) {
        try { $e = $l | ConvertFrom-Json } catch { continue }
        if ($e.type -eq 'assistant') { $assistantTurns++ }
        if ($e.type -eq 'result') { $resultEvt = $e }
        if ($e.type -eq 'user' -and $e.message.content) {
            foreach ($block in $e.message.content) {
                if ($block.type -eq 'tool_result' -and $block.is_error) {
                    $txt = [string]$block.content
                    if ($txt.Length -gt 200) { $txt = $txt.Substring(0, 200) + '...' }
                    $denials.Add("- tool error: $txt")
                }
            }
        }
    }

    $resultText = if ($resultEvt) { [string]$resultEvt.result } else { '(no result event: run did not finish cleanly)' }
    $numTurns   = if ($resultEvt -and $resultEvt.num_turns -ne $null) { $resultEvt.num_turns } else { $assistantTurns }
    $subtype    = if ($resultEvt) { $resultEvt.subtype } else { 'none' }
    $isError    = if ($resultEvt) { $resultEvt.is_error } else { 'n/a' }

    if ($resultEvt -and $resultEvt.permission_denials) {
        foreach ($d in $resultEvt.permission_denials) {
            $inp = [string](($d.tool_input | ConvertTo-Json -Compress -Depth 4))
            if ($inp.Length -gt 200) { $inp = $inp.Substring(0, 200) + '...' }
            $denials.Insert(0, "- DENIED $($d.tool_name): $inp")
        }
    }
    $denialText = if ($denials.Count -gt 0) { ($denials -join "`n") } else { '(none)' }

    $statusText    = (& git status --short | Out-String).Trim()
    if (-not $statusText) { $statusText = '(clean)' }
    $diffStat      = (& git diff --stat $headBefore | Out-String).Trim()
    if (-not $diffStat) { $diffStat = '(no tracked changes vs recorded HEAD)' }
    $headAfter     = (& git rev-parse HEAD).Trim()
    $headNote      = if ($headAfter -ne $headBefore) { "WARNING: HEAD moved from $headBefore to $headAfter during the run. Review it." } else { 'HEAD unchanged.' }

    $taskRel = $taskPath
    if ($taskPath.StartsWith($repoRoot)) { $taskRel = $taskPath.Substring($repoRoot.Length).TrimStart('\') }

    $summary = @"
# Junior run summary: $taskName

- Task: $taskRel
- Model: $modelId (-Model $Model)
- Max turns: $MaxTurns
- Branch: $branch
- Start: $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))
- End: $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))
- Exit code: $exitCode
- Result subtype: $subtype (is_error: $isError)
- Turns used: $numTurns
- HEAD before: $headBefore
- HEAD after: $headAfter ($headNote)
- Stream log: $logPath
- Stderr: $errPath

## Final result

$resultText

## Denied or errored tool calls

$denialText

## Files changed

### git status --short

``````
$statusText
``````

### git diff --stat (vs recorded HEAD)

``````
$diffStat
``````

The junior never commits or pushes. Review the changes before committing anything.
"@
    [IO.File]::WriteAllText($summaryPath, $summary, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Summary: $summaryPath"
    Write-Host "Exit code: $exitCode  Turns: $numTurns  Subtype: $subtype"
}

exit $exitCode
