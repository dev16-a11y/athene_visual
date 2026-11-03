import type { SceneLabel } from "../scene/labels";

interface Props {
  labels: SceneLabel[];
  selectedId: string | null;
}

/**
 * Экранные подписи объектов. Позиция приходит из сцены уже спроецированной,
 * здесь выполняется только раскладка: подписи, попавшие в одну вертикаль,
 * сдвигаются вниз, чтобы не накладываться друг на друга.
 */
export function SceneLabels({ labels, selectedId }: Props) {
  const placed: Array<{ label: SceneLabel; y: number }> = [];
  for (const label of labels) {
    if (!label.visible) {
      continue;
    }
    let y = label.y;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = placed.some(
        (item) =>
          item.label.visible &&
          Math.abs(item.label.x - label.x) < 190 &&
          Math.abs(item.y - y) < 44,
      );
      if (!clash) {
        break;
      }
      y += 44;
    }
    placed.push({ label, y });
  }

  return (
    <div className="scene-labels" aria-hidden="true">
      {placed.map(({ label, y }) => (
        <div
          key={label.id}
          className={[
            "scene-label",
            `scene-label--${label.tone}`,
            label.id === selectedId ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ left: `${Math.round(label.x)}px`, top: `${Math.round(y)}px` }}
        >
          <span className="scene-label-title">{label.title}</span>
          <span className="scene-label-sub">{label.subtitle}</span>
        </div>
      ))}
    </div>
  );
}
