namespace TimesheetAPI.Models
{
    public class LeavePolicy
    {
        public int Id { get; set; }
        public LeaveType Type { get; set; }

        /// <summary>
        /// Maximum leave units allowed per year. Null = unlimited.
        /// Units: full-day = 1 per day; half-day = 0.5.
        /// </summary>
        public decimal? MaxUnitsPerYear { get; set; }
    }
}

