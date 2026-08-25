using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueMatchConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Matches_EventId",
                table: "Matches");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_EventId_MatchType_MatchNumber_SetNumber",
                table: "Matches",
                columns: new[] { "EventId", "MatchType", "MatchNumber", "SetNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Matches_EventId_MatchType_MatchNumber_SetNumber",
                table: "Matches");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_EventId",
                table: "Matches",
                column: "EventId");
        }
    }
}
