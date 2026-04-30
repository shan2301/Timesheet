using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TimesheetAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddLeavePolicyType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PolicyType",
                table: "LeaveRequests",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "CasualLeave");

            // Backfill PolicyType based on Type (half-day types map to base category).
            migrationBuilder.Sql(@"
UPDATE LeaveRequests
SET PolicyType =
  CASE
    WHEN [Type] = 'HalfCasualLeave' THEN 'CasualLeave'
    WHEN [Type] = 'HalfMedicalLeave' THEN 'MedicalLeave'
    WHEN [Type] = 'UnpaidHalfDayLeave' THEN 'UnpaidLeave'
    WHEN [Type] IN ('CasualLeave','MedicalLeave','UnpaidLeave') THEN [Type]
    ELSE 'CasualLeave'
  END
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PolicyType",
                table: "LeaveRequests");
        }
    }
}
