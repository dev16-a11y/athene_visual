using Microsoft.EntityFrameworkCore;
using Smarttwin.Api.Data;

namespace Smarttwin.Api.Demo;

public sealed class DemoSeeder(
    SmarttwinDbContext db,
    DemoSimulation simulation,
    SnapshotRepository repository,
    ILogger<DemoSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        // Демо-режим безусловно вытирает все три таблицы. Если когда-нибудь
        // сюда подключат реальную БД — это предупреждение должно быть видно
        // в логах раньше, чем данные пропадут молча.
        logger.LogWarning(
            "DemoSeeder: вытираю state_snapshots, port_objects, warnings перед посевом демо-данных");
        await db.StateSnapshots.ExecuteDeleteAsync(cancellationToken);
        await db.PortObjects.ExecuteDeleteAsync(cancellationToken);
        await db.Warnings.ExecuteDeleteAsync(cancellationToken);

        var lastTick = DemoSimulation.StartTick;
        for (long tick = 0; tick <= lastTick; tick += 2)
        {
            var snapshot = simulation.BuildSnapshot(tick);
            db.StateSnapshots.Add(new StateSnapshotRecord
            {
                Sequence = snapshot.Sequence,
                CapturedAt = snapshot.ServerTime.ToUniversalTime(),
                Payload = DemoSimulation.SerializeSnapshot(snapshot),
            });
        }
        await db.SaveChangesAsync(cancellationToken);

        var latest = simulation.BuildSnapshot(Math.Max(lastTick, simulation.CurrentTick));
        await repository.PersistAsync(
            latest,
            includeSnapshot: false,
            cancellationToken);

        logger.LogInformation(
            "Seeded demo history up to sequence {Sequence} at {CapturedAt:O}",
            latest.Sequence,
            latest.ServerTime);
    }
}
