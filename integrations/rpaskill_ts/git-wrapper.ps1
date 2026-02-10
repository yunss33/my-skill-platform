#!/usr/bin/env pwsh

# Git wrapper script for Trae IDE
$gitPath = "C:\Program Files\Git\cmd\git.exe"

if (-not (Test-Path $gitPath)) {
    Write-Host "Error: Git not found at $gitPath"
    exit 1
}

# Execute git command with provided arguments
& $gitPath $args
