using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddActiveScoutingConfiguration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ActiveScoutingConfigurations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ActivePitFormId = table.Column<int>(type: "INTEGER", nullable: true),
                    ActiveMatchFormId = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActiveScoutingConfigurations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActiveScoutingConfigurations_GameForms_ActiveMatchFormId",
                        column: x => x.ActiveMatchFormId,
                        principalTable: "GameForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ActiveScoutingConfigurations_GameForms_ActivePitFormId",
                        column: x => x.ActivePitFormId,
                        principalTable: "GameForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActiveScoutingConfigurations_ActiveMatchFormId",
                table: "ActiveScoutingConfigurations",
                column: "ActiveMatchFormId");

            migrationBuilder.CreateIndex(
                name: "IX_ActiveScoutingConfigurations_ActivePitFormId",
                table: "ActiveScoutingConfigurations",
                column: "ActivePitFormId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActiveScoutingConfigurations");
        }
    }
}
