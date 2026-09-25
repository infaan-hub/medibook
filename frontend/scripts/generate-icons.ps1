# MediBook PWA icon generator — PHASE 1 (Development Environment)
#
# Generates the manifest icon set (§22.1, §22.3, §69) from the brand logo
# (public/images/logo.jpeg), because Chrome only counts PNG (or SVG/WebP)
# icons as installable — pointing the manifest at the JPEG logo itself makes
# the app non-installable:
#   icon-192.png, icon-512.png (purpose "any" — square crop of the logo)
#   icon-maskable-512.png      (purpose "maskable" — artwork inside the 80% safe zone)
#   apple-touch-icon-180.png   (iOS A2HS — opaque, unrounded, full bleed)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$candidates = @(
    (Join-Path $PSScriptRoot "..\public\images\logo.jpeg"),
    (Join-Path $PSScriptRoot "..\..\logo.jpeg")
)
$source = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $source) {
    throw "Brand logo not found (expected frontend\public\images\logo.jpeg)"
}
$source = (Resolve-Path -LiteralPath $source).Path

$outputDir = Join-Path $PSScriptRoot "..\public\icons"
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
$outputDir = (Resolve-Path -LiteralPath $outputDir).Path

$logo = [System.Drawing.Image]::FromFile($source)

# The brand logo is a portrait canvas (983x1280): centre-crop it to a square so
# launcher / task-switcher masks never squash the mark.
$side = [Math]::Min($logo.Width, $logo.Height)
$crop = New-Object System.Drawing.Rectangle(
    [int][Math]::Floor(($logo.Width - $side) / 2),
    [int][Math]::Floor(($logo.Height - $side) / 2),
    $side,
    $side
)

# Flat brand background sampled from the logo corner — pads the maskable icon
# and keeps every icon opaque (iOS A2HS requires an opaque apple-touch-icon).
$probeBitmap = New-Object System.Drawing.Bitmap($logo)
$probe = $probeBitmap.GetPixel(5, 5)
$brand = [System.Drawing.Color]::FromArgb(255, $probe.R, $probe.G, $probe.B)
$probeBitmap.Dispose()

function New-MedibookIcon {
    param(
        [int]$Size,
        [string]$FileName,
        # 1.0 = edge-to-edge artwork; lower values inset the artwork on a flat
        # brand background so a maskable mask never clips the mark.
        [double]$ArtScale = 1.0
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear($brand)

    # TileFlipXY stops the bicubic kernel from smearing the crop edges.
    $attributes = New-Object System.Drawing.Imaging.ImageAttributes
    $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)

    $art = [int][Math]::Round($Size * $ArtScale)
    $inset = [int][Math]::Floor(($Size - $art) / 2)
    $target = New-Object System.Drawing.Rectangle($inset, $inset, $art, $art)
    $graphics.DrawImage(
        $logo,
        $target,
        $crop.X,
        $crop.Y,
        $crop.Width,
        $crop.Height,
        [System.Drawing.GraphicsUnit]::Pixel,
        $attributes
    )

    $file = Join-Path $outputDir $FileName
    $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)

    $attributes.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Output ("created {0} ({1}x{1}, artwork {2}%)" -f $FileName, $Size, [int]($ArtScale * 100))
}

New-MedibookIcon -Size 192 -FileName "icon-192.png"
New-MedibookIcon -Size 512 -FileName "icon-512.png"
New-MedibookIcon -Size 512 -FileName "icon-maskable-512.png" -ArtScale 0.78
New-MedibookIcon -Size 180 -FileName "apple-touch-icon-180.png"

$logo.Dispose()
Write-Output ("icons written to {0}" -f $outputDir)