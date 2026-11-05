// Карточка геоосновы: что именно показано, откуда взято и где сейчас камера.
//
// В режиме Кандлы панелей телеметрии нет — показывать нечего, а придумывать
// цифры нельзя. Зато нужно назвать источник и лицензию (ODbL их требует) и
// дать проверяемую привязку: координаты центра обзора в градусах.

import type { KandlaInfo } from "../scene/kandla/KandlaScene";
import { formatGeo } from "../scene/kandla/geo";
import { formatDate } from "../utils/format";

interface GeoCardProps {
  info: KandlaInfo | null;
  camera: { lon: number; lat: number; radius: number; beta: number } | null;
  error: string | null;
}

const numberFormat = new Intl.NumberFormat("ru-RU");

export function GeoCard({ info, camera, error }: GeoCardProps) {
  const altitude = camera ? camera.radius * Math.cos(camera.beta) : null;

  return (
    <div className="rail rail-left geo-rail">
      <section className="panel geo-card">
        <div className="panel-head">
          <div>
            <div className="panel-kicker">Географическая основа</div>
            <h3 className="panel-title">Кандла · Deendayal Port</h3>
          </div>
          <span className="panel-badge">OSM</span>
        </div>

        {error && (
          <p className="geo-error" role="alert">
            Сцена не собрана: {error}
          </p>
        )}

        {!info && !error && (
          <p className="geo-note">Подготовка территории и акватории…</p>
        )}

        {info && (
          <>
            <dl className="geo-rows">
              <div className="geo-row">
                <dt>Суша</dt>
                <dd>{numberFormat.format(Math.round(info.stats.landAreaKm2 * 100) / 100)} км²</dd>
              </div>
              <div className="geo-row">
                <dt>Акватория в кадре</dt>
                <dd>{info.layers.water} контура</dd>
              </div>
              <div className="geo-row">
                <dt>Причальные основания</dt>
                <dd>{info.layers.piers}</dd>
              </div>
              <div className="geo-row">
                <dt>Точек контура суши</dt>
                <dd>{numberFormat.format(info.stats.landVertices)}</dd>
              </div>
              <div className="geo-row">
                <dt>Снимок OSM</dt>
                <dd>
                  {info.dataTimestamp ? formatDate(info.dataTimestamp) : "без отметки"}
                </dd>
              </div>
              <div className="geo-row">
                <dt>Центр обзора</dt>
                <dd>{camera ? formatGeo(camera.lon, camera.lat) : "…"}</dd>
              </div>
              <div className="geo-row">
                <dt>Высота камеры</dt>
                <dd>{altitude === null ? "…" : `${numberFormat.format(Math.round(altitude / 10) * 10)} м`}</dd>
              </div>
            </dl>

            <p className="geo-note">
              Территория и акватория без инфраструктуры: зданий, кранов, судов и
              грузов в сцене нет. Очертания восстановлены по данным
              OpenStreetMap, локальные высоты условные.
            </p>

            <div className="geo-attribution">
              <span>{info.attribution}</span>
              <span>Данные: ODbL 1.0</span>
            </div>
          </>
        )}
      </section>

      <section className="panel geo-legend">
        <div className="panel-kicker">Слои сцены</div>
        <ul className="geo-legend-list">
          <li>
            <span className="geo-swatch geo-swatch-land" />
            Суша, острова, причальные основания
          </li>
          <li>
            <span className="geo-swatch geo-swatch-water" />
            Акватория рукава и бассейны
          </li>
          <li>
            <span className="geo-swatch geo-swatch-mud" />
            Приливные участки (мангры)
          </li>
        </ul>
      </section>
    </div>
  );
}
