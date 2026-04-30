using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;
using TimesheetAPI.Services;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class LeaveController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly NotificationService _notifications;

        public LeaveController(AppDbContext context, NotificationService notifications)
        {
            _context = context;
            _notifications = notifications;
        }

        private static LeaveType NormalizePolicyType(LeaveType type)
        {
            return type switch
            {
                LeaveType.HalfCasualLeave => LeaveType.CasualLeave,
                LeaveType.HalfMedicalLeave => LeaveType.MedicalLeave,
                LeaveType.UnpaidHalfDayLeave => LeaveType.UnpaidLeave,
                _ => type
            };
        }

        private List<int> GetManagerScopedEmployeeIds(int managerId)
        {
            // Manager sees employees in the manager's mapped departments OR direct reports (ManagerId).
            var directReportIds = _context.Users
                .AsNoTracking()
                .Where(u => u.ManagerId == managerId && u.Role == Roles.Employee)
                .Select(u => u.Id)
                .Distinct()
                .ToList();

            var deptIds = _context.UserDepartments
                .AsNoTracking()
                .Where(ud => ud.UserId == managerId)
                .Select(ud => ud.DepartmentId)
                .Distinct()
                .ToList();

            if (deptIds.Count == 0)
                return directReportIds;

            var deptEmployeeIds = (
                from ud in _context.UserDepartments.AsNoTracking()
                join u in _context.Users.AsNoTracking() on ud.UserId equals u.Id
                where deptIds.Contains(ud.DepartmentId) && u.Role == Roles.Employee
                select u.Id
            )
            .Distinct()
            .ToList();

            return deptEmployeeIds
                .Concat(directReportIds)
                .Distinct()
                .ToList();
        }

        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpPost]
        public IActionResult Create([FromBody] CreateLeaveRequestDto dto)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            if (dto == null)
                return BadRequest(new { message = "Invalid payload" });

            var start = dto.StartDate.Date;
            var end = dto.EndDate.Date;
            if (start == default || end == default)
                return BadRequest(new { message = "StartDate and EndDate are required" });

            if (end < start)
                return BadRequest(new { message = "EndDate must be on or after StartDate" });

            var type = dto.Type;
            var policyType = NormalizePolicyType(type);

            var isHalfDay =
                type == LeaveType.HalfCasualLeave ||
                type == LeaveType.HalfMedicalLeave ||
                type == LeaveType.UnpaidHalfDayLeave;

            decimal unitsRequested;
            if (isHalfDay)
            {
                if (start != end)
                    return BadRequest(new { message = "Half-day leave must have the same start and end date" });
                unitsRequested = 0.5m;
            }
            else
            {
                unitsRequested = (decimal)((end - start).Days + 1);
            }

            // Policy check: max units per year per type (pending + approved count against).
            var policyMax = _context.LeavePolicies
                .AsNoTracking()
                .Where(p => p.Type == policyType)
                .Select(p => p.MaxUnitsPerYear)
                .FirstOrDefault();

            if (policyMax.HasValue)
            {
                var year = start.Year;
                var usedUnits = _context.LeaveRequests
                    .AsNoTracking()
                    .Where(lr =>
                        lr.UserId == userId &&
                        lr.PolicyType == policyType &&
                        lr.StartDate.Year == year &&
                        lr.Status != "Rejected")
                    .Sum(lr => (decimal?)lr.Units) ?? 0m;

                if (usedUnits + unitsRequested > policyMax.Value)
                    return BadRequest(new { message = $"Exceeds max allowed leaves for {policyType} (max {policyMax.Value})" });
            }

            var leave = new LeaveRequest
            {
                UserId = userId,
                StartDate = start,
                EndDate = end,
                Type = type,
                PolicyType = policyType,
                Units = unitsRequested,
                Reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim(),
                Status = "Pending",
                CreatedAt = DateTime.UtcNow
            };

            _context.LeaveRequests.Add(leave);
            _context.SaveChanges();

            var managers = _notifications.GetManagersForEmployee(userId);
            _notifications.CreateMany(managers, $"New leave request submitted by User {userId} ({policyType}) {start:yyyy-MM-dd} to {end:yyyy-MM-dd}");

            return Ok(leave);
        }

        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpGet("my")]
        public IActionResult My()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var list = _context.LeaveRequests
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new
                {
                    x.Id,
                    x.StartDate,
                    x.EndDate,
                    x.Type,
                    x.Units,
                    x.Reason,
                    x.Status,
                    x.ReviewerComment,
                    x.CreatedAt,
                    x.ReviewedAt
                })
                .ToList();

            return Ok(list);
        }

        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpGet("balance")]
        public IActionResult Balance()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var year = DateTime.UtcNow.Year;
            var policyTypes = new[] { LeaveType.CasualLeave, LeaveType.MedicalLeave, LeaveType.UnpaidLeave };

            var policyMaxByType = _context.LeavePolicies
                .AsNoTracking()
                .Where(lp => policyTypes.Contains(lp.Type))
                .Select(lp => new { lp.Type, lp.MaxUnitsPerYear })
                .ToList()
                .ToDictionary(x => x.Type, x => x.MaxUnitsPerYear);

            var usedByType = _context.LeaveRequests
                .AsNoTracking()
                .Where(lr =>
                    lr.UserId == userId &&
                    lr.StartDate.Year == year &&
                    lr.Status != "Rejected" &&
                    policyTypes.Contains(lr.PolicyType))
                .GroupBy(lr => lr.PolicyType)
                .Select(g => new { Type = g.Key, UsedUnits = g.Sum(x => x.Units) })
                .ToList()
                .ToDictionary(x => x.Type, x => x.UsedUnits);

            var rows = policyTypes
                .Select(t =>
                {
                    policyMaxByType.TryGetValue(t, out var max);
                    usedByType.TryGetValue(t, out var used);
                    decimal? available = max.HasValue ? max.Value - used : null;
                    return new { type = t, maxUnitsPerYear = max, usedUnits = used, availableUnits = available, year };
                })
                .ToList();

            return Ok(rows);
        }

        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpGet("pending")]
        public IActionResult Pending()
        {
            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<LeaveRequest> q = _context.LeaveRequests.AsNoTracking();

            if (!User.IsInRole(Roles.Admin))
            {
                var employeeIds = GetManagerScopedEmployeeIds(reviewerId);

                if (employeeIds.Count == 0)
                    return Ok(Array.Empty<object>());

                q = q.Where(lr => employeeIds.Contains(lr.UserId));
            }

            var list = (
                from lr in q
                join u in _context.Users.AsNoTracking() on lr.UserId equals u.Id
                where lr.Status == "Pending"
                orderby lr.CreatedAt descending
                select new
                {
                    lr.Id,
                    lr.UserId,
                    userName = u.Name,
                    u.Email,
                    lr.StartDate,
                    lr.EndDate,
                    lr.Type,
                    lr.Units,
                    lr.Reason,
                    lr.Status,
                    lr.CreatedAt
                }
            ).ToList();

            return Ok(list);
        }

        /// <summary>
        /// Manager/Admin: leave requests in scope (Pending/Approved/Rejected).
        /// Manager scope is employees in mapped departments or direct reports.
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpGet("inbox")]
        public IActionResult Inbox()
        {
            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<LeaveRequest> q = _context.LeaveRequests.AsNoTracking();

            if (!User.IsInRole(Roles.Admin))
            {
                var employeeIds = GetManagerScopedEmployeeIds(reviewerId);
                if (employeeIds.Count == 0)
                    return Ok(Array.Empty<object>());
                q = q.Where(lr => employeeIds.Contains(lr.UserId));
            }

            var list = (
                from lr in q
                join u in _context.Users.AsNoTracking() on lr.UserId equals u.Id
                where lr.Status != null
                orderby lr.CreatedAt descending
                select new
                {
                    lr.Id,
                    lr.UserId,
                    userName = u.Name,
                    u.Email,
                    lr.StartDate,
                    lr.EndDate,
                    lr.Type,
                    lr.Units,
                    lr.Reason,
                    lr.Status,
                    lr.CreatedAt,
                    lr.ReviewedAt,
                    lr.ReviewedById,
                    lr.ReviewerComment,
                    lr.RejectionReason
                }
            ).ToList();

            return Ok(list);
        }

        [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
        [HttpGet("{id:int}")]
        public IActionResult Get(int id)
        {
            var callerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var leave = _context.LeaveRequests
                .AsNoTracking()
                .FirstOrDefault(x => x.Id == id);

            if (leave == null)
                return NotFound(new { message = "Leave request not found" });

            if (User.IsInRole(Roles.Employee) || User.IsInRole(Roles.Manager))
            {
                if (User.IsInRole(Roles.Employee) && leave.UserId != callerId)
                    return Forbid();

                if (User.IsInRole(Roles.Manager) && leave.UserId != callerId && !User.IsInRole(Roles.Admin))
                {
                    var allowedUserIds = GetManagerScopedEmployeeIds(callerId);
                    if (allowedUserIds.Count == 0 || !allowedUserIds.Contains(leave.UserId))
                        return Forbid();
                }
            }

            var row = (
                from lr in _context.LeaveRequests.AsNoTracking()
                join u in _context.Users.AsNoTracking() on lr.UserId equals u.Id
                join rb in _context.Users.AsNoTracking() on lr.ReviewedById equals rb.Id into rbs
                from rb in rbs.DefaultIfEmpty()
                where lr.Id == id
                select new
                {
                    lr.Id,
                    lr.UserId,
                    userName = u.Name,
                    u.Email,
                    lr.StartDate,
                    lr.EndDate,
                    lr.Type,
                    lr.Units,
                    lr.Reason,
                    lr.Status,
                    lr.CreatedAt,
                    lr.ReviewedAt,
                    lr.ReviewedById,
                    reviewedByName = rb != null ? rb.Name : null,
                    lr.ReviewerComment,
                    lr.RejectionReason
                }
            ).FirstOrDefault();

            return Ok(row);
        }

        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("approve/{id:int}")]
        public IActionResult Approve(int id, [FromBody] ReviewLeaveDto? dto = null)
        {
            return Review(id, "Approved", dto);
        }

        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("reject/{id:int}")]
        public IActionResult Reject(int id, [FromBody] ReviewLeaveDto? dto = null)
        {
            return Review(id, "Rejected", dto);
        }

        private IActionResult Review(int id, string nextStatus, ReviewLeaveDto? dto)
        {
            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var leave = _context.LeaveRequests.FirstOrDefault(x => x.Id == id);
            if (leave == null)
                return NotFound(new { message = "Leave request not found" });

            if (!User.IsInRole(Roles.Admin))
            {
                // Ensure this leave belongs to an employee in manager's mapped departments.
                var allowedUserIds = GetManagerScopedEmployeeIds(reviewerId);
                if (allowedUserIds.Count == 0 || !allowedUserIds.Contains(leave.UserId))
                    return Forbid();
            }

            if (leave.Status != "Pending")
                return BadRequest(new { message = "Leave request already reviewed" });

            var comment = dto != null && !string.IsNullOrWhiteSpace(dto.Comment) ? dto.Comment.Trim() : null;
            var rejectionReason = dto != null && !string.IsNullOrWhiteSpace(dto.RejectionReason)
                ? dto.RejectionReason.Trim()
                : null;

            if (nextStatus == "Rejected" && string.IsNullOrWhiteSpace(rejectionReason))
                return BadRequest(new { message = "Rejection reason is required" });

            leave.Status = nextStatus;
            leave.ReviewedById = reviewerId;
            leave.ReviewedAt = DateTime.UtcNow;
            leave.ReviewerComment = comment;
            leave.RejectionReason = nextStatus == "Rejected" ? rejectionReason : null;

            _context.SaveChanges();

            _notifications.Create(leave.UserId, $"Your leave request #{leave.Id} was {leave.Status}");

            return Ok(new
            {
                leave.Id,
                leave.Status,
                leave.ReviewedById,
                leave.ReviewedAt,
                leave.ReviewerComment,
                leave.RejectionReason
            });
        }
    }
}

