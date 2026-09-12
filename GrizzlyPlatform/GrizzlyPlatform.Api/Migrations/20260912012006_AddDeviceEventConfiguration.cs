using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDeviceEventConfiguration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ActiveEventId",
                table: "ActiveScoutingConfigurations",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ActiveSeasonId",
                table: "ActiveScoutingConfigurations",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ActiveScoutingConfigurations_ActiveEventId",
                table: "ActiveScoutingConfigurations",
                column: "ActiveEventId");

            migrationBuilder.CreateIndex(
                name: "IX_ActiveScoutingConfigurations_ActiveSeasonId",
                table: "ActiveScoutingConfigurations",
                column: "ActiveSeasonId");

            migrationBuilder.AddForeignKey(
                name: "FK_ActiveScoutingConfigurations_Events_ActiveEventId",
                table: "ActiveScoutingConfigurations",
                column: "ActiveEventId",
                principalTable: "Events",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ActiveScoutingConfigurations_Seasons_ActiveSeasonId",
                table: "ActiveScoutingConfigurations",
                column: "ActiveSeasonId",
                principalTable: "Seasons",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ActiveScoutingConfigurations_Events_ActiveEventId",
                table: "ActiveScoutingConfigurations");

            migrationBuilder.DropForeignKey(
                name: "FK_ActiveScoutingConfigurations_Seasons_ActiveSeasonId",
                table: "ActiveScoutingConfigurations");

            migrationBuilder.DropIndex(
                name: "IX_ActiveScoutingConfigurations_ActiveEventId",
                table: "ActiveScoutingConfigurations");

            migrationBuilder.DropIndex(
                name: "IX_ActiveScoutingConfigurations_ActiveSeasonId",
                table: "ActiveScoutingConfigurations");

            migrationBuilder.DropColumn(
                name: "ActiveEventId",
                table: "ActiveScoutingConfigurations");

            migrationBuilder.DropColumn(
                name: "ActiveSeasonId",
                table: "ActiveScoutingConfigurations");
        }
    }
}
