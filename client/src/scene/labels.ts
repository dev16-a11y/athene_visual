/**
 * Экранная подпись объекта: позиция считается в Scene по проекции мировой
 * точки, отрисовывается DOM-слоем поверх канваса. Так подпись не занимает
 * место в 3D и не перекрывает судно.
 */
export interface SceneLabel {
  id: string;
  title: string;
  subtitle: string;
  tone: "info" | "warning" | "critical";
  /** Координаты в CSS-пикселях относительно канваса. */
  x: number;
  y: number;
  visible: boolean;
}
