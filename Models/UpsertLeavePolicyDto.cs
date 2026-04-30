namespace TimesheetAPI.Models
{
    public class UpsertLeavePolicyDto
    {
        public string Type { get; set; } = "";
        public decimal? MaxUnitsPerYear { get; set; }
    }
}

