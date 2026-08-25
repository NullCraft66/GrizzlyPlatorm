using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGameFormFieldTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameFormFields",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    GameFormId = table.Column<int>(type: "INTEGER", nullable: false),
                    Question = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false),
                    FieldType = table.Column<int>(type: "INTEGER", nullable: false),
                    Required = table.Column<bool>(type: "INTEGER", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameFormFields", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameFormFields_GameForms_GameFormId",
                        column: x => x.GameFormId,
                        principalTable: "GameForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameFormFieldOptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    GameFormFieldId = table.Column<int>(type: "INTEGER", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameFormFieldOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameFormFieldOptions_GameFormFields_GameFormFieldId",
                        column: x => x.GameFormFieldId,
                        principalTable: "GameFormFields",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameFormFieldOptions_GameFormFieldId",
                table: "GameFormFieldOptions",
                column: "GameFormFieldId");

            migrationBuilder.CreateIndex(
                name: "IX_GameFormFields_GameFormId",
                table: "GameFormFields",
                column: "GameFormId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameFormFieldOptions");

            migrationBuilder.DropTable(
                name: "GameFormFields");
        }
    }
}
