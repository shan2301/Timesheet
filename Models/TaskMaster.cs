namespace TimesheetAPI.Models
{
    public class TaskMaster
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;
    }
}

