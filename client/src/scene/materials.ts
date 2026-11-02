import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import {
  createContainerTexture,
  createGroundTexture,
  createSkyTexture,
} from "./textures";

export interface PortMaterials {
  apron: StandardMaterial;
  yard: StandardMaterial;
  road: StandardMaterial;
  quayWall: StandardMaterial;
  steelBlue: StandardMaterial;
  steelBlueDark: StandardMaterial;
  steelLight: StandardMaterial;
  accent: StandardMaterial;
  yellow: StandardMaterial;
  white: StandardMaterial;
  hull: StandardMaterial;
  hullLower: StandardMaterial;
  deck: StandardMaterial;
  superstructure: StandardMaterial;
  glass: StandardMaterial;
  funnel: StandardMaterial;
  container: StandardMaterial[];
  rail: StandardMaterial;
  ballast: StandardMaterial;
  warehouse: StandardMaterial;
  roof: StandardMaterial;
  warehouseDoor: StandardMaterial;
  truckCab: StandardMaterial[];
  truckTrailer: StandardMaterial;
  tugHull: StandardMaterial;
  tugCabin: StandardMaterial;
  marker: StandardMaterial;
  warning: StandardMaterial;
  lamp: StandardMaterial;
  sky: StandardMaterial;
  foliage: StandardMaterial;
}

function standard(
  scene: Scene,
  name: string,
  color: string,
  options: {
    specular?: number;
    power?: number;
    emissive?: string;
    alpha?: number;
    texture?: StandardMaterial["diffuseTexture"];
    unlit?: boolean;
  } = {},
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = Color3.FromHexString(
    options.specular !== undefined ? color : "#20262b",
  ).scale(options.specular ?? 0.18);
  material.specularPower = options.power ?? 48;
  if (options.emissive) {
    material.emissiveColor = Color3.FromHexString(options.emissive);
  }
  if (options.alpha !== undefined) {
    material.alpha = options.alpha;
    material.backFaceCulling = false;
  }
  if (options.texture) {
    material.diffuseTexture = options.texture;
  }
  if (options.unlit) {
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
  }
  return material;
}

export function createMaterials(scene: Scene): PortMaterials {
  const apronTexture = createGroundTexture(scene, "concrete-apron", "#aaadaf", 17, "concrete");
  const yardTexture = createGroundTexture(scene, "concrete-yard", "#93989b", 29, "concrete");
  const roadTexture = createGroundTexture(scene, "asphalt-road", "#4b5054", 41, "asphalt");
  const corrugation = createContainerTexture(scene);

  const containerColors = [
    "#b8412f",
    "#1f6fa8",
    "#2e7d5b",
    "#c98a25",
    "#7b858b",
    "#8e3b28",
  ];

  const sky = standard(scene, "sky", "#ffffff", { unlit: true });
  sky.emissiveTexture = createSkyTexture(scene);
  sky.backFaceCulling = false;

  return {
    apron: standard(scene, "apron", "#c0c3c4", { texture: apronTexture, specular: 0.05 }),
    yard: standard(scene, "yard", "#a5a9ab", { texture: yardTexture, specular: 0.04 }),
    road: standard(scene, "road", "#565b5f", { texture: roadTexture, specular: 0.08 }),
    quayWall: standard(scene, "quay-wall", "#6e7478", { specular: 0.08 }),
    steelBlue: standard(scene, "steel-blue", "#1d5f9e", { specular: 0.35, power: 90 }),
    steelBlueDark: standard(scene, "steel-blue-dark", "#13456f", { specular: 0.3 }),
    steelLight: standard(scene, "steel-light", "#8c979e", { specular: 0.3 }),
    accent: standard(scene, "accent", "#2f8fd0", { emissive: "#0b3550", specular: 0.2 }),
    yellow: standard(scene, "yellow", "#e0b22a", { specular: 0.1 }),
    white: standard(scene, "white", "#e7ebed", { specular: 0.2 }),
    hull: standard(scene, "hull", "#1a2b38", { specular: 0.45, power: 120 }),
    hullLower: standard(scene, "hull-lower", "#7d2f2a", { specular: 0.25 }),
    deck: standard(scene, "deck", "#6e777c", { specular: 0.12 }),
    superstructure: standard(scene, "superstructure", "#dfe4e6", { specular: 0.3 }),
    glass: standard(scene, "glass", "#17313e", { emissive: "#0a1f28", specular: 0.6, power: 140 }),
    funnel: standard(scene, "funnel", "#26333b", { specular: 0.3 }),
    container: containerColors.map((color, index) =>
      standard(scene, `container-${index}`, color, {
        texture: corrugation,
        specular: 0.18,
        power: 36,
      }),
    ),
    rail: standard(scene, "rail", "#7d8489", { specular: 0.7, power: 160 }),
    ballast: standard(scene, "ballast", "#5a5249", { specular: 0.02 }),
    warehouse: standard(scene, "warehouse", "#c4cacc", { specular: 0.15 }),
    roof: standard(scene, "warehouse-roof", "#7d8b94", { specular: 0.2 }),
    warehouseDoor: standard(scene, "warehouse-door", "#48565f", { specular: 0.15 }),
    truckCab: ["#d8dde0", "#2b6f9e", "#b84a35", "#d5b13c"].map((color, index) =>
      standard(scene, `truck-cab-${index}`, color, { specular: 0.35, power: 80 }),
    ),
    truckTrailer: standard(scene, "truck-trailer", "#9aa1a5", { specular: 0.15 }),
    tugHull: standard(scene, "tug-hull", "#b7462c", { specular: 0.3 }),
    tugCabin: standard(scene, "tug-cabin", "#e6eaec", { specular: 0.3 }),
    marker: standard(scene, "marker", "#35c8f5", {
      emissive: "#35c8f5",
      alpha: 0.95,
      unlit: true,
    }),
    warning: standard(scene, "warning", "#e3a72b", { emissive: "#5c3d05" }),
    lamp: standard(scene, "lamp", "#fff2c4", { emissive: "#ffe9a8", unlit: true }),
    sky,
    foliage: standard(scene, "foliage", "#3f6b4a", { specular: 0.05 }),
  };
}
