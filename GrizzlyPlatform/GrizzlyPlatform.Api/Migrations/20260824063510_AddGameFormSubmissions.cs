using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGameFormSubmissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameFormSubmissions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    GameFormId = table.Column<int>(type: "INTEGER", nullable: false),
                    MatchId = table.Column<int>(type: "INTEGER", nullable: false),
                    TeamId = table.Column<int>(type: "INTEGER", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameFormSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameFormSubmissions_GameForms_GameFormId",
                        column: x => x.GameFormId,
                        principalTable: "GameForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameFormSubmissions_Matches_MatchId",
                        column: x => x.MatchId,
                        principalTable: "Matches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameFormSubmissions_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameFormAnswers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    GameFormSubmissionId = table.Column<int>(type: "INTEGER", nullable: false),
                    GameFormFieldId = table.Column<int>(type: "INTEGER", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameFormAnswers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameFormAnswers_GameFormFields_GameFormFieldId",
                        column: x => x.GameFormFieldId,
                        principalTable: "GameFormFields",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameFormAnswers_GameFormSubmissions_GameFormSubmissionId",
                        column: x => x.GameFormSubmissionId,
                        principalTable: "GameFormSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameFormAnswers_GameFormFieldId",
                table: "GameFormAnswers",
                column: "GameFormFieldId");

            migrationBuilder.CreateIndex(
                name: "IX_GameFormAnswers_GameFormSubmissionId",
                table: "GameFormAnswers",
                column: "GameFormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_GameFormSubmissions_GameFormId",
                table: "GameFormSubmissions",
                column: "GameFormId");

            migrationBuilder.CreateIndex(
                name: "IX_GameFormSubmissions_MatchId",
                table: "GameFormSubmissions",
                column: "MatchId");

            migrationBuilder.CreateIndex(
                name: "IX_GameFormSubmissions_TeamId",
                table: "GameFormSubmissions",
                column: "TeamId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameFormAnswers");

            migrationBuilder.DropTable(
                name: "GameFormSubmissions");
        }
    }
}
