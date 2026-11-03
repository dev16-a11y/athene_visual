Складывайте сюда ZIP-архивы с моделями (папка вне public, в сборку не попадает).

Распаковка и инвентаризация:
  powershell -ExecutionPolicy Bypass -File client\scripts\unpack-models.ps1

Архивы распакуются в client\public\models\incoming\<имя-архива>\,
скрипт покажет, какие glb/gltf/текстуры внутри.
