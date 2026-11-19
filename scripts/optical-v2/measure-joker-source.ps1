param(
    [Parameter(Mandatory)][string]$Image,
    [switch]$QuarterArea
)

$ErrorActionPreference = 'Stop'
$resolvedImage = (Resolve-Path -LiteralPath $Image).Path
Add-Type -AssemblyName System.Drawing.Common
$bitmap = [System.Drawing.Bitmap]::new($resolvedImage)
try {
    $expected = 1280
    if ($bitmap.Width -ne $expected -or $bitmap.Height -ne $expected) {
        throw 'Expected the supplied 1280 x 1280 original.'
    }
    $rectangle = [System.Drawing.Rectangle]::new(0, 0, $expected, $expected)
    $locked = $bitmap.LockBits($rectangle,
        [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {
        if ($locked.Stride -ne $expected * 3) { throw 'Unexpected pixel stride.' }
        $bytes = [byte[]]::new($locked.Stride * $expected)
        [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $bytes, 0, $bytes.Length)
    }
    finally { $bitmap.UnlockBits($locked) }
}
finally { $bitmap.Dispose() }

$sourceHash = (Get-FileHash -LiteralPath $resolvedImage -Algorithm SHA256).Hash.ToLowerInvariant()
$measurementArgs = @($sourceHash)
if ($QuarterArea) { $measurementArgs += '--quarter-area' }
[Convert]::ToBase64String($bytes) | node (Join-Path $PSScriptRoot 'measure-joker-source.mjs') @measurementArgs
exit $LASTEXITCODE
