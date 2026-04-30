using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TimesheetAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddWeeklyTimesheets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WeeklyTimesheets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    WeekStartDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<int>(type: "int", nullable: true),
                    ApprovedOn = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeeklyTimesheets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WeeklyTimesheets_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WeeklyTimesheetEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    WeeklyTimesheetId = table.Column<int>(type: "int", nullable: false),
                    ProjectId = table.Column<int>(type: "int", nullable: false),
                    TaskMasterId = table.Column<int>(type: "int", nullable: false),
                    WorkDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Hours = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Comment = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeeklyTimesheetEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WeeklyTimesheetEntries_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WeeklyTimesheetEntries_TaskMasters_TaskMasterId",
                        column: x => x.TaskMasterId,
                        principalTable: "TaskMasters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WeeklyTimesheetEntries_WeeklyTimesheets_WeeklyTimesheetId",
                        column: x => x.WeeklyTimesheetId,
                        principalTable: "WeeklyTimesheets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyTimesheetEntries_ProjectId",
                table: "WeeklyTimesheetEntries",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyTimesheetEntries_TaskMasterId",
                table: "WeeklyTimesheetEntries",
                column: "TaskMasterId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyTimesheetEntries_WeeklyTimesheetId_ProjectId_TaskMasterId_WorkDate",
                table: "WeeklyTimesheetEntries",
                columns: new[] { "WeeklyTimesheetId", "ProjectId", "TaskMasterId", "WorkDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyTimesheets_UserId_WeekStartDate",
                table: "WeeklyTimesheets",
                columns: new[] { "UserId", "WeekStartDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WeeklyTimesheetEntries");

            migrationBuilder.DropTable(
                name: "WeeklyTimesheets");
        }
    }
}
