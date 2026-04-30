namespace TimesheetAPI.Models
{
    public class CreateUserDto
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }
        public string Role { get; set; } // Employee / Manager / Admin
        public string? Designation { get; set; }
        public int? ManagerId { get; set; }
        public string? ContactNumber { get; set; }
    }
}

