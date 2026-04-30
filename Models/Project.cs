namespace TimesheetAPI.Models
{
    public class Project
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public int DepartmentId { get; set; }
        public Department Department { get; set; } = null!;

        public bool IsActive { get; set; } = true;

        public ICollection<UserProject> UserProjects { get; set; } = new List<UserProject>();
    }
}
