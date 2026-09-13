using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GrizzlyPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventAllianceCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AllianceCount",
                table: "Events",
                type: "INTEGER",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.Sql("UPDATE Events SET AllianceCount = 8 WHERE AllianceCount = 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AllianceCount",
                table: "Events");
        }
    }
}


