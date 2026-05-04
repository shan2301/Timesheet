using System.ComponentModel.DataAnnotations;

namespace TimesheetAPI.Models
{
    public class AuditLog
    {
        public int Id { get; set; }

        /// <summary>Approved / Rejected / Updated</summary>
        [Required]
        public string Action { get; set; } = string.Empty;

        public int PerformedBy { get; set; }

        /// <summary>Timesheet / WeeklyTimesheet / LeaveRequest / User</summary>
        [Required]
        public string Entity { get; set; } = string.Empty;

        public int EntityId { get; set; }

        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

        /// <summary>Optional JSON or human-readable summary of what changed.</summary>
        public string? Details { get; set; }
    }
}
