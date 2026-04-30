namespace TimesheetAPI.Models
{
    public class SaveWeeklyTimesheetDto
    {
        public DateTime WeekStartDate { get; set; }
        public List<WeeklyTimesheetEntryDto> Entries { get; set; } = new();
    }

    public class WeeklyTimesheetEntryDto
    {
        public int ProjectId { get; set; }
        public int TaskMasterId { get; set; }
        public DateTime WorkDate { get; set; }
        public decimal Hours { get; set; }
        public string? Comment { get; set; }
    }
}

