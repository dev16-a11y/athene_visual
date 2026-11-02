using System.ComponentModel.DataAnnotations;
using NetTopologySuite.Geometries;

namespace Smarttwin.Api.Data;

public sealed class PortObjectRecord
{
    [Key]
    public string Id { get; set; } = string.Empty;

    public string Kind { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public Point Position { get; set; } = new(0, 0) { SRID = 32637 };

    public double Heading { get; set; }

    public string Status { get; set; } = "idle";

    public DateTimeOffset UpdatedAt { get; set; }

    public long Sequence { get; set; }

    public string DataJson { get; set; } = "{}";
}

public sealed class StateSnapshotRecord
{
    public long Id { get; set; }

    public long Sequence { get; set; }

    public DateTimeOffset CapturedAt { get; set; }

    public string Payload { get; set; } = "{}";
}

public sealed class WarningRecord
{
    [Key]
    public string Id { get; set; } = string.Empty;

    public string Severity { get; set; } = "warning";

    public string EntityId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public DateTimeOffset RaisedAt { get; set; }

    public bool IsActive { get; set; }
}
