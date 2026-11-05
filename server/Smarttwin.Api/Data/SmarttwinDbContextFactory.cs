using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Smarttwin.Api.Data;

public sealed class SmarttwinDbContextFactory : IDesignTimeDbContextFactory<SmarttwinDbContext>
{
    public SmarttwinDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            // Фолбэк синхронен с .env/docker-compose: локальный Postgres
            // слушает на хосте 5433 (в контейнере — 5432).
            ?? "Host=localhost;Port=5433;Database=smarttwin;Username=smarttwin;Password=smarttwin";

        var options = new DbContextOptionsBuilder<SmarttwinDbContext>()
            .UseNpgsql(connectionString, npgsql => npgsql.UseNetTopologySuite())
            .Options;

        return new SmarttwinDbContext(options);
    }
}
