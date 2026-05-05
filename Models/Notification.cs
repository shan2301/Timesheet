using System.ComponentModel.DataAnnotations;

namespace TimesheetAPI.Models
{
    public class Notification
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        [Required]
        public string Message { get; set; } = string.Empty;

        public bool IsRead { get; set; } = false;

        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    }
}

