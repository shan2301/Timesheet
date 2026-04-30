namespace TimesheetAPI.Models
{
    public class WeeklyTimesheetEntry
    {
        public int Id { get; set; }

        public int WeeklyTimesheetId { get; set; }
        public WeeklyTimesheet? WeeklyTimesheet { get; set; }

        public int ProjectId { get; set; }
        public Project? Project { get; set; }

        public int TaskMasterId { get; set; }
        public TaskMaster? TaskMaster { get; set; }

        public DateTime WorkDate { get; set; }
        public decimal Hours { get; set; }

        public string? Comment { get; set; }
    }
}

