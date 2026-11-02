using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Smarttwin.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "port_objects",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<Point>(type: "geometry (point, 32637)", nullable: false),
                    Heading = table.Column<double>(type: "double precision", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_port_objects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "state_snapshots",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    CapturedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_state_snapshots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "warnings",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Severity = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    EntityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Message = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    RaisedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warnings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_port_objects_Kind",
                table: "port_objects",
                column: "Kind");

            migrationBuilder.CreateIndex(
                name: "IX_port_objects_Sequence",
                table: "port_objects",
                column: "Sequence");

            migrationBuilder.CreateIndex(
                name: "IX_state_snapshots_CapturedAt",
                table: "state_snapshots",
                column: "CapturedAt");

            migrationBuilder.CreateIndex(
                name: "IX_state_snapshots_Sequence",
                table: "state_snapshots",
                column: "Sequence");

            migrationBuilder.CreateIndex(
                name: "IX_warnings_IsActive",
                table: "warnings",
                column: "IsActive");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "port_objects");

            migrationBuilder.DropTable(
                name: "state_snapshots");

            migrationBuilder.DropTable(
                name: "warnings");
        }
    }
}
