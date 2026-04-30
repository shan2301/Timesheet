namespace TimesheetAPI.Models
{
    public class WeeklyTimesheet
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public User? User { get; set; }

        /// <summary>Monday of the selected week (UTC date).</summary>
        public DateTime WeekStartDate { get; set; }

        public string Status { get; set; } = "Draft"; // Draft | Submitted | Approved | Rejected
        public DateTime? SubmittedAt { get; set; }

        public int? ApprovedBy { get; set; }
        public DateTime? ApprovedOn { get; set; }

        public ICollection<WeeklyTimesheetEntry> Entries { get; set; } = new List<WeeklyTimesheetEntry>();
    }
}

