using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAllianceSelection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AllianceSelections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    EventId = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    CurrentRound = table.Column<int>(type: "INTEGER", nullable: false),
                    CurrentAlliance = table.Column<int>(type: "INTEGER", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AllianceSelections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AllianceSelections_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AlliancePicks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AllianceSelectionId = table.Column<int>(type: "INTEGER", nullable: false),
                    AllianceNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    Round = table.Column<int>(type: "INTEGER", nullable: false),
                    PickOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    InvitingTeamId = table.Column<int>(type: "INTEGER", nullable: true),
                    InvitedTeamId = table.Column<int>(type: "INTEGER", nullable: false),
                    Result = table.Column<string>(type: "TEXT", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlliancePicks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlliancePicks_AllianceSelections_AllianceSelectionId",
                        column: x => x.AllianceSelectionId,
                        principalTable: "AllianceSelections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AlliancePicks_Teams_InvitedTeamId",
                        column: x => x.InvitedTeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AlliancePicks_Teams_InvitingTeamId",
                        column: x => x.InvitingTeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Alliances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AllianceSelectionId = table.Column<int>(type: "INTEGER", nullable: false),
                    AllianceNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    CaptainTeamId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Alliances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Alliances_AllianceSelections_AllianceSelectionId",
                        column: x => x.AllianceSelectionId,
                        principalTable: "AllianceSelections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Alliances_Teams_CaptainTeamId",
                        column: x => x.CaptainTeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AllianceMembers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AllianceId = table.Column<int>(type: "INTEGER", nullable: false),
                    TeamId = table.Column<int>(type: "INTEGER", nullable: false),
                    SelectionRound = table.Column<int>(type: "INTEGER", nullable: false),
                    SelectionOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AllianceMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AllianceMembers_Alliances_AllianceId",
                        column: x => x.AllianceId,
                        principalTable: "Alliances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AllianceMembers_Teams_TeamId",
                        column: x => x.TeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AllianceMembers_AllianceId_TeamId",
                table: "AllianceMembers",
                columns: new[] { "AllianceId", "TeamId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AllianceMembers_TeamId",
                table: "AllianceMembers",
                column: "TeamId");

            migrationBuilder.CreateIndex(
                name: "IX_AlliancePicks_AllianceSelectionId",
                table: "AlliancePicks",
                column: "AllianceSelectionId");

            migrationBuilder.CreateIndex(
                name: "IX_AlliancePicks_InvitedTeamId",
                table: "AlliancePicks",
                column: "InvitedTeamId");

            migrationBuilder.CreateIndex(
                name: "IX_AlliancePicks_InvitingTeamId",
                table: "AlliancePicks",
                column: "InvitingTeamId");

            migrationBuilder.CreateIndex(
                name: "IX_Alliances_AllianceSelectionId_AllianceNumber",
                table: "Alliances",
                columns: new[] { "AllianceSelectionId", "AllianceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Alliances_CaptainTeamId",
                table: "Alliances",
                column: "CaptainTeamId");

            migrationBuilder.CreateIndex(
                name: "IX_AllianceSelections_EventId",
                table: "AllianceSelections",
                column: "EventId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AllianceMembers");

            migrationBuilder.DropTable(
                name: "AlliancePicks");

            migrationBuilder.DropTable(
                name: "Alliances");

            migrationBuilder.DropTable(
                name: "AllianceSelections");
        }
    }
}
