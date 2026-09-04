using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class MakeSubmissionMatchOptional : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GameFormSubmissions_Matches_MatchId",
                table: "GameFormSubmissions");

            migrationBuilder.AlterColumn<int>(
                name: "MatchId",
                table: "GameFormSubmissions",
                type: "INTEGER",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AddForeignKey(
                name: "FK_GameFormSubmissions_Matches_MatchId",
                table: "GameFormSubmissions",
                column: "MatchId",
                principalTable: "Matches",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GameFormSubmissions_Matches_MatchId",
                table: "GameFormSubmissions");

            migrationBuilder.AlterColumn<int>(
                name: "MatchId",
                table: "GameFormSubmissions",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_GameFormSubmissions_Matches_MatchId",
                table: "GameFormSubmissions",
                column: "MatchId",
                principalTable: "Matches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
