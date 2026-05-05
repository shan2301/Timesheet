using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TimesheetAPI.Models
{
    public class User
    {
        public int Id { get; set; }

        [Required]
        public string Name { get; set; }

        [Required]
        public string Email { get; set; }

        public string? ContactNumber { get; set; }

        [NotMapped]
        [Required]
        public string Password { get; set; }   // input

        public string? PasswordHash { get; set; } // stored


        public string? Designation { get; set; }

        public string Role { get; set; } = Security.Roles.Employee; // Admin | Manager | Employee
        public bool IsActive { get; set; } = true;

        public int? ManagerId { get; set; }
        public User? Manager { get; set; }
        public ICollection<User> DirectReports { get; set; } = new List<User>();

        public DateTime CreatedDate { get; set; }

        public ICollection<UserProject> UserProjects { get; set; } = new List<UserProject>();

        public ICollection<UserDepartment> UserDepartments { get; set; } = new List<UserDepartment>();
    }
}