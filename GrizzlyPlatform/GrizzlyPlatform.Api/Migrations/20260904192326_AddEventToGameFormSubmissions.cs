using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventToGameFormSubmissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EventId",
                table: "GameFormSubmissions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameFormSubmissions_EventId",
                table: "GameFormSubmissions",
                column: "EventId");

            migrationBuilder.AddForeignKey(
                name: "FK_GameFormSubmissions_Events_EventId",
                table: "GameFormSubmissions",
                column: "EventId",
                principalTable: "Events",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GameFormSubmissions_Events_EventId",
                table: "GameFormSubmissions");

            migrationBuilder.DropIndex(
                name: "IX_GameFormSubmissions_EventId",
                table: "GameFormSubmissions");

            migrationBuilder.DropColumn(
                name: "EventId",
                table: "GameFormSubmissions");
        }
    }
}
