namespace TimesheetAPI.Models
{
    public class Timesheet
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        public int ProjectId { get; set; }

        public Project? Project { get; set; }

        public DateTime Date { get; set; }

        public int HoursWorked { get; set; }

        public string? Description { get; set; }

        public string Status { get; set; } = "Pending";

        public int? ApprovedBy { get; set; }
        public DateTime? ApprovedOn { get; set; }
    }
}

