using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventRankings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EventRankings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    EventId = table.Column<int>(type: "INTEGER", nullable: false),
                    TeamId = table.Column<int>(type: "INTEGER", nullable: false),
                    Rank = table.Column<int>(type: "INTEGER", nullable: false),
                    RankingPoints = table.Column<int>(type: "INTEGER", nullable: false),
                    TieBreaker1 = table.Column<double>(type: "REAL", nullable: true),
                    TieBreaker2 = table.Column<double>(type: "REAL", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventRankings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventRankings_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EventRankings_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EventRankings_EventId_Rank",
                table: "EventRankings",
                columns: new[] { "EventId", "Rank" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventRankings_EventId_TeamId",
                table: "EventRankings",
                columns: new[] { "EventId", "TeamId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventRankings_TeamId",
                table: "EventRankings",
                column: "TeamId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EventRankings");
        }
    }
}
