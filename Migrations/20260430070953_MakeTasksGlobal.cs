using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TimesheetAPI.Migrations
{
    /// <inheritdoc />
    public partial class MakeTasksGlobal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TaskMasters_Projects_ProjectId",
                table: "TaskMasters");

            migrationBuilder.DropIndex(
                name: "IX_TaskMasters_ProjectId_Name",
                table: "TaskMasters");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "TaskMasters");

            migrationBuilder.CreateIndex(
                name: "IX_TaskMasters_Name",
                table: "TaskMasters",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TaskMasters_Name",
                table: "TaskMasters");

            migrationBuilder.AddColumn<int>(
                name: "ProjectId",
                table: "TaskMasters",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_TaskMasters_ProjectId_Name",
                table: "TaskMasters",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TaskMasters_Projects_ProjectId",
                table: "TaskMasters",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
