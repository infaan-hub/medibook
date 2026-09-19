# MediBook PWA icon generator — PHASE 1 (Development Environment)
#
# Generates the icon set required by the Web App Manifest (§22.1, §22.3, §69):
#   icon-192.png, icon-512.png (any), icon-maskable-512.png (maskable),
#   apple-touch-icon-180.png (opaque, for iOS A2HS)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$primary = [System.Drawing.Color]::FromArgb(255, 15, 98, 254)  # #0F62FE (roadmap theme colour)
$white = [System.Drawing.Color]::White

$outputDir = Join-Path $PSScriptRoot "..\public\icons"
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
$outputDir = (Resolve-Path -LiteralPath $outputDir).Path

function Add-RoundedRect {
    param(
        [System.Drawing.Drawing2D.GraphicsPath]$Path,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [double]$Radius
    )

    $diameter = $Radius * 2
    $Path.AddArc([single]$X, [single]$Y, [single]$diameter, [single]$diameter, 180, 90)
    $Path.AddArc([single]($X + $Width - $diameter), [single]$Y, [single]$diameter, [single]$diameter, 270, 90)
    $Path.AddArc(
        [single]($X + $Width - $diameter),
        [single]($Y + $Height - $diameter),
        [single]$diameter,
        [single]$diameter,
        0,
        90
    )
    $Path.AddArc([single]$X, [single]($Y + $Height - $diameter), [single]$diameter, [single]$diameter, 90, 90)
    $Path.CloseFigure()
}

function New-MedibookIcon {
    param(
        [int]$Size,
        [string]$FileName,
        [switch]$FullBleed   # maskable + apple-touch: opaque, edge-to-edge, artwork in the safe zone
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($FullBleed) {
        $graphics.Clear($primary)
        $logoScale = 0.50
    }
    else {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $background = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRect -Path $background -X 0 -Y 0 -Width $Size -Height $Size -Radius ($Size * 0.22)
        $backgroundBrush = New-Object System.Drawing.SolidBrush($primary)
        $graphics.FillPath($backgroundBrush, $background)
        $backgroundBrush.Dispose()
        $background.Dispose()
        $logoScale = 0.58
    }

    # White medical cross, centred
    $crossSize = $Size * $logoScale
    $bar = $crossSize * 0.34
    $originX = ($Size - $crossSize) / 2
    $originY = ($Size - $crossSize) / 2

    $crossBrush = New-Object System.Drawing.SolidBrush($white)
    $crossPath = New-Object System.Drawing.Drawing2D.GraphicsPath

    Add-RoundedRect -Path $crossPath -X $originX -Y ($originY + (($crossSize - $bar) / 2)) `
        -Width $crossSize -Height $bar -Radius ($bar * 0.3)
    Add-RoundedRect -Path $crossPath -X ($originX + (($crossSize - $bar) / 2)) -Y $originY `
        -Width $bar -Height $crossSize -Radius ($bar * 0.3)

    $graphics.FillPath($crossBrush, $crossPath)
    $crossPath.Dispose()
    $crossBrush.Dispose()

    $target = Join-Path $outputDir $FileName
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Output ("created {0} ({1}x{1})" -f $FileName, $Size)
}

New-MedibookIcon -Size 192 -FileName "icon-192.png"
New-MedibookIcon -Size 512 -FileName "icon-512.png"
New-MedibookIcon -Size 512 -FileName "icon-maskable-512.png" -FullBleed
New-MedibookIcon -Size 180 -FileName "apple-touch-icon-180.png" -FullBleed

Write-Output ("icons written to {0}" -f $outputDir)