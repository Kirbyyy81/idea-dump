# Weekly Productivity Log CLI (PowerShell)
# Usage: .\weekly-log.ps1 -Action {create|list|update} [arguments]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("create", "list", "update", "help")]
    [string]$Action,
    
    [string]$Date,
    [string]$Day,
    [string]$Task,
    [string]$Tools,
    [string]$Lesson,
    [string]$Id,
    [string]$From,
    [string]$To,
    [int]$Limit = 50
)

# Configuration
$BaseUrl = if ($env:WPL_BASE_URL) { $env:WPL_BASE_URL } else { "https://idea-dump-alpha.vercel.app" }
$ApiKeyFile = Join-Path $PSScriptRoot ".wpl_api_key"

# Load API key
$ApiKey = $env:WPL_API_KEY
if (-not $ApiKey -and (Test-Path $ApiKeyFile)) {
    $ApiKey = (Get-Content $ApiKeyFile -Raw).Trim()
}

if (-not $ApiKey) {
    Write-Error "Missing WPL_API_KEY"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  1. Create $ApiKeyFile with your API key"
    Write-Host "  2. Set `$env:WPL_API_KEY environment variable"
    exit 1
}

$Headers = @{
    "Content-Type" = "application/json"
    "x-api-key" = $ApiKey
}

function Show-Help {
    Write-Host "Weekly Productivity Log CLI (PowerShell)"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\weekly-log.ps1 -Action create -Date 2026-02-05 -Day Wednesday -Task 'What I did' -Tools 'VSCode' -Lesson 'Key insight'"
    Write-Host "  .\weekly-log.ps1 -Action list [-From 2026-02-01] [-To 2026-02-07] [-Limit 50]"
    Write-Host "  .\weekly-log.ps1 -Action update -Id <uuid> -Date ... -Day ... -Task ... -Tools ... -Lesson ..."
    Write-Host ""
    Write-Host "Environment:"
    Write-Host "  WPL_API_KEY   - API key (or use .wpl_api_key file)"
    Write-Host "  WPL_BASE_URL  - API base URL (default: $BaseUrl)"
}

switch ($Action) {
    "create" {
        if (-not $Date -or -not $Day -or -not $Task) {
            Write-Error "Required: -Date, -Day, -Task"
            Write-Host "Example: .\weekly-log.ps1 -Action create -Date 2026-02-05 -Day Wednesday -Task 'Built API' -Tools 'Next.js' -Lesson 'Great progress'"
            exit 1
        }

        $Body = @{
            content = @{
                date = $Date
                day = $Day
                operation_task = $Task
                tools_used = $Tools
                lesson_learned = $Lesson
            }
        } | ConvertTo-Json -Depth 3

        try {
            $Response = Invoke-RestMethod -Uri "$BaseUrl/api/logs" -Method Post -Headers $Headers -Body $Body
            Write-Host "✓ Log created successfully" -ForegroundColor Green
            Write-Host "ID: $($Response.data.id)"
        } catch {
            Write-Error "Failed to create log: $($_.Exception.Message)"
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message
            }
            exit 1
        }
    }

    "list" {
        $Query = @()
        if ($From) { $Query += "from=$From" }
        if ($To) { $Query += "to=$To" }
        if ($Limit) { $Query += "limit=$Limit" }
        $QueryString = if ($Query.Count -gt 0) { "?" + ($Query -join "&") } else { "" }

        try {
            $Response = Invoke-RestMethod -Uri "$BaseUrl/api/logs$QueryString" -Method Get -Headers @{ "x-api-key" = $ApiKey }
            
            if ($Response.data.Count -eq 0) {
                Write-Host "No logs found" -ForegroundColor Yellow
            } else {
                $Response.data | ForEach-Object {
                    Write-Host "[$($_.content.date)] $($_.content.day)" -ForegroundColor Cyan
                    Write-Host "  Task: $($_.content.operation_task)"
                    Write-Host "  Tools: $($_.content.tools_used)"
                    if ($_.content.lesson_learned) {
                        Write-Host "  Lesson: $($_.content.lesson_learned)" -ForegroundColor Green
                    }
                    Write-Host ""
                }
            }
        } catch {
            Write-Error "Failed to list logs: $($_.Exception.Message)"
            exit 1
        }
    }

    "update" {
        if (-not $Id -or -not $Date) {
            Write-Error "Required: -Id, -Date"
            exit 1
        }

        $Body = @{
            content = @{
                date = $Date
                day = $Day
                operation_task = $Task
                tools_used = $Tools
                lesson_learned = $Lesson
            }
            allow_human_overwrite = $false
        } | ConvertTo-Json -Depth 3

        try {
            $Response = Invoke-RestMethod -Uri "$BaseUrl/api/logs/$Id" -Method Patch -Headers $Headers -Body $Body
            Write-Host "✓ Log updated successfully" -ForegroundColor Green
        } catch {
            Write-Error "Failed to update log: $($_.Exception.Message)"
            exit 1
        }
    }

    "help" {
        Show-Help
    }
}
