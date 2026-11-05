using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smarttwin.Api.Contracts;
using Smarttwin.Api.Data;
using Smarttwin.Api.Demo;
using Smarttwin.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("Postgres")
    // Фолбэк синхронен с .env/docker-compose: локальный Postgres слушает
    // на хосте 5433 (в контейнере — 5432).
    ?? "Host=localhost;Port=5433;Database=smarttwin;Username=smarttwin;Password=smarttwin";

builder.Services.AddDbContext<SmarttwinDbContext>(options =>
    options.UseNpgsql(
        connectionString,
        npgsql =>
        {
            npgsql.UseNetTopologySuite();
            npgsql.EnableRetryOnFailure(3);
        }));

builder.Services.AddSingleton<DemoSimulation>();
builder.Services.AddScoped<SnapshotRepository>();
builder.Services.AddScoped<DemoSeeder>();
builder.Services.AddHostedService<SimulationWorker>();

builder.Services
    .AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy =
            JsonNamingPolicy.CamelCase;
    });

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var allowedOrigins =
    builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
    ];

builder.Services.AddCors(options =>
{
    options.AddPolicy(
        "web",
        policy => policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var app = builder.Build();

app.Logger.LogInformation(
    "Smarttwin API starting with database {DatabaseHost}",
    SafeDatabaseLabel(connectionString));

await ApplyMigrationsAsync(app);
await SeedDemoAsync(app);

app.UseCors("web");

app.MapGet(
    "/api/state",
    (DemoSimulation simulation) => Results.Ok(simulation.GetSnapshot()));

app.MapGet(
    "/api/state/history",
    async (
        SnapshotRepository repository,
        int? minutes,
        CancellationToken cancellationToken) =>
    {
        var history = await repository.GetHistoryAsync(
            minutes ?? 30,
            cancellationToken);
        return Results.Ok(history);
    });

app.MapGet(
    "/api/state/at",
    async (
        string? at,
        SnapshotRepository repository,
        DemoSimulation simulation,
        CancellationToken cancellationToken) =>
    {
        if (
            string.IsNullOrWhiteSpace(at)
            || !DateTimeOffset.TryParse(
                at,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var parsed)
        )
        {
            return Results.BadRequest(new { error = "at must be an ISO-8601 timestamp" });
        }

        var snapshot = await repository.GetAtAsync(parsed, cancellationToken);
        return snapshot is null
            ? Results.NotFound()
            : Results.Ok(snapshot);
    });

app.MapGet(
    "/api/health",
    async (
        SnapshotRepository repository,
        DemoSimulation simulation,
        CancellationToken cancellationToken) =>
    {
        var database = false;
        try
        {
            database = await repository.CanConnectAsync(cancellationToken);
        }
        catch
        {
            database = false;
        }

        return Results.Ok(new HealthDto
        {
            Status = database ? "ok" : "degraded",
            Database = database,
            Sequence = simulation.CurrentTick,
            ServerTime = DateTimeOffset.UtcNow,
            Simulation = "running",
        });
    });

app.MapHub<PortHub>("/hubs/port");

app.Run();

static async Task ApplyMigrationsAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<SmarttwinDbContext>();
    const int attempts = 12;
    for (var attempt = 1; attempt <= attempts; attempt += 1)
    {
        try
        {
            await db.Database.MigrateAsync();
            return;
        }
        catch (Exception exception) when (attempt < attempts)
        {
            app.Logger.LogWarning(
                exception,
                "Database migration attempt {Attempt}/{Attempts} failed; retrying",
                attempt,
                attempts);
            await Task.Delay(TimeSpan.FromSeconds(2));
        }
    }
    await db.Database.MigrateAsync();
}

static async Task SeedDemoAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var seeder = scope.ServiceProvider.GetRequiredService<DemoSeeder>();
    await seeder.SeedAsync();
}

static string SafeDatabaseLabel(string connectionString)
{
    try
    {
        var builder = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);
        return $"{builder.Host}:{builder.Port}/{builder.Database}";
    }
    catch
    {
        return "configured connection";
    }
}
