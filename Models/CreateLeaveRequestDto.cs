namespace TimesheetAPI.Models
{
    public class CreateLeaveRequestDto
    {
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public LeaveType Type { get; set; } = LeaveType.CasualLeave;
        public string? Reason { get; set; }
    }
}

