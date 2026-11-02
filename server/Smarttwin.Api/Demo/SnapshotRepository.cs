using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Smarttwin.Api.Contracts;
using Smarttwin.Api.Data;

namespace Smarttwin.Api.Demo;

public sealed class SnapshotRepository(
    SmarttwinDbContext db,
    DemoSimulation simulation,
    ILogger<SnapshotRepository> logger)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    private static readonly TimeSpan Retention = TimeSpan.FromMinutes(30);

    public async Task PersistAsync(
        SnapshotDto snapshot,
        bool includeSnapshot = true,
        CancellationToken cancellationToken = default)
    {
        if (includeSnapshot)
        {
            db.StateSnapshots.Add(new StateSnapshotRecord
            {
                Sequence = snapshot.Sequence,
                CapturedAt = snapshot.ServerTime.ToUniversalTime(),
                Payload = DemoSimulation.SerializeSnapshot(snapshot),
            });
        }

        await UpsertObjectsAsync(snapshot, cancellationToken);
        await UpsertWarningsAsync(snapshot, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        if (snapshot.Sequence % 30 == 0)
        {
            var threshold = DateTimeOffset.UtcNow.Subtract(Retention);
            await db.StateSnapshots
                .Where(item => item.CapturedAt < threshold)
                .ExecuteDeleteAsync(cancellationToken);
        }
    }

    private async Task UpsertObjectsAsync(
        SnapshotDto snapshot,
        CancellationToken cancellationToken)
    {
        var existing = await db.PortObjects
            .ToDictionaryAsync(item => item.Id, cancellationToken);

        foreach (var entity in AllEntities(snapshot))
        {
            if (!existing.TryGetValue(entity.Id, out var record))
            {
                record = new PortObjectRecord { Id = entity.Id };
                db.PortObjects.Add(record);
            }

            record.Kind = entity.Kind;
            record.Name = entity.Name;
            record.Position = new Point(entity.Position.X, entity.Position.Z)
            {
                SRID = 32637,
            };
            record.Heading = entity.Heading;
            record.Status = entity.Status;
            record.UpdatedAt = entity.UpdatedAt.ToUniversalTime();
            record.Sequence = snapshot.Sequence;
            record.DataJson = JsonSerializer.Serialize(
                entity,
                entity.GetType(),
                JsonOptions);
        }
    }

    private async Task UpsertWarningsAsync(
        SnapshotDto snapshot,
        CancellationToken cancellationToken)
    {
        var existing = await db.Warnings
            .ToDictionaryAsync(item => item.Id, cancellationToken);

        foreach (var warning in snapshot.Warnings)
        {
            if (!existing.TryGetValue(warning.Id, out var record))
            {
                record = new WarningRecord { Id = warning.Id };
                db.Warnings.Add(record);
            }
            record.Severity = warning.Severity;
            record.EntityId = warning.EntityId;
            record.Title = warning.Title;
            record.Message = warning.Message;
            record.RaisedAt = warning.RaisedAt.ToUniversalTime();
            record.IsActive = warning.Active;
        }

        var activeIds = snapshot.Warnings
            .Where(warning => warning.Active)
            .Select(warning => warning.Id)
            .ToHashSet();
        foreach (var record in existing.Values)
        {
            record.IsActive = activeIds.Contains(record.Id);
        }
    }

    public async Task<HistoryInfoDto> GetHistoryAsync(
        int minutes,
        CancellationToken cancellationToken = default)
    {
        var threshold = DateTimeOffset.UtcNow.Subtract(
            TimeSpan.FromMinutes(Math.Clamp(minutes, 1, 180)));
        var points = await db.StateSnapshots
            .Where(item => item.CapturedAt >= threshold)
            .OrderBy(item => item.CapturedAt)
            .Select(item => new HistoryPointDto
            {
                At = item.CapturedAt,
                Sequence = item.Sequence,
            })
            .ToListAsync(cancellationToken);

        if (points.Count == 0)
        {
            var fallback = simulation.GetSnapshot().History;
            return new HistoryInfoDto
            {
                From = fallback.FirstOrDefault()?.At ?? DateTimeOffset.UtcNow,
                To = fallback.LastOrDefault()?.At ?? DateTimeOffset.UtcNow,
                Points = fallback,
            };
        }

        return new HistoryInfoDto
        {
            From = points[0].At,
            To = points[^1].At,
            Points = points,
        };
    }

    public async Task<SnapshotDto?> GetAtAsync(
        DateTimeOffset at,
        CancellationToken cancellationToken = default)
    {
        var utc = at.ToUniversalTime();
        var record = await db.StateSnapshots
            .Where(item => item.CapturedAt <= utc)
            .OrderByDescending(item => item.CapturedAt)
            .FirstOrDefaultAsync(cancellationToken);

        record ??= await db.StateSnapshots
            .Where(item => item.CapturedAt >= utc)
            .OrderBy(item => item.CapturedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (record is null)
        {
            return simulation.GetSnapshot();
        }

        var snapshot = DemoSimulation.DeserializeSnapshot(record.Payload);
        if (snapshot is null)
        {
            logger.LogWarning(
                "Unable to deserialize snapshot {Sequence} for history request",
                record.Sequence);
            return simulation.GetSnapshot();
        }
        return snapshot;
    }

    public async Task<bool> CanConnectAsync(CancellationToken cancellationToken) =>
        await db.Database.CanConnectAsync(cancellationToken);

    private static IEnumerable<EntityDto> AllEntities(SnapshotDto snapshot)
    {
        foreach (var vessel in snapshot.Vessels)
        {
            yield return vessel;
        }
        foreach (var crane in snapshot.Cranes)
        {
            yield return crane;
        }
        foreach (var truck in snapshot.Trucks)
        {
            yield return truck;
        }
        foreach (var tug in snapshot.Tugs)
        {
            yield return tug;
        }
        yield return snapshot.Train;
        foreach (var yard in snapshot.Yards)
        {
            yield return yard;
        }
        foreach (var warehouse in snapshot.Warehouses)
        {
            yield return warehouse;
        }
    }
}
