using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMatchSetNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SetNumber",
                table: "Matches",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SetNumber",
                table: "Matches");
        }
    }
}
