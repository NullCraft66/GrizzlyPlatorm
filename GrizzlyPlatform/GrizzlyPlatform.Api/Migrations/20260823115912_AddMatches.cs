using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMatches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Matches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    EventId = table.Column<int>(type: "INTEGER", nullable: false),
                    MatchType = table.Column<string>(type: "TEXT", nullable: false),
                    MatchNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    RedTeam1Id = table.Column<int>(type: "INTEGER", nullable: false),
                    RedTeam2Id = table.Column<int>(type: "INTEGER", nullable: false),
                    RedTeam3Id = table.Column<int>(type: "INTEGER", nullable: false),
                    BlueTeam1Id = table.Column<int>(type: "INTEGER", nullable: false),
                    BlueTeam2Id = table.Column<int>(type: "INTEGER", nullable: false),
                    BlueTeam3Id = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Matches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Matches_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_BlueTeam1Id",
                        column: x => x.BlueTeam1Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_BlueTeam2Id",
                        column: x => x.BlueTeam2Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_BlueTeam3Id",
                        column: x => x.BlueTeam3Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_RedTeam1Id",
                        column: x => x.RedTeam1Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_RedTeam2Id",
                        column: x => x.RedTeam2Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Matches_Teams_RedTeam3Id",
                        column: x => x.RedTeam3Id,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Matches_BlueTeam1Id",
                table: "Matches",
                column: "BlueTeam1Id");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_BlueTeam2Id",
                table: "Matches",
                column: "BlueTeam2Id");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_BlueTeam3Id",
                table: "Matches",
                column: "BlueTeam3Id");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_EventId",
                table: "Matches",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_RedTeam1Id",
                table: "Matches",
                column: "RedTeam1Id");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_RedTeam2Id",
                table: "Matches",
                column: "RedTeam2Id");

            migrationBuilder.CreateIndex(
                name: "IX_Matches_RedTeam3Id",
                table: "Matches",
                column: "RedTeam3Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Matches");
        }
    }
}
