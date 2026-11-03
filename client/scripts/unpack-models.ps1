# Распаковка архивов с моделями и инвентаризация результата.
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File scripts/unpack-models.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/unpack-models.ps1 -Source D:\models
#
# Архивы распаковываются в <корень проекта>/incoming-models/extracted,
# то есть ВНЕ public: в сборку и на сервер они не попадают.
# Дальше нужные .glb копируются в client/public/models/ вручную.

param(
    [string]$Source = (Join-Path $PSScriptRoot '..\..\incoming-models')
)

$ErrorActionPreference = 'Stop'
$extractedPath = Join-Path $PSScriptRoot '..\..\incoming-models\extracted'; New-Item -ItemType Directory -Path $extractedPath -Force | Out-Null; $extracted = (Resolve-Path $extractedPath).Path
New-Item -ItemType Directory -Path $extracted -Force | Out-Null
$Source = (Resolve-Path $Source).Path

$archives = @(Get-ChildItem $Source -File -Recurse | Where-Object { $_.Extension -match '^\.(zip|rar|7z)$' })
if ($archives.Count -eq 0) {
    Write-Host "Архивов не найдено: $Source"
    exit 0
}

foreach ($archive in $archives) {
    $target = Join-Path $extracted $archive.BaseName
    if (Test-Path $target) {
        Write-Host "уже распакован: $($archive.Name)"
        continue
    }
    if ($archive.Extension -ne '.zip') {
        Write-Host "пропуск (нужен распаковщик .rar/.7z): $($archive.Name)"
        continue
    }
    Write-Host "распаковываю: $($archive.Name)"
    Expand-Archive -LiteralPath $archive.FullName -DestinationPath $target -Force
}

Write-Host ""
Write-Host "Что найдено:"
$extensions = @('.glb', '.gltf', '.bin', '.png', '.jpg', '.jpeg', '.ktx2', '.fbx', '.obj', '.blend')
$models = @(Get-ChildItem $extracted -Recurse -File | Where-Object { $extensions -contains $_.Extension.ToLower() } | Sort-Object FullName)

foreach ($file in $models) {
    $relative = $file.FullName.Substring($extracted.Length + 1)
    Write-Host ("{0,10}  {1}" -f $file.Length, $relative)
}

Write-Host ""
Write-Host "Дальше: скопируйте нужный .glb в client/public/models/ и проверьте его:"
Write-Host "  cd client"
Write-Host "  node scripts/model-info.mjs public/models/<файл>.glb --kind=crane --fit=48"