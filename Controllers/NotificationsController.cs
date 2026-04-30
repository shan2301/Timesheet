using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TimesheetAPI.Data;
using TimesheetAPI.Security;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
    public class NotificationsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public NotificationsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public IActionResult My([FromQuery] int take = 30)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            take = Math.Clamp(take, 1, 200);

            var list = _context.Notifications
                .AsNoTracking()
                .Where(n => n.UserId == userId)
                .OrderByDescending(n => n.CreatedDate)
                .Take(take)
                .Select(n => new { n.Id, n.Message, n.IsRead, n.CreatedDate })
                .ToList();

            return Ok(list);
        }

        [HttpGet("unread-count")]
        public IActionResult UnreadCount()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var count = _context.Notifications.AsNoTracking().Count(n => n.UserId == userId && !n.IsRead);
            return Ok(new { count });
        }

        [HttpPut("{id:int}/read")]
        public IActionResult MarkRead(int id)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var n = _context.Notifications.FirstOrDefault(x => x.Id == id && x.UserId == userId);
            if (n == null) return NotFound(new { message = "Notification not found" });
            if (!n.IsRead)
            {
                n.IsRead = true;
                _context.SaveChanges();
            }
            return Ok(new { n.Id, n.IsRead });
        }

        [HttpPut("read-all")]
        public IActionResult MarkAllRead()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var unread = _context.Notifications.Where(n => n.UserId == userId && !n.IsRead).ToList();
            if (unread.Count == 0) return Ok(new { updated = 0 });

            foreach (var n in unread) n.IsRead = true;
            _context.SaveChanges();
            return Ok(new { updated = unread.Count });
        }
    }
}

