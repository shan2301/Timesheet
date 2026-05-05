using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using System.Security.Claims;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;
using TimesheetAPI.Services;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/weekly-timesheet")]
    [Authorize]
    public class WeeklyTimesheetController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly NotificationService _notifications;

        public WeeklyTimesheetController(AppDbContext context, NotificationService notifications)
        {
            _context = context;
            _notifications = notifications;
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

            if (w.Status != "Approved")
                return BadRequest(new { message = "Only approved weekly timesheets can be exported" });

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

        /// <summary>
        /// Export a weekly submission by id (Employee: own; Manager: scoped; Admin: any).
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
        [HttpGet("export/{id:int}")]
        public IActionResult ExportById(int id)
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

            var data = (
                from e in _context.WeeklyTimesheetEntries.AsNoTracking()
                join p in _context.Projects.AsNoTracking() on e.ProjectId equals p.Id
                join t in _context.TaskMasters.AsNoTracking() on e.TaskMasterId equals t.Id
                where e.WeeklyTimesheetId == id
                orderby e.WorkDate, p.Name, t.Name
                select new
                {
                    e.WorkDate,
                    Project = p.Name,
                    Task = t.Name,
                    e.Hours,
                    Comment = e.Comment ?? string.Empty
                }
            ).ToList();

            var header = (
                from wt in _context.WeeklyTimesheets.AsNoTracking()
                join u in _context.Users.AsNoTracking() on wt.UserId equals u.Id
                where wt.Id == id
                select new
                {
                    wt.Id,
                    wt.Status,
                    userId = u.Id,
                    userName = u.Name,
                    userEmail = u.Email,
                    wt.WeekStartDate
                }
            ).FirstOrDefault();

            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add("WeeklyTimesheet");

            sheet.Cells[1, 1].Value = "SubmissionId";
            sheet.Cells[1, 2].Value = "Employee";
            sheet.Cells[1, 3].Value = "Email";
            sheet.Cells[1, 4].Value = "WeekStart";
            sheet.Cells[1, 5].Value = "WeekEnd";
            sheet.Cells[1, 6].Value = "Status";

            if (header != null)
            {
                sheet.Cells[2, 1].Value = header.Id;
                sheet.Cells[2, 2].Value = header.userName;
                sheet.Cells[2, 3].Value = header.userEmail;
                sheet.Cells[2, 4].Value = header.WeekStartDate;
                sheet.Cells[2, 5].Value = header.WeekStartDate.AddDays(6);
                sheet.Cells[2, 6].Value = header.Status;
            }

            var startRow = 4;
            sheet.Cells[startRow, 1].Value = "Date";
            sheet.Cells[startRow, 2].Value = "Project";
            sheet.Cells[startRow, 3].Value = "Task";
            sheet.Cells[startRow, 4].Value = "Hours";
            sheet.Cells[startRow, 5].Value = "Comments";

            var row = startRow + 1;
            foreach (var e in data)
            {
                sheet.Cells[row, 1].Value = e.WorkDate;
                sheet.Cells[row, 2].Value = e.Project;
                sheet.Cells[row, 3].Value = e.Task;
                sheet.Cells[row, 4].Value = e.Hours;
                sheet.Cells[row, 5].Value = e.Comment;
                row++;
            }

            sheet.Cells[1, 1, 1, 6].Style.Font.Bold = true;
            sheet.Cells[startRow, 1, startRow, 5].Style.Font.Bold = true;

            var bytes = package.GetAsByteArray();
            var fileName = $"WeeklyTimesheet-{id}.xlsx";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        /// <summary>
        /// Employee convenience export: export the selected week (by weekStartDate) for the current user.
        /// </summary>
        [Authorize(Roles = Roles.Employee)]
        [HttpGet("export")]
        public IActionResult ExportMyWeek([FromQuery] DateTime weekStartDate)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var weekStart = NormalizeToMonday(weekStartDate);

            var w = _context.WeeklyTimesheets
                .AsNoTracking()
                .FirstOrDefault(x => x.UserId == userId && x.WeekStartDate == weekStart);

            if (w == null)
                return BadRequest(new { message = "No weekly timesheet found for this week" });

            if (w.Status != "Approved")
                return BadRequest(new { message = "Only approved weekly timesheets can be exported" });

            return ExportById(w.Id);
        }

        /// <summary>
        /// Employee: export a consolidated Excel for a given month/year (approved entries only).
        /// Filters by entry WorkDate within the month and WeeklyTimesheet.Status == Approved.
        /// </summary>
        [Authorize(Roles = Roles.Employee)]
        [HttpGet("export-month")]
        public IActionResult ExportMyMonth([FromQuery] int year, [FromQuery] int month)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            if (year < 2000 || year > 2100) return BadRequest(new { message = "Invalid year" });
            if (month < 1 || month > 12) return BadRequest(new { message = "Invalid month" });

            var start = new DateTime(year, month, 1);
            var end = start.AddMonths(1).AddDays(-1);

            var rows = (
                from wt in _context.WeeklyTimesheets.AsNoTracking()
                join e in _context.WeeklyTimesheetEntries.AsNoTracking() on wt.Id equals e.WeeklyTimesheetId
                join p in _context.Projects.AsNoTracking() on e.ProjectId equals p.Id
                join t in _context.TaskMasters.AsNoTracking() on e.TaskMasterId equals t.Id
                where wt.UserId == userId &&
                      wt.Status == "Approved" &&
                      e.WorkDate.Date >= start.Date && e.WorkDate.Date <= end.Date
                orderby e.WorkDate, p.Name, t.Name
                select new
                {
                    SubmissionId = wt.Id,
                    WeekStart = wt.WeekStartDate,
                    WorkDate = e.WorkDate,
                    Project = p.Name,
                    Task = t.Name,
                    e.Hours,
                    Comment = e.Comment ?? string.Empty
                }
            ).ToList();

            if (rows.Count == 0)
                return BadRequest(new { message = "No approved entries found for this month" });

            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add("Month");

            var employeeName = _context.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.Name)
                .FirstOrDefault() ?? $"User {userId}";

            sheet.Cells[1, 1].Value = "Month";
            sheet.Cells[1, 2].Value = "EmployeeId";
            sheet.Cells[1, 3].Value = "EmployeeName";
            sheet.Cells[2, 1].Value = $"{start:yyyy-MM}";
            sheet.Cells[2, 2].Value = userId;
            sheet.Cells[2, 3].Value = employeeName;

            var startRow = 4;
            sheet.Cells[startRow, 1].Value = "Date";
            sheet.Cells[startRow, 2].Value = "Project";
            sheet.Cells[startRow, 3].Value = "Task";
            sheet.Cells[startRow, 4].Value = "Hours";
            sheet.Cells[startRow, 5].Value = "Comments";
            sheet.Cells[startRow, 6].Value = "SubmissionId";
            sheet.Cells[startRow, 7].Value = "WeekStart";

            var r = startRow + 1;
            foreach (var x in rows)
            {
                sheet.Cells[r, 1].Value = x.WorkDate;
                sheet.Cells[r, 2].Value = x.Project;
                sheet.Cells[r, 3].Value = x.Task;
                sheet.Cells[r, 4].Value = x.Hours;
                sheet.Cells[r, 5].Value = x.Comment;
                sheet.Cells[r, 6].Value = x.SubmissionId;
                sheet.Cells[r, 7].Value = x.WeekStart;
                r++;
            }

            sheet.Cells[1, 1, 1, 3].Style.Font.Bold = true;
            sheet.Cells[startRow, 1, startRow, 7].Style.Font.Bold = true;

            var bytes = package.GetAsByteArray();
            var fileName = $"Timesheet-{start:yyyy-MM}.xlsx";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
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

            var previousStatus = w.Status;
            w.Status = nextStatus;
            w.ApprovedBy = reviewerId;
            w.ApprovedOn = DateTime.UtcNow;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = nextStatus,
                PerformedBy = reviewerId,
                Entity = "WeeklyTimesheet",
                EntityId = w.Id,
                Details =
                    $"Status: {previousStatus} -> {nextStatus}; EmployeeUserId={w.UserId}; WeekStart={w.WeekStartDate:yyyy-MM-dd}"
            });

            _context.SaveChanges();

            _notifications.Create(w.UserId, $"Your timesheet submission #{w.Id} was {w.Status}");

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

        /// <summary>
        /// Employee: list all weekly timesheets (Draft/Submitted/Approved/Rejected) with key dates.
        /// </summary>
        [Authorize(Roles = Roles.Employee)]
        [HttpGet("mine")]
        public IActionResult Mine()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var list = _context.WeeklyTimesheets
                .AsNoTracking()
                .Where(w => w.UserId == userId)
                .OrderByDescending(w => w.WeekStartDate)
                .Select(w => new
                {
                    w.Id,
                    w.WeekStartDate,
                    weekEndDate = w.WeekStartDate.AddDays(6),
                    w.Status,
                    w.SubmittedAt,
                    w.ApprovedOn
                })
                .ToList();

            return Ok(list);
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

            var managers = _notifications.GetManagersForEmployee(userId);
            var who = _notifications.GetUserDisplayName(userId);
            _notifications.CreateMany(managers, $"New timesheet submitted by {who} for week starting {weekStart:yyyy-MM-dd}");

            return Ok(new { w.Id, w.Status, w.SubmittedAt });
        }
    }
}

