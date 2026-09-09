using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAllianceRankedTeams : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AllianceRankedTeam",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AllianceSelectionId = table.Column<int>(type: "INTEGER", nullable: false),
                    TeamId = table.Column<int>(type: "INTEGER", nullable: false),
                    Rank = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AllianceRankedTeam", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AllianceRankedTeam_AllianceSelections_AllianceSelectionId",
                        column: x => x.AllianceSelectionId,
                        principalTable: "AllianceSelections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AllianceRankedTeam_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AllianceRankedTeam_AllianceSelectionId",
                table: "AllianceRankedTeam",
                column: "AllianceSelectionId");

            migrationBuilder.CreateIndex(
                name: "IX_AllianceRankedTeam_TeamId",
                table: "AllianceRankedTeam",
                column: "TeamId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AllianceRankedTeam");
        }
    }
}
