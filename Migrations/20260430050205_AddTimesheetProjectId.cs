using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TimesheetAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddTimesheetProjectId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProjectId",
                table: "Timesheets",
                type: "int",
                nullable: true);

            // Prefer a project already assigned to the timesheet owner
            migrationBuilder.Sql(@"
UPDATE t
SET t.ProjectId = s.ProjectId
FROM Timesheets t
INNER JOIN (
    SELECT UserId, MIN(ProjectId) AS ProjectId
    FROM UserProjects
    GROUP BY UserId
) s ON s.UserId = t.UserId
");

            // Any remaining rows: attach to the first project in the catalog (if any)
            migrationBuilder.Sql(@"
UPDATE t
SET t.ProjectId = (SELECT TOP 1 Id FROM Projects ORDER BY Id)
FROM Timesheets t
WHERE t.ProjectId IS NULL AND EXISTS (SELECT 1 FROM Projects)
");

            // Drop rows that cannot be mapped (no projects exist)
            migrationBuilder.Sql(@"DELETE FROM Timesheets WHERE ProjectId IS NULL");

            migrationBuilder.AlterColumn<int>(
                name: "ProjectId",
                table: "Timesheets",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Timesheets_ProjectId",
                table: "Timesheets",
                column: "ProjectId");

            migrationBuilder.AddForeignKey(
                name: "FK_Timesheets_Projects_ProjectId",
                table: "Timesheets",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Timesheets_Projects_ProjectId",
                table: "Timesheets");

            migrationBuilder.DropIndex(
                name: "IX_Timesheets_ProjectId",
                table: "Timesheets");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "Timesheets");
        }
    }
}
