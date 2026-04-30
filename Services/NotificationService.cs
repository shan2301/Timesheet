using Microsoft.EntityFrameworkCore;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;

namespace TimesheetAPI.Services
{
    public class NotificationService
    {
        private readonly AppDbContext _context;
        private readonly EmailService _email;

        public NotificationService(AppDbContext context, EmailService email)
        {
            _context = context;
            _email = email;
        }

        public void Create(int userId, string message, string? emailSubject = null)
        {
            if (userId <= 0) return;
            if (string.IsNullOrWhiteSpace(message)) return;

            _context.Notifications.Add(new Notification
            {
                UserId = userId,
                Message = message.Trim(),
                IsRead = false,
                CreatedDate = DateTime.UtcNow
            });

            _context.SaveChanges();

            if (_email.CanSend())
            {
                var toEmail = _context.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(toEmail))
                    _email.TrySend(toEmail, emailSubject ?? "Timesheet notification", message);
            }
        }

        public void CreateMany(IEnumerable<int> userIds, string message, string? emailSubject = null)
        {
            if (string.IsNullOrWhiteSpace(message)) return;
            var ids = userIds.Where(id => id > 0).Distinct().ToList();
            if (ids.Count == 0) return;

            var now = DateTime.UtcNow;
            var msg = message.Trim();

            foreach (var id in ids)
            {
                _context.Notifications.Add(new Notification
                {
                    UserId = id,
                    Message = msg,
                    IsRead = false,
                    CreatedDate = now
                });
            }

            _context.SaveChanges();

            if (_email.CanSend())
            {
                var toEmails = _context.Users.AsNoTracking()
                    .Where(u => ids.Contains(u.Id))
                    .Select(u => u.Email)
                    .Distinct()
                    .ToList();

                foreach (var toEmail in toEmails)
                {
                    if (!string.IsNullOrWhiteSpace(toEmail))
                        _email.TrySend(toEmail, emailSubject ?? "Timesheet notification", message);
                }
            }
        }

        public List<int> GetManagersForEmployee(int employeeId)
        {
            // Notify direct manager (ManagerId), plus any managers mapped to the employee's departments.
            var directManagerId = _context.Users
                .AsNoTracking()
                .Where(u => u.Id == employeeId && u.Role == Roles.Employee)
                .Select(u => u.ManagerId)
                .FirstOrDefault();

            var deptIds = _context.UserDepartments
                .AsNoTracking()
                .Where(ud => ud.UserId == employeeId)
                .Select(ud => ud.DepartmentId)
                .Distinct()
                .ToList();

            var deptManagerIds = deptIds.Count == 0
                ? new List<int>()
                : (
                    from ud in _context.UserDepartments.AsNoTracking()
                    join u in _context.Users.AsNoTracking() on ud.UserId equals u.Id
                    where deptIds.Contains(ud.DepartmentId) && u.Role == Roles.Manager
                    select u.Id
                )
                .Distinct()
                .ToList();

            var all = deptManagerIds;
            if (directManagerId.HasValue) all.Add(directManagerId.Value);

            return all.Distinct().ToList();
        }
    }
}

