namespace TimesheetAPI.Models
{
    public class CreateProjectDto
    {
        public string Name { get; set; } = string.Empty;

        public int DepartmentId { get; set; }
    }
}
