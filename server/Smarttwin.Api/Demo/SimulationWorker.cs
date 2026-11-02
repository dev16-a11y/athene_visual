using Microsoft.AspNetCore.SignalR;
using Smarttwin.Api.Hubs;

namespace Smarttwin.Api.Demo;

public sealed class SimulationWorker(
    DemoSimulation simulation,
    IHubContext<PortHub> hub,
    IServiceScopeFactory scopeFactory,
    ILogger<SimulationWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(DemoSimulation.TickMilliseconds, stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var result = simulation.Advance();
                if (result is not null)
                {
                    await hub.Clients.All.SendAsync(
                        "delta",
                        result.Delta,
                        stoppingToken);

                    using var scope = scopeFactory.CreateScope();
                    var repository =
                        scope.ServiceProvider.GetRequiredService<SnapshotRepository>();
                    await repository.PersistAsync(
                        result.Snapshot,
                        cancellationToken: stoppingToken);

                    logger.LogDebug(
                        "Broadcast sequence {Sequence} at {ServerTime:O}",
                        result.Snapshot.Sequence,
                        result.Snapshot.ServerTime);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Failed to advance the demo simulation");
            }

            try
            {
                await Task.Delay(DemoSimulation.TickMilliseconds, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
