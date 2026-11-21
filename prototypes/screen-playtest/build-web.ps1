param([Parameter(Mandatory)][string]$Deck)

$ErrorActionPreference = 'Stop'
$deckPath = (Resolve-Path -LiteralPath $Deck).Path
$vite = Join-Path $PSScriptRoot '../../node_modules/vite/bin/vite.js'

Push-Location -LiteralPath $PSScriptRoot
try {
    python stage-deck.py $deckPath
    if ($LASTEXITCODE -ne 0) { throw 'Local deck verification failed.' }
    node $vite build --base ./ --outDir dist --assetsInlineLimit 250000
    if ($LASTEXITCODE -ne 0) { throw 'Screen playtest web build failed.' }
    python pack-web.py
    if ($LASTEXITCODE -ne 0) { throw 'Offline HTML packaging failed.' }
} finally {
    Pop-Location
}
