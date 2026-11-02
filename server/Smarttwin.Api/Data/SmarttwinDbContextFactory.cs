using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Smarttwin.Api.Data;

public sealed class SmarttwinDbContextFactory : IDesignTimeDbContextFactory<SmarttwinDbContext>
{
    public SmarttwinDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            ?? "Host=localhost;Port=5432;Database=smarttwin;Username=smarttwin;Password=smarttwin";

        var options = new DbContextOptionsBuilder<SmarttwinDbContext>()
            .UseNpgsql(connectionString, npgsql => npgsql.UseNetTopologySuite())
            .Options;

        return new SmarttwinDbContext(options);
    }
}
