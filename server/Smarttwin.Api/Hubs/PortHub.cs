using Microsoft.AspNetCore.SignalR;
using Smarttwin.Api.Demo;

namespace Smarttwin.Api.Hubs;

public sealed class PortHub(DemoSimulation simulation) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("snapshot", simulation.GetSnapshot());
        await base.OnConnectedAsync();
    }

    public Task RequestSnapshot() =>
        Clients.Caller.SendAsync("snapshot", simulation.GetSnapshot());
}
