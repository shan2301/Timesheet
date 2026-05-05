using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;
using System.Security.Claims;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // 🔐 PROTECTED
    public class TimesheetController : ControllerBase
    {
        private readonly AppDbContext _context;

        public TimesheetController(AppDbContext context)
        {
            _context = context;
        }

        // ✅ CREATE TIMESHEET (Employee, Manager — must be mapped to the project)
        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpPost]
        public IActionResult CreateTimesheet(Timesheet ts)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var day = ts.Date.Date;
            if (day == default)
                return BadRequest(new { message = "Date is required" });

            if (ts.ProjectId <= 0)
                return BadRequest(new { message = "ProjectId is required" });

            // Business rule: prevent duplicate user+date+project
            var duplicate = _context.Timesheets
                .AsNoTracking()
                .Any(t => t.UserId == userId && t.ProjectId == ts.ProjectId && t.Date.Date == day);
            if (duplicate)
                return BadRequest(new { message = "Duplicate entry for same project and date" });

            // Business rule: max hours per day (24)
            var totalHours = _context.Timesheets
                .AsNoTracking()
                .Where(t => t.UserId == userId && t.Date.Date == day)
                .Sum(t => (int?)t.HoursWorked) ?? 0;
            if (totalHours + ts.HoursWorked > 24)
                return BadRequest(new { message = "Exceeds max hours per day" });

            var projectActive = _context.Projects
                .AsNoTracking()
                .Where(p => p.Id == ts.ProjectId)
                .Select(p => new { p.Id, p.IsActive })
                .FirstOrDefault();

            if (projectActive == null)
                return BadRequest(new { message = "Project not found" });

            if (!projectActive.IsActive)
                return BadRequest(new { message = "Project is inactive" });

            var isAssigned = _context.UserProjects.Any(up => up.UserId == userId && up.ProjectId == ts.ProjectId);
            if (!isAssigned)
                return BadRequest(new { message = "You are not assigned to this project" });

            ts.UserId = userId;
            ts.Status = "Pending";

            _context.Timesheets.Add(ts);
            _context.SaveChanges();

            return Ok(ts);
        }

        // ✅ GET MY TIMESHEETS
        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpGet]
        public IActionResult GetMyTimesheets(
            int page = 1,
            int pageSize = 5,
            string? status = null
        )
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var query = _context.Timesheets
                .Where(t => t.UserId == userId);

            // 🔍 Filtering
            if (!string.IsNullOrEmpty(status))
            {
                query = query.Where(t => t.Status == status);
            }

            // 📄 Pagination
            var totalRecords = query.Count();

            var data = query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return Ok(new
            {
                totalRecords,
                page,
                pageSize,
                data
            });
        }

        /// <summary>
        /// Manager: timesheets for users in the manager's departments, on projects in those departments.
        /// Admin: all timesheets (not restricted by the manager's UserDepartments).
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpGet("manager-timesheets")]
        public IActionResult GetManagerTimesheets()
        {
            var managerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<Timesheet> timesheetQuery = _context.Timesheets.AsNoTracking();

            if (!User.IsInRole(Roles.Admin))
            {
                var deptIds = _context.UserDepartments
                    .AsNoTracking()
                    .Where(ud => ud.UserId == managerId)
                    .Select(ud => ud.DepartmentId)
                    .ToList();

                if (deptIds.Count == 0)
                    return Ok(Array.Empty<object>());

                var userIds = _context.UserDepartments
                    .AsNoTracking()
                    .Where(ud => deptIds.Contains(ud.DepartmentId))
                    .Select(ud => ud.UserId)
                    .Distinct()
                    .ToList();

                var projectIds = _context.Projects
                    .AsNoTracking()
                    .Where(p => deptIds.Contains(p.DepartmentId))
                    .Select(p => p.Id)
                    .ToList();

                if (projectIds.Count == 0)
                    return Ok(Array.Empty<object>());

                timesheetQuery = timesheetQuery
                    .Where(t => userIds.Contains(t.UserId) && projectIds.Contains(t.ProjectId));
            }

            var rows = (
                from t in timesheetQuery
                join u in _context.Users.AsNoTracking() on t.UserId equals u.Id
                join p in _context.Projects.AsNoTracking() on t.ProjectId equals p.Id
                orderby t.Date descending
                select new
                {
                    t.Id,
                    t.UserId,
                    userName = u.Name,
                    t.ProjectId,
                    projectName = p.Name,
                    t.Date,
                    t.HoursWorked,
                    t.Description,
                    t.Status
                }).ToList();

            return Ok(rows);
        }

        /// <summary>
        /// Same department scope as <see cref="GetManagerTimesheets"/> for non-admin managers.
        /// Returns null when the manager has no mappable departments/projects.
        /// </summary>
        private IQueryable<Timesheet>? ManagerTimesheetsForExport(int managerId)
        {
            var deptIds = _context.UserDepartments
                .AsNoTracking()
                .Where(ud => ud.UserId == managerId)
                .Select(ud => ud.DepartmentId)
                .Distinct()
                .ToList();

            if (deptIds.Count == 0)
                return null;

            var userIds = _context.UserDepartments
                .AsNoTracking()
                .Where(ud => deptIds.Contains(ud.DepartmentId))
                .Select(ud => ud.UserId)
                .Distinct()
                .ToList();

            var projectIds = _context.Projects
                .AsNoTracking()
                .Where(p => deptIds.Contains(p.DepartmentId))
                .Select(p => p.Id)
                .Distinct()
                .ToList();

            if (projectIds.Count == 0)
                return null;

            return _context.Timesheets
                .AsNoTracking()
                .Where(t => userIds.Contains(t.UserId) && projectIds.Contains(t.ProjectId));
        }

        /// <summary>
        /// Export legacy (daily) timesheet rows to Excel. Admin: all; Manager: department scope;
        /// Employee: own rows only.
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
        [HttpGet("export")]
        public IActionResult Export()
        {
            var callerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<Timesheet> baseQuery;
            if (User.IsInRole(Roles.Admin))
            {
                baseQuery = _context.Timesheets.AsNoTracking();
            }
            else if (User.IsInRole(Roles.Manager))
            {
                var scoped = ManagerTimesheetsForExport(callerId);
                baseQuery = scoped ?? _context.Timesheets.AsNoTracking().Where(t => false);
            }
            else
            {
                baseQuery = _context.Timesheets.AsNoTracking().Where(t => t.UserId == callerId);
            }

            // Export only approved rows.
            baseQuery = baseQuery.Where(t => t.Status == "Approved");

            var data = (
                from t in baseQuery
                join u in _context.Users.AsNoTracking() on t.UserId equals u.Id
                join p in _context.Projects.AsNoTracking() on t.ProjectId equals p.Id
                orderby t.Date descending, t.Id
                select new
                {
                    t.Id,
                    t.UserId,
                    UserName = u.Name,
                    t.ProjectId,
                    ProjectName = p.Name,
                    t.Date,
                    t.HoursWorked,
                    t.Description,
                    t.Status,
                    t.ApprovedBy,
                    t.ApprovedOn
                }
            ).ToList();

            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add("Timesheets");

            sheet.Cells[1, 1].Value = "Id";
            sheet.Cells[1, 2].Value = "UserId";
            sheet.Cells[1, 3].Value = "UserName";
            sheet.Cells[1, 4].Value = "ProjectId";
            sheet.Cells[1, 5].Value = "ProjectName";
            sheet.Cells[1, 6].Value = "Date";
            sheet.Cells[1, 7].Value = "Hours";
            sheet.Cells[1, 8].Value = "Description";
            sheet.Cells[1, 9].Value = "Status";
            sheet.Cells[1, 10].Value = "ApprovedBy";
            sheet.Cells[1, 11].Value = "ApprovedOn";

            var row = 2;
            foreach (var t in data)
            {
                sheet.Cells[row, 1].Value = t.Id;
                sheet.Cells[row, 2].Value = t.UserId;
                sheet.Cells[row, 3].Value = t.UserName;
                sheet.Cells[row, 4].Value = t.ProjectId;
                sheet.Cells[row, 5].Value = t.ProjectName;
                sheet.Cells[row, 6].Value = t.Date;
                sheet.Cells[row, 7].Value = t.HoursWorked;
                sheet.Cells[row, 8].Value = t.Description ?? string.Empty;
                sheet.Cells[row, 9].Value = t.Status;
                sheet.Cells[row, 10].Value = t.ApprovedBy;
                sheet.Cells[row, 11].Value = t.ApprovedOn;
                row++;
            }

            using (var headerRange = sheet.Cells[1, 1, 1, 11])
            {
                headerRange.Style.Font.Bold = true;
            }

            var bytes = package.GetAsByteArray();
            var fileName = $"Timesheets-{DateTime.UtcNow:yyyyMMdd}.xlsx";
            return File(
                bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileName);
        }

        /// <summary>
        /// Dashboard report: total hours by project.
        /// Admin: all timesheets.
        /// Manager: only timesheets in manager's departments (same scope as manager-timesheets).
        /// </summary>
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpGet("report/project-hours")]
        public IActionResult ReportProjectHours()
        {
            var managerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            IQueryable<Timesheet> q = _context.Timesheets.AsNoTracking();

            if (!User.IsInRole(Roles.Admin))
            {
                var deptIds = _context.UserDepartments
                    .AsNoTracking()
                    .Where(ud => ud.UserId == managerId)
                    .Select(ud => ud.DepartmentId)
                    .ToList();

                if (deptIds.Count == 0)
                    return Ok(Array.Empty<object>());

                var userIds = _context.UserDepartments
                    .AsNoTracking()
                    .Where(ud => deptIds.Contains(ud.DepartmentId))
                    .Select(ud => ud.UserId)
                    .Distinct()
                    .ToList();

                var projectIds = _context.Projects
                    .AsNoTracking()
                    .Where(p => deptIds.Contains(p.DepartmentId))
                    .Select(p => p.Id)
                    .ToList();

                if (projectIds.Count == 0)
                    return Ok(Array.Empty<object>());

                q = q.Where(t => userIds.Contains(t.UserId) && projectIds.Contains(t.ProjectId));
            }

            var rows = (
                from t in q
                join p in _context.Projects.AsNoTracking() on t.ProjectId equals p.Id
                group t by new { t.ProjectId, p.Name } into g
                orderby g.Sum(x => x.HoursWorked) descending
                select new
                {
                    projectId = g.Key.ProjectId,
                    projectName = g.Key.Name,
                    hours = g.Sum(x => x.HoursWorked)
                }
            ).ToList();

            return Ok(rows);
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpGet("admin-only")]
        public IActionResult AdminOnly()
        {
            return Ok("Welcome Admin 🔥");
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpGet("all")]
        public IActionResult GetAllTimesheets()
        {
            var data = _context.Timesheets.ToList();
            return Ok(data);
        }

        // ✅ UPDATE TIMESHEET (secure — own rows only; same roles as create)
        [Authorize(Roles = Roles.ManagerOrEmployee)]
        [HttpPut("{id}")]
        public IActionResult Update(int id, Timesheet updated)
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var existing = _context.Timesheets.FirstOrDefault(t => t.Id == id);

            if (existing == null)
                return NotFound();

            // 🔐 IMPORTANT: prevent editing others' data
            if (existing.UserId != userId)
                return Forbid();

            var day = updated.Date.Date;
            if (day == default)
                return BadRequest(new { message = "Date is required" });

            if (updated.ProjectId <= 0)
                return BadRequest(new { message = "ProjectId is required" });

            if (!_context.UserProjects.Any(up => up.UserId == userId && up.ProjectId == updated.ProjectId))
                return BadRequest(new { message = "You are not assigned to this project" });

            // Business rule: prevent duplicate user+date+project (excluding this row)
            var duplicate = _context.Timesheets
                .AsNoTracking()
                .Any(t => t.Id != id && t.UserId == userId && t.ProjectId == updated.ProjectId && t.Date.Date == day);
            if (duplicate)
                return BadRequest(new { message = "Duplicate entry for same project and date" });

            // Business rule: max hours per day (24) (excluding this row)
            var totalHours = _context.Timesheets
                .AsNoTracking()
                .Where(t => t.Id != id && t.UserId == userId && t.Date.Date == day)
                .Sum(t => (int?)t.HoursWorked) ?? 0;
            if (totalHours + updated.HoursWorked > 24)
                return BadRequest(new { message = "Exceeds max hours per day" });

            var projectActive = _context.Projects
                .AsNoTracking()
                .Where(p => p.Id == updated.ProjectId)
                .Select(p => new { p.Id, p.IsActive })
                .FirstOrDefault();

            if (projectActive == null)
                return BadRequest(new { message = "Project not found" });

            if (!projectActive.IsActive)
                return BadRequest(new { message = "Project is inactive" });

            var origDate = existing.Date;
            var origHours = existing.HoursWorked;
            var origProjectId = existing.ProjectId;
            var origDescription = existing.Description;

            existing.Date = updated.Date;
            existing.HoursWorked = updated.HoursWorked;
            existing.Description = updated.Description;
            existing.ProjectId = updated.ProjectId;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Updated",
                PerformedBy = userId,
                Entity = "Timesheet",
                EntityId = existing.Id,
                Details =
                    $"Date:{origDate:yyyy-MM-dd}->{existing.Date:yyyy-MM-dd}; " +
                    $"Hours:{origHours}->{existing.HoursWorked}; " +
                    $"ProjectId:{origProjectId}->{existing.ProjectId}; " +
                    $"Description changed={(origDescription != existing.Description)}"
            });

            _context.SaveChanges();

            return Ok(existing);
        }

        // ✅ MANAGER / ADMIN APPROVAL
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("approve/{id}")]
        public IActionResult Approve(int id)
        {
            var ts = _context.Timesheets.FirstOrDefault(t => t.Id == id);

            if (ts == null)
                return NotFound();

            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var previousStatus = ts.Status;
            ts.Status = "Approved";
            ts.ApprovedBy = reviewerId;
            ts.ApprovedOn = DateTime.UtcNow;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Approved",
                PerformedBy = reviewerId,
                Entity = "Timesheet",
                EntityId = ts.Id,
                Details = $"Status: {previousStatus} -> Approved; OwnerUserId={ts.UserId}"
            });

            _context.SaveChanges();

            return Ok(ts);
        }

        // ✅ MANAGER / ADMIN REJECTION
        [Authorize(Roles = Roles.AdminOrManager)]
        [HttpPut("reject/{id}")]
        public IActionResult Reject(int id)
        {
            var ts = _context.Timesheets.FirstOrDefault(t => t.Id == id);

            if (ts == null)
                return NotFound();

            var reviewerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
            var previousStatus = ts.Status;
            ts.Status = "Rejected";
            ts.ApprovedBy = reviewerId;
            ts.ApprovedOn = DateTime.UtcNow;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Rejected",
                PerformedBy = reviewerId,
                Entity = "Timesheet",
                EntityId = ts.Id,
                Details = $"Status: {previousStatus} -> Rejected; OwnerUserId={ts.UserId}"
            });

            _context.SaveChanges();

            return Ok(ts);
        }
    }
}

