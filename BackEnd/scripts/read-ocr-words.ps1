param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

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

$resolvedImagePath = (Resolve-Path -LiteralPath $ImagePath).Path
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()

if (-not $ocrEngine) {
    throw "Windows OCR is unavailable on this machine."
}

$file = AwaitWinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedImagePath)) ([Windows.Storage.StorageFile])
$stream = AwaitWinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = AwaitWinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = AwaitWinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocrResult = AwaitWinRt ($ocrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$words = New-Object System.Collections.Generic.List[object]
$lineIndex = 0

foreach ($line in $ocrResult.Lines) {
    foreach ($word in $line.Words) {
        $rect = $word.BoundingRect

        $words.Add([pscustomobject]@{
            lineIndex = $lineIndex
            text = $word.Text
            x = [int][math]::Round($rect.Left)
            y = [int][math]::Round($rect.Top)
            width = [int][math]::Round($rect.Width)
            height = [int][math]::Round($rect.Height)
            right = [int][math]::Round($rect.Right)
            bottom = [int][math]::Round($rect.Bottom)
        })
    }

    $lineIndex += 1
}

[pscustomobject]@{
    words = $words
} | ConvertTo-Json -Depth 4 -Compress
