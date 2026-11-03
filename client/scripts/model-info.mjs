// Инспектор GLB/glTF: печатает узлы, материалы, габариты и готовую запись для
// MODEL_MANIFEST. Запуск:
//   node scripts/model-info.mjs public/models/my-crane.glb --kind=crane --fit=45
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Укажите путь к .glb/.gltf");
  process.exit(1);
}
const kind =
  process.argv.find((arg) => arg.startsWith("--kind="))?.split("=")[1] ?? "entity";
const fitArg = process.argv.find((arg) => arg.startsWith("--fit="));
const fit = fitArg ? Number(fitArg.split("=")[1]) : undefined;

const buffer = readFileSync(file);
if (buffer.toString("ascii", 0, 4) !== "glTF") {
  console.error("Это не GLB (нет магии glTF). Для .gltf конвертируйте в .glb.");
  process.exit(2);
}

const version = buffer.readUInt32LE(4);
const chunkLength = buffer.readUInt32LE(12);
const chunkType = buffer.toString("ascii", 16, 20);
if (chunkType !== "JSON") {
  console.error("Первый чанк не JSON — файл повреждён или это не GLB 2.0");
  process.exit(2);
}
const json = JSON.parse(buffer.toString("utf8", 20, 20 + chunkLength));

const accessors = json.accessors ?? [];
const meshes = json.meshes ?? [];
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
let primitives = 0;
let triangles = 0;
for (const mesh of meshes) {
  for (const primitive of mesh.primitives ?? []) {
    primitives++;
    const position = accessors[primitive.attributes?.POSITION];
    if (position?.min && position?.max) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], position.min[axis]);
        max[axis] = Math.max(max[axis], position.max[axis]);
      }
    }
    if (primitive.indices !== undefined) {
      triangles += Math.round(accessors[primitive.indices].count / 3);
    } else if (position) {
      triangles += Math.round(position.count / 3);
    }
  }
}
const size = max.map((value, index) => +(value - min[index]).toFixed(2));
const horizontal = Math.max(size[0], size[2]);
const suggested = fit
  ? +(fit / (horizontal || 1)).toFixed(4)
  : null;

console.log(`Файл:        ${basename(file)}`);
console.log(`Версия GLB:  ${version}`);
console.log(`Узлов:       ${(json.nodes ?? []).length}`);
console.log(`Мешей:       ${meshes.length} (примитивов ${primitives})`);
console.log(`Треугольников: ${triangles}`);
console.log(`Материалы:   ${(json.materials ?? []).length}`);
console.log(`Текстуры:    ${(json.textures ?? []).length}`);
console.log(`Анимации:    ${(json.animations ?? []).length}`);
console.log(`Габариты:    X ${size[0]} × Y ${size[1]} × Z ${size[2]} (единицы модели)`);
console.log(
  "Ориентация:  проверьте визуально; если модель лежит на боку или «стоит на носу»," +
    " задайте rotationX: -Math.PI / 2 (±).",
);

console.log("\nЗапись для client/src/scene/models.ts:\n");
console.log(`  ${kind}: {`);
console.log(`    url: "/models/${basename(file)}",`);
console.log(`    fitLength: ${fit ?? Math.round(horizontal)},`);
if (!fit) {
  console.log("    // fitLength — желаемая длина объекта в метрах");
}
console.log("    shadow: true,");
console.log("  },");
if (suggested !== null) {
  console.log(`\n  // внутренний масштаб модели при нормализации: ${suggested}`);
}
