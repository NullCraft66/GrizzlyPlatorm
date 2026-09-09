using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixAllianceSelectionModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AllianceRankedTeam_AllianceSelections_AllianceSelectionId",
                table: "AllianceRankedTeam");

            migrationBuilder.DropForeignKey(
                name: "FK_AllianceRankedTeam_Teams_TeamId",
                table: "AllianceRankedTeam");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AllianceRankedTeam",
                table: "AllianceRankedTeam");

            migrationBuilder.RenameTable(
                name: "AllianceRankedTeam",
                newName: "AllianceRankedTeams");

            migrationBuilder.RenameIndex(
                name: "IX_AllianceRankedTeam_TeamId",
                table: "AllianceRankedTeams",
                newName: "IX_AllianceRankedTeams_TeamId");

            migrationBuilder.RenameIndex(
                name: "IX_AllianceRankedTeam_AllianceSelectionId",
                table: "AllianceRankedTeams",
                newName: "IX_AllianceRankedTeams_AllianceSelectionId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AllianceRankedTeams",
                table: "AllianceRankedTeams",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AllianceRankedTeams_AllianceSelections_AllianceSelectionId",
                table: "AllianceRankedTeams",
                column: "AllianceSelectionId",
                principalTable: "AllianceSelections",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AllianceRankedTeams_Teams_TeamId",
                table: "AllianceRankedTeams",
                column: "TeamId",
                principalTable: "Teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AllianceRankedTeams_AllianceSelections_AllianceSelectionId",
                table: "AllianceRankedTeams");

            migrationBuilder.DropForeignKey(
                name: "FK_AllianceRankedTeams_Teams_TeamId",
                table: "AllianceRankedTeams");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AllianceRankedTeams",
                table: "AllianceRankedTeams");

            migrationBuilder.RenameTable(
                name: "AllianceRankedTeams",
                newName: "AllianceRankedTeam");

            migrationBuilder.RenameIndex(
                name: "IX_AllianceRankedTeams_TeamId",
                table: "AllianceRankedTeam",
                newName: "IX_AllianceRankedTeam_TeamId");

            migrationBuilder.RenameIndex(
                name: "IX_AllianceRankedTeams_AllianceSelectionId",
                table: "AllianceRankedTeam",
                newName: "IX_AllianceRankedTeam_AllianceSelectionId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AllianceRankedTeam",
                table: "AllianceRankedTeam",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AllianceRankedTeam_AllianceSelections_AllianceSelectionId",
                table: "AllianceRankedTeam",
                column: "AllianceSelectionId",
                principalTable: "AllianceSelections",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AllianceRankedTeam_Teams_TeamId",
                table: "AllianceRankedTeam",
                column: "TeamId",
                principalTable: "Teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
