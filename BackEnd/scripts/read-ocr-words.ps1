param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]

$script:AsTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" `
        -and $_.IsGenericMethodDefinition `
        -and $_.GetGenericArguments().Count -eq 1 `
        -and $_.GetParameters().Count -eq 1
} | Select-Object -First 1

$script:TargetTileLongSide = 2800
$script:MaxTileScaleFactor = 4.0

function AwaitWinRt {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Operation,

        [Parameter(Mandatory = $true)]
        [Type]$ResultType
    )

    $task = $script:AsTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Invoke-OcrForImagePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AbsoluteImagePath,

        [Parameter(Mandatory = $true)]
        [int]$SourceX,

        [Parameter(Mandatory = $true)]
        [int]$SourceY,

        [Parameter(Mandatory = $true)]
        [double]$ScaleFactor,

        [Parameter(Mandatory = $true)]
        [int]$LineIndexStart
    )

    $file = AwaitWinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($AbsoluteImagePath)) ([Windows.Storage.StorageFile])
    $stream = AwaitWinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = AwaitWinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = AwaitWinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $ocrResult = AwaitWinRt ($script:OcrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    $words = New-Object System.Collections.Generic.List[object]
    $lineIndex = $LineIndexStart

    foreach ($line in $ocrResult.Lines) {
        foreach ($word in $line.Words) {
            $rect = $word.BoundingRect

            $words.Add([pscustomobject]@{
                lineIndex = $lineIndex
                text = $word.Text
                x = [int][math]::Round($SourceX + ($rect.Left / $ScaleFactor))
                y = [int][math]::Round($SourceY + ($rect.Top / $ScaleFactor))
                width = [int][math]::Round($rect.Width / $ScaleFactor)
                height = [int][math]::Round($rect.Height / $ScaleFactor)
                right = [int][math]::Round($SourceX + (($rect.Left + $rect.Width) / $ScaleFactor))
                bottom = [int][math]::Round($SourceY + (($rect.Top + $rect.Height) / $ScaleFactor))
            })
        }

        $lineIndex += 1
    }

    $stream.Dispose()

    return @{
        Words = $words
        NextLineIndex = $lineIndex
    }
}

function Get-ScaleFactor {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Width,

        [Parameter(Mandatory = $true)]
        [int]$Height
    )

    $longSide = [double][math]::Max($Width, $Height)
    $scaleFactor = $script:TargetTileLongSide / $longSide

    if ($scaleFactor -lt 1.0) {
        return 1.0
    }

    return [math]::Min($script:MaxTileScaleFactor, $scaleFactor)
}

function Get-ColumnCount {
    param([int]$Width)

    if ($Width -ge 3600) { return 4 }
    if ($Width -ge 1800) { return 3 }
    return 2
}

function Get-RowCount {
    param([int]$Height)

    if ($Height -ge 3000) { return 4 }
    if ($Height -ge 1600) { return 3 }
    return 2
}

function Get-TileSpecs {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ImageWidth,

        [Parameter(Mandatory = $true)]
        [int]$ImageHeight
    )

    $columns = Get-ColumnCount -Width $ImageWidth
    $rows = Get-RowCount -Height $ImageHeight
    $baseTileWidth = [int][math]::Ceiling($ImageWidth / $columns)
    $baseTileHeight = [int][math]::Ceiling($ImageHeight / $rows)
    $overlapX = [int][math]::Round($baseTileWidth * 0.14)
    $overlapY = [int][math]::Round($baseTileHeight * 0.18)
    $specs = New-Object System.Collections.Generic.List[object]

    for ($row = 0; $row -lt $rows; $row += 1) {
        for ($column = 0; $column -lt $columns; $column += 1) {
            $x = [math]::Max(0, ($column * $baseTileWidth) - $overlapX)
            $y = [math]::Max(0, ($row * $baseTileHeight) - $overlapY)
            $right = [math]::Min($ImageWidth, (($column + 1) * $baseTileWidth) + $overlapX)
            $bottom = [math]::Min($ImageHeight, (($row + 1) * $baseTileHeight) + $overlapY)

            $specs.Add([pscustomobject]@{
                x = [int]$x
                y = [int]$y
                width = [int]($right - $x)
                height = [int]($bottom - $y)
            })
        }
    }

    return $specs
}

function New-ThresholdImageAttributes {
    $imageAttributes = New-Object System.Drawing.Imaging.ImageAttributes
    $imageAttributes.SetThreshold(0.72)
    return $imageAttributes
}

function Invoke-OcrForBitmapSlice {
    param(
        [Parameter(Mandatory = $true)]
        [System.Drawing.Bitmap]$SourceBitmap,

        [Parameter(Mandatory = $true)]
        [int]$SourceX,

        [Parameter(Mandatory = $true)]
        [int]$SourceY,

        [Parameter(Mandatory = $true)]
        [int]$SourceWidth,

        [Parameter(Mandatory = $true)]
        [int]$SourceHeight,

        [Parameter(Mandatory = $true)]
        [int]$LineIndexStart,

        [switch]$UseThresholdRendering
    )

    $scaleFactor = Get-ScaleFactor -Width $SourceWidth -Height $SourceHeight
    $targetWidth = [int][math]::Round($SourceWidth * $scaleFactor)
    $targetHeight = [int][math]::Round($SourceHeight * $scaleFactor)
    $bitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $imageAttributes = $null
    $tempPath = Join-Path $env:TEMP ("ocr-tile-" + [guid]::NewGuid().ToString() + ".png")

    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

        if ($UseThresholdRendering) {
            $imageAttributes = New-ThresholdImageAttributes
            $graphics.DrawImage(
                $SourceBitmap,
                (New-Object System.Drawing.Rectangle(0, 0, $targetWidth, $targetHeight)),
                $SourceX,
                $SourceY,
                $SourceWidth,
                $SourceHeight,
                [System.Drawing.GraphicsUnit]::Pixel,
                $imageAttributes
            )
        }
        else {
            $graphics.DrawImage(
                $SourceBitmap,
                (New-Object System.Drawing.Rectangle(0, 0, $targetWidth, $targetHeight)),
                (New-Object System.Drawing.Rectangle($SourceX, $SourceY, $SourceWidth, $SourceHeight)),
                [System.Drawing.GraphicsUnit]::Pixel
            )
        }

        $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)

        return Invoke-OcrForImagePath `
            -AbsoluteImagePath $tempPath `
            -SourceX $SourceX `
            -SourceY $SourceY `
            -ScaleFactor $scaleFactor `
            -LineIndexStart $LineIndexStart
    }
    finally {
        if ($imageAttributes) {
            $imageAttributes.Dispose()
        }

        $graphics.Dispose()
        $bitmap.Dispose()

        if (Test-Path -LiteralPath $tempPath) {
            Remove-Item -LiteralPath $tempPath -Force
        }
    }
}

$resolvedImagePath = (Resolve-Path -LiteralPath $ImagePath).Path
$script:OcrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()

if (-not $script:OcrEngine) {
    throw "Windows OCR is unavailable on this machine."
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($resolvedImagePath)
$allWords = New-Object System.Collections.Generic.List[object]
$currentLineIndex = 0

try {
    $fullImageScale = Get-ScaleFactor -Width $sourceBitmap.Width -Height $sourceBitmap.Height

    if ($fullImageScale -gt 1.0) {
        $fullImageResult = Invoke-OcrForBitmapSlice `
            -SourceBitmap $sourceBitmap `
            -SourceX 0 `
            -SourceY 0 `
            -SourceWidth $sourceBitmap.Width `
            -SourceHeight $sourceBitmap.Height `
            -LineIndexStart $currentLineIndex
    }
    else {
        $fullImageResult = Invoke-OcrForImagePath `
            -AbsoluteImagePath $resolvedImagePath `
            -SourceX 0 `
            -SourceY 0 `
            -ScaleFactor 1.0 `
            -LineIndexStart $currentLineIndex
    }

    foreach ($word in $fullImageResult.Words) {
        $allWords.Add($word)
    }

    $currentLineIndex = $fullImageResult.NextLineIndex

    foreach ($tile in (Get-TileSpecs -ImageWidth $sourceBitmap.Width -ImageHeight $sourceBitmap.Height)) {
        $tileResult = Invoke-OcrForBitmapSlice `
            -SourceBitmap $sourceBitmap `
            -SourceX $tile.x `
            -SourceY $tile.y `
            -SourceWidth $tile.width `
            -SourceHeight $tile.height `
            -LineIndexStart $currentLineIndex

        foreach ($word in $tileResult.Words) {
            $allWords.Add($word)
        }

        $currentLineIndex = $tileResult.NextLineIndex

        $thresholdTileResult = Invoke-OcrForBitmapSlice `
            -SourceBitmap $sourceBitmap `
            -SourceX $tile.x `
            -SourceY $tile.y `
            -SourceWidth $tile.width `
            -SourceHeight $tile.height `
            -LineIndexStart $currentLineIndex `
            -UseThresholdRendering

        foreach ($word in $thresholdTileResult.Words) {
            $allWords.Add($word)
        }

        $currentLineIndex = $thresholdTileResult.NextLineIndex
    }
}
finally {
    $sourceBitmap.Dispose()
}

[pscustomobject]@{
    words = $allWords
} | ConvertTo-Json -Depth 4 -Compress
