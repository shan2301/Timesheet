namespace TimesheetAPI.Models
{
    public class Department
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public ICollection<Project> Projects { get; set; } = new List<Project>();

        public ICollection<UserDepartment> UserDepartments { get; set; } = new List<UserDepartment>();
    }
}
