<#
.SYNOPSIS
    Obsidian 插件项目初始化脚本。

.DESCRIPTION
    从模板创建 Obsidian 插件项目，替换占位符并安装依赖。

.PARAMETER Name
    插件名称（英文，使用连字符分隔，如 "my-cool-plugin"）。

.PARAMETER Template
    模板类型：simple | view | editor-extension。默认 simple。

.PARAMETER VaultPath
    可选。Obsidian Vault 路径，用于自动创建符号链接到插件目录。

.PARAMETER OutputDir
    可选。项目输出目录。默认为当前目录下以插件名命名的子目录。

.PARAMETER SkipInstall
    可选。跳过 npm install，适用于网络受限环境。

.EXAMPLE
    .\init-obsidian-plugin.ps1 -Name "my-plugin" -Template "simple"
    .\init-obsidian-plugin.ps1 -Name "my-view-plugin" -Template "view" -VaultPath "D:\MyVault"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
    [string]$Name,

    [ValidateSet('simple', 'view', 'editor-extension')]
    [string]$Template = 'simple',

    [string]$VaultPath,

    [string]$OutputDir,

    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

# ============================================================
# 路径计算
# ============================================================

$SkillRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$TemplateDir = Join-Path $SkillRoot "assets\template-$Template"

if (-not $OutputDir) {
    $OutputDir = Join-Path (Get-Location) $Name
}

# 插件类名：连字符转 PascalCase
$ClassName = ($Name -split '-' | ForEach-Object {
    $_.Substring(0, 1).ToUpper() + $_.Substring(1)
}) -join ''
$ClassName += 'Plugin'

# 插件显示名：连字符转空格 + Title Case
$DisplayName = ($Name -split '-' | ForEach-Object {
    $_.Substring(0, 1).ToUpper() + $_.Substring(1)
}) -join ' '

Write-Host "=== Obsidian Plugin Initializer ===" -ForegroundColor Cyan
Write-Host "Plugin ID:    $Name"
Write-Host "Plugin Name:  $DisplayName"
Write-Host "Class Name:   $ClassName"
Write-Host "Template:     $Template"
Write-Host "Output:       $OutputDir"
Write-Host ""

# ============================================================
# 创建项目目录
# ============================================================

if (Test-Path $OutputDir) {
    Write-Error "Directory already exists: $OutputDir"
    exit 1
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Write-Host "[1/4] Created project directory" -ForegroundColor Green

# ============================================================
# 复制模板文件并替换占位符
# ============================================================

Get-ChildItem -Path $TemplateDir -File -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($TemplateDir.Length + 1)
    $destPath = Join-Path $OutputDir $relativePath

    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    $content = Get-Content $_.FullName -Raw -Encoding UTF8
    $content = $content -replace '\{\{PLUGIN_ID\}\}', $Name
    $content = $content -replace '\{\{PLUGIN_NAME\}\}', $DisplayName
    $content = $content -replace '\{\{PLUGIN_CLASS\}\}', $ClassName

    Set-Content -Path $destPath -Value $content -Encoding UTF8 -NoNewline
}

Write-Host "[2/4] Copied and processed template files" -ForegroundColor Green

# ============================================================
# 复制 GitHub Actions 模板
# ============================================================

$workflowDir = Join-Path $OutputDir ".github\workflows"
New-Item -ItemType Directory -Path $workflowDir -Force | Out-Null

$ghActionSrc = Join-Path $SkillRoot "assets\github-release.yml"
if (Test-Path $ghActionSrc) {
    Copy-Item $ghActionSrc (Join-Path $workflowDir "release.yml")
    Write-Host "[3/4] Added GitHub Actions workflow" -ForegroundColor Green
} else {
    Write-Host "[3/4] Skipped GitHub Actions (template not found)" -ForegroundColor Yellow
}

# ============================================================
# 安装依赖
# ============================================================

if ($SkipInstall) {
    Write-Host "[4/4] Skipped npm install" -ForegroundColor Yellow
} else {
    Write-Host "[4/4] Installing npm dependencies..." -ForegroundColor Green
    Push-Location $OutputDir
    try {
        npm install 2>&1 | Out-Null
        Write-Host "Dependencies installed successfully." -ForegroundColor Green
    } catch {
        Write-Warning "npm install failed. Run 'npm install' manually in $OutputDir"
    } finally {
        Pop-Location
    }
}

# ============================================================
# 可选：链接到 Vault
# ============================================================

if ($VaultPath) {
    $pluginDir = Join-Path $VaultPath ".obsidian\plugins\$Name"

    if (Test-Path $pluginDir) {
        Write-Warning "Plugin directory already exists in Vault: $pluginDir"
    } else {
        try {
            New-Item -ItemType Junction -Path $pluginDir -Target $OutputDir | Out-Null
            Write-Host "Linked to Vault: $pluginDir -> $OutputDir" -ForegroundColor Cyan
        } catch {
            Write-Warning "Failed to create junction. Run as Administrator or create manually."
        }
    }
}

# ============================================================
# 完成
# ============================================================

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Write-Host "Next steps:"
Write-Host "  cd $OutputDir"
Write-Host "  npm run dev          # Start development build"
Write-Host "  # Copy output to .obsidian/plugins/$Name/ in your Vault"
Write-Host ""
