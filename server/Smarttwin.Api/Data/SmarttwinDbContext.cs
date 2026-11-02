using Microsoft.EntityFrameworkCore;

namespace Smarttwin.Api.Data;

public sealed class SmarttwinDbContext(DbContextOptions<SmarttwinDbContext> options)
    : DbContext(options)
{
    public DbSet<PortObjectRecord> PortObjects => Set<PortObjectRecord>();

    public DbSet<StateSnapshotRecord> StateSnapshots => Set<StateSnapshotRecord>();

    public DbSet<WarningRecord> Warnings => Set<WarningRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");

        modelBuilder.Entity<PortObjectRecord>(entity =>
        {
            entity.ToTable("port_objects");
            entity.Property(item => item.Id).HasMaxLength(64);
            entity.Property(item => item.Kind).HasMaxLength(32);
            entity.Property(item => item.Name).HasMaxLength(128);
            entity.Property(item => item.Status).HasMaxLength(32);
            entity.Property(item => item.Position)
                .HasColumnType("geometry (point, 32637)");
            entity.Property(item => item.DataJson).HasColumnType("jsonb");
            entity.HasIndex(item => item.Kind);
            entity.HasIndex(item => item.Sequence);
        });

        modelBuilder.Entity<StateSnapshotRecord>(entity =>
        {
            entity.ToTable("state_snapshots");
            entity.Property(item => item.Payload).HasColumnType("jsonb");
            entity.HasIndex(item => item.CapturedAt);
            entity.HasIndex(item => item.Sequence);
        });

        modelBuilder.Entity<WarningRecord>(entity =>
        {
            entity.ToTable("warnings");
            entity.Property(item => item.Id).HasMaxLength(64);
            entity.Property(item => item.Severity).HasMaxLength(16);
            entity.Property(item => item.EntityId).HasMaxLength(64);
            entity.Property(item => item.Title).HasMaxLength(256);
            entity.Property(item => item.Message).HasMaxLength(1024);
            entity.HasIndex(item => item.IsActive);
        });
    }
}
