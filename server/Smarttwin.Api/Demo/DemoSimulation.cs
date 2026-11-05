using System.Globalization;
using System.Text.Json;
using Smarttwin.Api.Contracts;

namespace Smarttwin.Api.Demo;

public sealed record SimulationTickResult(SnapshotDto Snapshot, StateDeltaDto Delta);

/// <summary>
/// Deterministic demonstration source. The server owns coordinates, events and
/// KPI values; the client only renders and interpolates them.
/// </summary>
public sealed class DemoSimulation
{
    public const int TickMilliseconds = 2_000;
    public const long WarningTick = 66;
    public const long StartTick = 60;

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly object _gate = new();
    private readonly DateTimeOffset _baseTime;
    private SnapshotDto? _lastSnapshot;

    public DemoSimulation()
    {
        _baseTime = DateTimeOffset.Now.AddSeconds(-2 * StartTick);
    }

    public long CurrentTick =>
        Math.Max(
            0,
            (long)Math.Floor(
                (DateTimeOffset.Now - _baseTime).TotalMilliseconds / TickMilliseconds));

    public DateTimeOffset TimeForTick(long tick) =>
        _baseTime.AddMilliseconds(tick * TickMilliseconds);

    public SnapshotDto GetSnapshot()
    {
        lock (_gate)
        {
            var tick = CurrentTick;
            var snapshot = BuildSnapshot(tick);
            _lastSnapshot ??= snapshot;
            return snapshot;
        }
    }

    public SimulationTickResult? Advance()
    {
        lock (_gate)
        {
            var tick = CurrentTick;
            var next = BuildSnapshot(tick);
            var previous = _lastSnapshot ?? BuildSnapshot(Math.Max(0, tick - 1));
            if (next.Sequence <= previous.Sequence)
            {
                return null;
            }
            _lastSnapshot = next;
            return new SimulationTickResult(next, BuildDelta(previous, next));
        }
    }

    public SnapshotDto BuildSnapshot(long tick)
    {
        var sequence = Math.Max(0, tick);
        var vessels = BuildVessels(sequence);
        var cranes = BuildCranes(sequence);
        var trucks = BuildTrucks(sequence);
        var tugs = BuildTugs(sequence);
        var train = BuildTrain(sequence);
        var yards = BuildYards(sequence);
        var warnings = BuildWarnings(sequence);
        var completed = vessels.Sum(vessel => vessel.CompletedTeu);

        return new SnapshotDto
        {
            Mode = "demo",
            Sequence = sequence,
            ServerTime = TimeForTick(sequence),
            Vessels = vessels,
            Cranes = cranes,
            Trucks = trucks,
            Tugs = tugs,
            Train = train,
            Yards = yards,
            Warnings = warnings,
            Warehouses = [],
            Kpis = BuildKpis(sequence, completed),
            History = BuildHistory(sequence),
        };
    }

    private List<VesselDto> BuildVessels(long tick)
    {
        var tickTime = TimeForTick(tick);
        var startedAt = _baseTime.AddHours(-6);
        var plannedFinish = _baseTime.AddHours(2);
        return
        [
            new VesselDto
            {
                Id = "vessel-orion",
                Kind = "vessel",
                Name = "ORION",
                Position = new PointDto { X = -102, Z = -18 },
                Heading = 0,
                Status = "working",
                UpdatedAt = tickTime,
                Cargo = "containers",
                Operation = "loading",
                Berth = "02",
                PlannedTeu = 2400,
                CompletedTeu = (int)(1632 - StartTick * 4 + tick * 4),
                StartedAt = startedAt,
                PlannedFinish = plannedFinish,
                DeviationMinutes = 35,
                Loa = 190,
                Beam = 32,
            },
            new VesselDto
            {
                Id = "vessel-vega",
                Kind = "vessel",
                Name = "VEGA",
                Position = new PointDto { X = 104, Z = -18 },
                Heading = 0,
                Status = "working",
                UpdatedAt = tickTime,
                Cargo = "containers",
                Operation = "unloading",
                Berth = "03",
                PlannedTeu = 3100,
                CompletedTeu = (int)(1302 - StartTick * 3 + tick * 3),
                StartedAt = startedAt,
                PlannedFinish = plannedFinish,
                DeviationMinutes = -10,
                Loa = 190,
                Beam = 32,
            },
        ];
    }

    private List<CraneDto> BuildCranes(long tick)
    {
        var seeds = new (string Id, string Name, double X, string Berth)[]
        {
            ("crane-01", "STS-01", -162, "02"),
            ("crane-02", "STS-02", -108, "02"),
            ("crane-03", "STS-03", -54, "02"),
            ("crane-04", "STS-04", 54, "03"),
            ("crane-05", "STS-05", 108, "03"),
            ("crane-06", "STS-06", 162, "03"),
        };

        var cranes = new List<CraneDto>(seeds.Length);
        for (var index = 0; index < seeds.Length; index += 1)
        {
            var seed = seeds[index];
            var maintenance = seed.Id == "crane-05";
            var spreaderLoad = !maintenance && (tick + index) % 4 < 2 ? 1 : 0;
            cranes.Add(new CraneDto
            {
                Id = seed.Id,
                Kind = "crane",
                Name = seed.Name,
                Position = new PointDto { X = seed.X, Z = 12 },
                Heading = 180,
                Status = maintenance ? "maintenance" : "working",
                UpdatedAt = TimeForTick(tick),
                Berth = seed.Berth,
                SpreaderLoad = spreaderLoad,
                MovesPerHour = maintenance ? 0 : 26 + index % 3 * 2,
            });
        }
        return cranes;
    }

    private List<TruckDto> BuildTrucks(long tick)
    {
        var seeds = new (string Id, double Offset, double Speed, string Status, bool Loaded)[]
        {
            // Скорости намеренно разные: тягач с большей скоростью догоняет
            // впереди идущего и встаёт ему в хвост (правило интервала считает
            // клиент). Стоящая в полосе машина заблокировала бы всю петлю,
            // поэтому все тягачи едут, а рабочие статусы не мешают движению.
            ("truck-01", 30, 11, "moving", true),
            ("truck-02", 140, 10, "moving", true),
            ("truck-03", 250, 9, "moving", false),
            ("truck-04", 330, 11, "working", true),
            ("truck-05", 390, 8, "moving", false),
        };

        const double minX = -200;
        const double maxX = 200;
        const double span = maxX - minX;
        var lap = span * 2;

        // Обгон на однополосной петле невозможен, поэтому быстрый тягач
        // упирается в хвост более медленному. Считаем это без состояния:
        // свободное положение каждого тягача ограничивается положением
        // впереди идущего минус интервал. Порядок машин по петле сохраняется,
        // поэтому минимум берётся по всем, кто впереди по кругу (для тех, кто
        // формально уже «на следующем круге», добавляется длина петли).
        // Результат — непрерывная детерминированная функция тика, поэтому
        // историю можно восстановить тем же вызовом.
        var free = new double[seeds.Length];
        for (var index = 0; index < seeds.Length; index += 1)
        {
            free[index] = seeds[index].Offset + tick * seeds[index].Speed;
        }

        var held = new double[seeds.Length];
        for (var index = 0; index < seeds.Length; index += 1)
        {
            var position = free[index];
            for (var rank = 1; rank < seeds.Length; rank += 1)
            {
                var aheadIndex = (index + rank) % seeds.Length;
                var aheadPosition = free[aheadIndex]
                    + (aheadIndex <= index ? lap : 0)
                    - TruckGap * rank;
                position = Math.Min(position, aheadPosition);
            }
            held[index] = position;
        }

        var trucks = new List<TruckDto>(seeds.Length);
        for (var index = 0; index < seeds.Length; index += 1)
        {
            var seed = seeds[index];
            var travelled = held[index];
            var loop = (travelled % (span * 2) + span * 2) % (span * 2);
            var eastbound = loop < span;
            var x = eastbound ? minX + loop : maxX - (loop - span);
            trucks.Add(new TruckDto
            {
                Id = seed.Id,
                Kind = "truck",
                Name = seed.Id.Replace("truck-", "Авто "),
                Position = new PointDto { X = Math.Round(x, 2), Z = eastbound ? 56 : 63 },
                Heading = eastbound ? 0 : 180,
                Status = seed.Status,
                UpdatedAt = TimeForTick(tick),
                Loaded = seed.Loaded,
                Route = seed.Status == "working" ? "quay" : "yard",
            });
        }
        return trucks;
    }

    /// <summary>
    /// Интервал между центрами тягачей: корма переднего (15,9 м) + нос заднего
    /// (3,4 м) + запас. Запас покрывает сглаживание поворота в сцене и
    /// линейную интерполяцию между тиками по 2 с.
    /// </summary>
    private const double TruckGap = 24.0;

    private List<TugDto> BuildTugs(long tick)
    {
        var angle = tick * 0.012 + 0.6;
        var x = Math.Cos(angle) * 118;
        var z = -142 + Math.Sin(angle) * 58;
        var heading = Math.Atan2(Math.Cos(angle), -Math.Sin(angle)) * 180 / Math.PI;
        return
        [
            new TugDto
            {
                Id = "tug-atlas",
                Kind = "tug",
                Name = "ATLAS",
                Position = new PointDto
                {
                    X = Math.Round(x, 2),
                    Z = Math.Round(z, 2),
                },
                Heading = Math.Round(heading, 1),
                Status = "moving",
                UpdatedAt = TimeForTick(tick),
                Course = Math.Round(angle * 180 / Math.PI + 90, 1),
            },
        ];
    }

    private TrainDto BuildTrain(long tick) =>
        new()
        {
            Id = "train-01",
            Kind = "train",
            Name = "Состав 2047",
            Position = new PointDto { X = 12, Z = 82 },
            Heading = 90,
            Status = "working",
            UpdatedAt = TimeForTick(tick),
            Wagons = 18,
            LoadedWagons = Math.Min(18, 11 + (int)(tick / 40)),
        };

    private List<YardBlockDto> BuildYards(long tick)
    {
        var seeds = new (string Id, string Block, double X, double Z, int Capacity, double Fill)[]
        {
            ("yard-a1", "A1", -140, 122, 2100, 0.62),
            ("yard-a2", "A2", -88, 122, 1800, 0.54),
            ("yard-b1", "B1", -140, 188, 2100, 0.71),
            ("yard-b2", "B2", -88, 188, 1800, 0.83),
            ("yard-c1", "C1", 84, 122, 2400, 0.66),
            ("yard-c2", "C2", 140, 188, 2400, 0.48),
        };

        var yards = new List<YardBlockDto>(seeds.Length);
        foreach (var seed in seeds)
        {
            var warningPressure = seed.Id == "yard-b2" && tick >= WarningTick;
            var fill = warningPressure
                ? 0.91
                : Math.Min(0.97, seed.Fill + tick * 0.00006);
            yards.Add(new YardBlockDto
            {
                Id = seed.Id,
                Kind = "yard",
                Name = $"Площадка {seed.Block}",
                Block = seed.Block,
                Position = new PointDto { X = seed.X, Z = seed.Z },
                Heading = 0,
                Status = warningPressure ? "warning" : "working",
                UpdatedAt = TimeForTick(tick),
                CapacityTeu = seed.Capacity,
                OccupiedTeu = (int)Math.Round(seed.Capacity * fill),
                QueuedTrucks = warningPressure
                    ? 7
                    : (seed.Block[0] + (int)tick) % 3,
            });
        }
        return yards;
    }

    private List<PortWarningDto> BuildWarnings(long tick)
    {
        if (tick < WarningTick)
        {
            return [];
        }
        return
        [
            new PortWarningDto
            {
                Id = "warning-yard-b2",
                Severity = "warning",
                EntityId = "yard-b2",
                Title = "Площадка B2 заполнена на 91%",
                Message =
                    "Очередь на въезд — 7 машин. Рекомендуется перенаправить поток на площадку C2.",
                RaisedAt = TimeForTick(WarningTick),
                Active = true,
            },
        ];
    }

    private KpisDto BuildKpis(long tick, int completedTeu)
    {
        var localNow = TimeForTick(tick).ToLocalTime();
        var shiftStart = new DateTimeOffset(
            localNow.Year,
            localNow.Month,
            localNow.Day,
            8,
            0,
            0,
            localNow.Offset);

        return new KpisDto
        {
            PeriodStart = shiftStart,
            PeriodEnd = shiftStart.AddHours(12),
            TeuHandled = 9906 + completedTeu,
            PlanTeu = 42_000,
            AvailableEquipment = 31,
            TotalEquipment = 34,
            CranesInWork = 5,
            TrucksActive = 4,
            RailWagonsActive = 11,
            WorkersOnShift = 46,
        };
    }

    private List<HistoryPointDto> BuildHistory(long tick)
    {
        var from = Math.Max(0, tick - 450);
        var points = new List<HistoryPointDto>();
        for (var point = from; point <= tick; point += 4)
        {
            points.Add(new HistoryPointDto
            {
                At = TimeForTick(point),
                Sequence = point,
            });
        }
        if (points.Count == 0 || points[^1].Sequence != tick)
        {
            points.Add(new HistoryPointDto
            {
                At = TimeForTick(tick),
                Sequence = tick,
            });
        }
        return points;
    }

    private static StateDeltaDto BuildDelta(SnapshotDto previous, SnapshotDto next)
    {
        return new StateDeltaDto
        {
            Sequence = next.Sequence,
            ServerTime = next.ServerTime,
            Vessels = Changed(
                previous.Vessels,
                next.Vessels,
                static (a, b) =>
                    a.CompletedTeu == b.CompletedTeu
                    && a.Status == b.Status
                    && a.DeviationMinutes == b.DeviationMinutes),
            Cranes = Changed(
                previous.Cranes,
                next.Cranes,
                static (a, b) =>
                    a.SpreaderLoad == b.SpreaderLoad
                    && a.Status == b.Status
                    && a.MovesPerHour == b.MovesPerHour),
            Trucks = Changed(
                previous.Trucks,
                next.Trucks,
                static (a, b) =>
                    Math.Abs(a.Position.X - b.Position.X) < 0.01
                    && Math.Abs(a.Position.Z - b.Position.Z) < 0.01
                    && Math.Abs(a.Heading - b.Heading) < 0.01
                    && a.Status == b.Status
                    && a.Loaded == b.Loaded),
            Tugs = Changed(
                previous.Tugs,
                next.Tugs,
                static (a, b) =>
                    Math.Abs(a.Position.X - b.Position.X) < 0.01
                    && Math.Abs(a.Position.Z - b.Position.Z) < 0.01
                    && Math.Abs(a.Heading - b.Heading) < 0.1),
            Train = previous.Train.LoadedWagons == next.Train.LoadedWagons
                    && previous.Train.Status == next.Train.Status
                ? null
                : next.Train,
            Yards = Changed(
                previous.Yards,
                next.Yards,
                static (a, b) =>
                    a.OccupiedTeu == b.OccupiedTeu
                    && a.QueuedTrucks == b.QueuedTrucks
                    && a.Status == b.Status),
            Warnings = WarningsChanged(previous.Warnings, next.Warnings)
                ? next.Warnings
                : null,
            Kpis = next.Kpis,
        };
    }

    private static List<T>? Changed<T>(
        IReadOnlyList<T> previous,
        IReadOnlyList<T> next,
        Func<T, T, bool> unchanged)
        where T : EntityDto
    {
        var previousById = previous.ToDictionary(item => item.Id);
        var changed = new List<T>();
        foreach (var item in next)
        {
            if (
                !previousById.TryGetValue(item.Id, out var old)
                || !unchanged(old, item)
            )
            {
                changed.Add(item);
            }
        }
        return changed.Count > 0 ? changed : null;
    }

    private static bool WarningsChanged(
        IReadOnlyList<PortWarningDto> previous,
        IReadOnlyList<PortWarningDto> next)
    {
        if (previous.Count != next.Count)
        {
            return true;
        }
        var previousById = previous.ToDictionary(item => item.Id);
        foreach (var warning in next)
        {
            if (
                !previousById.TryGetValue(warning.Id, out var old)
                || old.Active != warning.Active
                || old.Title != warning.Title
                || old.Message != warning.Message
            )
            {
                return true;
            }
        }
        return false;
    }

    public static string SerializeSnapshot(SnapshotDto snapshot) =>
        JsonSerializer.Serialize(snapshot, JsonOptions);

    public static SnapshotDto? DeserializeSnapshot(string payload) =>
        JsonSerializer.Deserialize<SnapshotDto>(payload, JsonOptions);

    public string DescribeTick(long tick) =>
        TimeForTick(tick).ToString("O", CultureInfo.InvariantCulture);
}
