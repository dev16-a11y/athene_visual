using System.Text.Json.Serialization;

namespace Smarttwin.Api.Contracts;

public sealed class PointDto
{
    public double X { get; set; }
    public double Z { get; set; }
}

public abstract class EntityDto
{
    public string Id { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public PointDto Position { get; set; } = new();
    public double Heading { get; set; }
    public string Status { get; set; } = "idle";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class VesselDto : EntityDto
{
    public string Cargo { get; set; } = "containers";
    public string Operation { get; set; } = "loading";
    public string Berth { get; set; } = "02";
    public int PlannedTeu { get; set; }
    public int CompletedTeu { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset PlannedFinish { get; set; }
    public int DeviationMinutes { get; set; }
    public double Loa { get; set; }
    public double Beam { get; set; }
}

public sealed class CraneDto : EntityDto
{
    public string Berth { get; set; } = "02";
    public int SpreaderLoad { get; set; }
    public int MovesPerHour { get; set; }
}

public sealed class TruckDto : EntityDto
{
    public bool Loaded { get; set; }
    public string Route { get; set; } = "yard";
}

public sealed class TugDto : EntityDto
{
    public double Course { get; set; }
}

public sealed class TrainDto : EntityDto
{
    public int Wagons { get; set; }
    public int LoadedWagons { get; set; }
}

public sealed class YardBlockDto : EntityDto
{
    public string Block { get; set; } = string.Empty;
    public int CapacityTeu { get; set; }
    public int OccupiedTeu { get; set; }
    public int QueuedTrucks { get; set; }
}

public sealed class WarehouseDto : EntityDto
{
    public string Code { get; set; } = string.Empty;
}

public sealed class PortWarningDto
{
    public string Id { get; set; } = string.Empty;
    public string Severity { get; set; } = "warning";
    public string EntityId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTimeOffset RaisedAt { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class KpisDto
{
    public DateTimeOffset PeriodStart { get; set; }
    public DateTimeOffset PeriodEnd { get; set; }
    public int TeuHandled { get; set; }
    public int PlanTeu { get; set; }
    public int AvailableEquipment { get; set; }
    public int TotalEquipment { get; set; }
    public int CranesInWork { get; set; }
    public int TrucksActive { get; set; }
    public int RailWagonsActive { get; set; }
    public int WorkersOnShift { get; set; }
}

public sealed class HistoryPointDto
{
    public DateTimeOffset At { get; set; }
    public long Sequence { get; set; }
}

public sealed class SnapshotDto
{
    public string Mode { get; set; } = "demo";
    public long Sequence { get; set; }
    public DateTimeOffset ServerTime { get; set; }
    public KpisDto Kpis { get; set; } = new();
    public List<VesselDto> Vessels { get; set; } = [];
    public List<CraneDto> Cranes { get; set; } = [];
    public List<TruckDto> Trucks { get; set; } = [];
    public List<TugDto> Tugs { get; set; } = [];
    public TrainDto Train { get; set; } = new();
    public List<YardBlockDto> Yards { get; set; } = [];
    public List<WarehouseDto> Warehouses { get; set; } = [];
    public List<PortWarningDto> Warnings { get; set; } = [];
    public List<HistoryPointDto> History { get; set; } = [];
}

public sealed class StateDeltaDto
{
    public long Sequence { get; set; }
    public DateTimeOffset ServerTime { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<VesselDto>? Vessels { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<CraneDto>? Cranes { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<TruckDto>? Trucks { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<TugDto>? Tugs { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TrainDto? Train { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<YardBlockDto>? Yards { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<PortWarningDto>? Warnings { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public KpisDto? Kpis { get; set; }
}

public sealed class HistoryInfoDto
{
    public DateTimeOffset From { get; set; }
    public DateTimeOffset To { get; set; }
    public List<HistoryPointDto> Points { get; set; } = [];
}

public sealed class HealthDto
{
    public string Status { get; set; } = "ok";
    public bool Database { get; set; }
    public long Sequence { get; set; }
    public DateTimeOffset ServerTime { get; set; }
    public string Simulation { get; set; } = "running";
}
