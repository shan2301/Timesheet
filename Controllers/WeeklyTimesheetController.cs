using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/weekly-timesheet")]
    [Authorize]
    public class WeeklyTimesheetController : ControllerBase
    {
        private readonly AppDbContext _context;

        public WeeklyTimesheetController(AppDbContext context)
        {
            _context = context;
        }

        private static DateTime NormalizeToMonday(DateTime date)
        {
            var d = date.Date;
            // Monday = 1, Sunday = 0
            var diff = (7 + (int)d.DayOfWeek - (int)DayOfWeek.Monday) % 7;
            return d.AddDays(-diff);
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

            var employeeIds = (
                from ud in _context.UserDepartments.AsNoTracking()
                join u in _context.Users.AsNoTracking() on ud.UserId equals u.Id
                where deptIds.Contains(ud.DepartmentId) && u.Role == Roles.Employee
                select u.Id
            )
            .Distinct()
            .ToList();

            return employeeIds
                .Concat(directReportIds)
                .Distinct()
                .ToList();
        }

        /// <summary>
        /// Manager/Admin: weekly timesheets in scope (Submitted/Approved/Rejected).
        /// Manager scope is employees in the manager's mapped departments or direct reports.
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpGet("pending")]
        public IActionResult Pending()
        {
            var managerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<WeeklyTimesheet> q = _context.WeeklyTimesheets.AsNoTracking();

            if (!User.IsInRole(Roles.Admin))
            {
                var employeeIds = GetManagerScopedEmployeeIds(managerId);
                if (employeeIds.Count == 0)
                    return Ok(Array.Empty<object>());

                q = q.Where(w => employeeIds.Contains(w.UserId));
            }

            var list = (
                from w in q
                join u in _context.Users.AsNoTracking() on w.UserId equals u.Id
                where w.Status != "Draft"
                orderby w.SubmittedAt descending
                select new
                {
                    w.Id,
                    w.UserId,
                    userName = u.Name,
                    w.WeekStartDate,
                    weekEndDate = w.WeekStartDate.AddDays(6),
                    w.Status,
                    w.SubmittedAt,
                    entryCount = _context.WeeklyTimesheetEntries.Count(e => e.WeeklyTimesheetId == w.Id),
                    totalHours = _context.WeeklyTimesheetEntries
                        .Where(e => e.WeeklyTimesheetId == w.Id)
                        .Sum(e => (decimal?)e.Hours) ?? 0m
                }
            ).ToList();

            return Ok(list);
        }

        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("approve/{id:int}")]
        public IActionResult Approve(int id)
        {
            return Review(id, "Approved");
        }

        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("reject/{id:int}")]
        public IActionResult Reject(int id)
        {
            return Review(id, "Rejected");
        }

        /// <summary>
        /// Admin/Manager: view a submitted weekly timesheet with entries.
        /// Employee: can view their own weekly timesheet.
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            var callerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var w = _context.WeeklyTimesheets
                .AsNoTracking()
                .FirstOrDefault(x => x.Id == id);

            if (w == null)
                return NotFound(new { message = "Weekly timesheet not found" });

            if (User.IsInRole(Roles.Employee) && w.UserId != callerId)
                return Forbid();

            if (User.IsInRole(Roles.Manager) && !User.IsInRole(Roles.Admin))
            {
                var allowed = GetManagerScopedEmployeeIds(callerId);
                if (allowed.Count == 0 || !allowed.Contains(w.UserId))
                    return Forbid();
            }

            var header = (
                from wt in _context.WeeklyTimesheets.AsNoTracking()
                join u in _context.Users.AsNoTracking() on wt.UserId equals u.Id
                where wt.Id == id
                select new
                {
                    wt.Id,
                    wt.UserId,
                    userName = u.Name,
                    u.Email,
                    wt.WeekStartDate,
                    weekEndDate = wt.WeekStartDate.AddDays(6),
                    wt.Status,
                    wt.SubmittedAt,
                    wt.ApprovedBy,
                    wt.ApprovedOn
                }
            ).FirstOrDefault();

            var entries = (
                from e in _context.WeeklyTimesheetEntries.AsNoTracking()
                join p in _context.Projects.AsNoTracking() on e.ProjectId equals p.Id
                join t in _context.TaskMasters.AsNoTracking() on e.TaskMasterId equals t.Id
                where e.WeeklyTimesheetId == id
                orderby e.WorkDate, p.Name, t.Name
                select new
                {
                    e.Id,
                    e.ProjectId,
                    projectName = p.Name,
                    e.TaskMasterId,
                    taskName = t.Name,
                    workDate = e.WorkDate,
                    e.Hours,
                    e.Comment
                }
            ).ToList();

            var totalHours = entries.Sum(x => (decimal)x.Hours);

            return Ok(new
            {
                header,
                entries,
                totalHours
            });
        }

        private IActionResult Review(int id, string nextStatus)
        {
            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var w = _context.WeeklyTimesheets
                .Include(x => x.Entries)
                .FirstOrDefault(x => x.Id == id);

            if (w == null)
                return NotFound(new { message = "Weekly timesheet not found" });

            if (w.Status != "Submitted")
                return BadRequest(new { message = "Only submitted weeks can be reviewed" });

            if (!User.IsInRole(Roles.Admin))
            {
                var employeeIds = GetManagerScopedEmployeeIds(reviewerId);
                if (employeeIds.Count == 0 || !employeeIds.Contains(w.UserId))
                    return Forbid();
            }

            w.Status = nextStatus;
            w.ApprovedBy = reviewerId;
            w.ApprovedOn = DateTime.UtcNow;

            _context.SaveChanges();

            return Ok(new { w.Id, w.Status, w.ApprovedBy, w.ApprovedOn });
        }

        [Authorize(Roles = Roles.Employee)]
        [HttpGet("my")]
        public IActionResult GetMy([FromQuery] DateTime weekStartDate)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var weekStart = NormalizeToMonday(weekStartDate);
            var weekEnd = weekStart.AddDays(6);

            var w = _context.WeeklyTimesheets
                .AsNoTracking()
                .Include(x => x.Entries)
                .FirstOrDefault(x => x.UserId == userId && x.WeekStartDate == weekStart);

            if (w == null)
            {
                return Ok(new
                {
                    weekStartDate = weekStart,
                    weekEndDate = weekEnd,
                    status = "Draft",
                    entries = Array.Empty<object>()
                });
            }

            var entries = w.Entries
                .OrderBy(e => e.ProjectId)
                .ThenBy(e => e.WorkDate)
                .ThenBy(e => e.TaskMasterId)
                .Select(e => new
                {
                    e.Id,
                    e.ProjectId,
                    e.TaskMasterId,
                    workDate = e.WorkDate,
                    e.Hours,
                    e.Comment
                })
                .ToList();

            return Ok(new
            {
                w.Id,
                weekStartDate = w.WeekStartDate,
                weekEndDate = weekEnd,
                w.Status,
                w.SubmittedAt,
                w.ApprovedBy,
                w.ApprovedOn,
                entries
            });
        }

        [Authorize(Roles = Roles.Employee)]
        [HttpPost("save")]
        public IActionResult Save([FromBody] SaveWeeklyTimesheetDto dto)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            if (dto == null)
                return BadRequest(new { message = "Invalid payload" });

            var weekStart = NormalizeToMonday(dto.WeekStartDate);
            var weekEnd = weekStart.AddDays(6);

            // Validate entries
            var entries = dto.Entries ?? new List<WeeklyTimesheetEntryDto>();

            foreach (var e in entries)
            {
                if (e.ProjectId <= 0) return BadRequest(new { message = "ProjectId is required" });
                if (e.TaskMasterId <= 0) return BadRequest(new { message = "TaskMasterId is required" });
                if (e.Hours <= 0) return BadRequest(new { message = "Hours must be > 0" });
                if (e.WorkDate.Date < weekStart || e.WorkDate.Date > weekEnd)
                    return BadRequest(new { message = "WorkDate must be within the selected week" });
            }

            // Validate assignments (projects)
            var projectIds = entries.Select(x => x.ProjectId).Distinct().ToList();
            if (projectIds.Count > 0)
            {
                var assigned = _context.UserProjects
                    .AsNoTracking()
                    .Where(up => up.UserId == userId && projectIds.Contains(up.ProjectId))
                    .Select(up => up.ProjectId)
                    .Distinct()
                    .ToList();

                if (assigned.Count != projectIds.Count)
                    return BadRequest(new { message = "One or more projects are not assigned to this user" });
            }

            // Validate tasks exist and are active
            var taskIds = entries.Select(x => x.TaskMasterId).Distinct().ToList();
            if (taskIds.Count > 0)
            {
                var activeTasks = _context.TaskMasters
                    .AsNoTracking()
                    .Where(t => taskIds.Contains(t.Id) && t.IsActive)
                    .Select(t => t.Id)
                    .ToList();
                if (activeTasks.Count != taskIds.Count)
                    return BadRequest(new { message = "One or more tasks are invalid or inactive" });
            }

            // Business rule: max 24 hours per day (within this weekly timesheet submission)
            var perDay = entries
                .GroupBy(x => x.WorkDate.Date)
                .Select(g => new { Day = g.Key, Hours = g.Sum(x => x.Hours) })
                .ToList();
            if (perDay.Any(x => x.Hours > 24))
                return BadRequest(new { message = "Exceeds max hours per day" });

            var w = _context.WeeklyTimesheets
                .Include(x => x.Entries)
                .FirstOrDefault(x => x.UserId == userId && x.WeekStartDate == weekStart);

            if (w == null)
            {
                w = new WeeklyTimesheet
                {
                    UserId = userId,
                    WeekStartDate = weekStart,
                    Status = "Draft"
                };
                _context.WeeklyTimesheets.Add(w);
            }

            if (w.Status != "Draft")
                return BadRequest(new { message = "Only draft weeks can be edited" });

            // Replace entries
            w.Entries.Clear();
            foreach (var e in entries)
            {
                w.Entries.Add(new WeeklyTimesheetEntry
                {
                    ProjectId = e.ProjectId,
                    TaskMasterId = e.TaskMasterId,
                    WorkDate = e.WorkDate.Date,
                    Hours = e.Hours,
                    Comment = string.IsNullOrWhiteSpace(e.Comment) ? null : e.Comment.Trim()
                });
            }

            _context.SaveChanges();

            return Ok(new { w.Id, weekStartDate = w.WeekStartDate, w.Status, entryCount = w.Entries.Count });
        }

        [Authorize(Roles = Roles.Employee)]
        [HttpPost("submit")]
        public IActionResult Submit([FromQuery] DateTime weekStartDate)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var weekStart = NormalizeToMonday(weekStartDate);

            var w = _context.WeeklyTimesheets
                .Include(x => x.Entries)
                .FirstOrDefault(x => x.UserId == userId && x.WeekStartDate == weekStart);

            if (w == null)
                return BadRequest(new { message = "No draft found for this week" });

            if (w.Status != "Draft")
                return BadRequest(new { message = "Week already submitted" });

            if (w.Entries.Count == 0)
                return BadRequest(new { message = "Add at least one entry before submitting" });

            w.Status = "Submitted";
            w.SubmittedAt = DateTime.UtcNow;

            _context.SaveChanges();

            return Ok(new { w.Id, w.Status, w.SubmittedAt });
        }
    }
}

