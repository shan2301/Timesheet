namespace TimesheetAPI.Models
{
    public class LeaveRequest
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public User? User { get; set; }

        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }

        public LeaveType Type { get; set; } = LeaveType.CasualLeave;
        /// <summary>
        /// Normalized category for balance/policy calculations:
        /// - HalfCasualLeave → CasualLeave
        /// - HalfMedicalLeave → MedicalLeave
        /// - UnpaidHalfDayLeave → UnpaidLeave
        /// </summary>
        public LeaveType PolicyType { get; set; } = LeaveType.CasualLeave;
        public decimal Units { get; set; } = 1.0m;
        public string? Reason { get; set; }

        public string Status { get; set; } = "Pending"; // Pending | Approved | Rejected

        public int? ReviewedById { get; set; }
        public User? ReviewedBy { get; set; }
        public DateTime? ReviewedAt { get; set; }
        public string? ReviewerComment { get; set; }
        public string? RejectionReason { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

