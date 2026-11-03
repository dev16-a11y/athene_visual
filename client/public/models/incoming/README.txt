Сюда попадают РАСПАКОВАННЫЕ модели (glb/gltf + текстуры).
Архивы кладите в <корень проекта>\incoming-models, не сюда.

Распаковка:
  powershell -ExecutionPolicy Bypass -File client\scripts\unpack-models.ps1

Проверка отдельной модели:
  cd client
  node scripts/model-info.mjs public/models/incoming/<файл>.glb --kind=crane --fit=48
