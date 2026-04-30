using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = Roles.Admin)]
    public class MasterDataController : ControllerBase
    {
        private readonly AppDbContext _context;

        public MasterDataController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("departments")]
        public IActionResult ListDepartments()
        {
            var list = _context.Departments
                .OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name })
                .ToList();

            return Ok(list);
        }

        [HttpGet("projects")]
        public IActionResult ListProjects()
        {
            var list = _context.Projects
                .OrderBy(p => p.Name)
                .Select(p => new { p.Id, p.Name, p.DepartmentId, p.IsActive })
                .ToList();

            return Ok(list);
        }

        [HttpGet("tasks")]
        public IActionResult ListTasks()
        {
            var list = _context.TaskMasters
                .AsNoTracking()
                .OrderBy(t => t.Name)
                .Select(t => new { t.Id, t.Name, t.IsActive })
                .ToList();

            return Ok(list);
        }

        [HttpGet("leave-policies")]
        public IActionResult ListLeavePolicies()
        {
            var list = _context.LeavePolicies
                .AsNoTracking()
                .OrderBy(x => x.Type)
                .Select(x => new { x.Id, x.Type, x.MaxUnitsPerYear })
                .ToList();

            return Ok(list);
        }

        [HttpPut("leave-policy")]
        public IActionResult UpsertLeavePolicy([FromBody] UpsertLeavePolicyDto? dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Invalid payload" });

            if (string.IsNullOrWhiteSpace(dto.Type))
                return BadRequest(new { message = "Type is required" });

            if (dto.MaxUnitsPerYear.HasValue && dto.MaxUnitsPerYear.Value < 0)
                return BadRequest(new { message = "MaxUnitsPerYear must be >= 0" });

            var normalized = dto.Type.Trim()
                .Replace(" ", "")
                .Replace("-", "")
                .Replace("_", "");

            if (!Enum.TryParse<LeaveType>(normalized, ignoreCase: true, out var parsed))
                return BadRequest(new { message = "Invalid leave type" });

            // Policies are stored by base category (half-day types map to base).
            var policyType = parsed switch
            {
                LeaveType.HalfCasualLeave => LeaveType.CasualLeave,
                LeaveType.HalfMedicalLeave => LeaveType.MedicalLeave,
                LeaveType.UnpaidHalfDayLeave => LeaveType.UnpaidLeave,
                _ => parsed
            };

            var existing = _context.LeavePolicies.FirstOrDefault(x => x.Type == policyType);
            if (existing == null)
            {
                existing = new LeavePolicy
                {
                    Type = policyType,
                    MaxUnitsPerYear = dto.MaxUnitsPerYear
                };
                _context.LeavePolicies.Add(existing);
            }
            else
            {
                existing.MaxUnitsPerYear = dto.MaxUnitsPerYear;
            }

            _context.SaveChanges();

            return Ok(new { existing.Id, existing.Type, existing.MaxUnitsPerYear });
        }

        /// <summary>User profile plus department/project mapping state for the admin detail screen.</summary>
        [HttpGet("user/{userId:int}/mapping")]
        public IActionResult GetUserMapping(int userId)
        {
            var user = _context.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new
                {
                    u.Id,
                    u.Name,
                    u.Email,
                    u.ContactNumber,
                    u.Role,
                    u.IsActive,
                    u.Designation,
                    u.ManagerId,
                    u.CreatedDate
                })
                .FirstOrDefault();

            if (user == null)
                return NotFound(new { message = "User not found" });

            var assignedDeptIds = _context.UserDepartments
                .AsNoTracking()
                .Where(ud => ud.UserId == userId)
                .Select(ud => ud.DepartmentId)
                .ToList();

            var assignedDepartments = _context.Departments
                .AsNoTracking()
                .Where(d => assignedDeptIds.Contains(d.Id))
                .OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name })
                .ToList();

            var departmentsToAdd = _context.Departments
                .AsNoTracking()
                .Where(d => !assignedDeptIds.Contains(d.Id))
                .OrderBy(d => d.Name)
                .Select(d => new { d.Id, d.Name })
                .ToList();

            var assignedProjects = _context.UserProjects
                .AsNoTracking()
                .Where(up => up.UserId == userId)
                .Join(
                    _context.Projects.AsNoTracking(),
                    up => up.ProjectId,
                    p => p.Id,
                    (up, p) => new { p.Id, p.Name, p.DepartmentId, p.IsActive }
                )
                .OrderBy(x => x.Name)
                .ToList();

            var assignedProjectIds = assignedProjects.Select(p => p.Id).ToHashSet();

            var availableProjectsQuery = _context.Projects
                .AsNoTracking()
                .Where(p => !assignedProjectIds.Contains(p.Id));

            // Managers can be mapped to any project; employees/admins require department mapping first.
            if (!string.Equals(user.Role, Roles.Manager, StringComparison.OrdinalIgnoreCase))
            {
                availableProjectsQuery = availableProjectsQuery.Where(p => assignedDeptIds.Contains(p.DepartmentId));
            }

            var availableProjects = availableProjectsQuery
                .OrderBy(p => p.Name)
                .Select(p => new { p.Id, p.Name, p.DepartmentId, p.IsActive })
                .ToList();

            var assignedEmployees = string.Equals(user.Role, Roles.Manager, StringComparison.OrdinalIgnoreCase)
                ? _context.Users
                    .AsNoTracking()
                    .Where(u => u.ManagerId == userId)
                    .OrderBy(u => u.Name)
                    .Select(u => new { u.Id, u.Name, u.Email, u.ContactNumber, u.Designation, u.IsActive })
                    .ToList()
                : null;

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

            var leaveBalances = policyTypes
                .Select(t =>
                {
                    policyMaxByType.TryGetValue(t, out var max);
                    usedByType.TryGetValue(t, out var used);
                    decimal? available = max.HasValue ? max.Value - used : null;
                    return new { type = t, maxUnitsPerYear = max, usedUnits = used, availableUnits = available, year };
                })
                .ToList();

            return Ok(new
            {
                user,
                assignedDepartments,
                assignedProjects,
                departmentsToAdd,
                availableProjects,
                assignedEmployees,
                leaveBalances
            });
        }

        [HttpPost("department")]
        public IActionResult CreateDepartment([FromBody] CreateDepartmentDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { message = "Name is required" });

            var dept = new Department { Name = dto.Name.Trim() };
            _context.Departments.Add(dept);
            _context.SaveChanges();

            return Ok(dept);
        }

        [HttpPost("project")]
        public IActionResult CreateProject([FromBody] CreateProjectDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { message = "Name is required" });

            if (dto.DepartmentId <= 0)
                return BadRequest(new { message = "DepartmentId is required" });

            if (!_context.Departments.Any(d => d.Id == dto.DepartmentId))
                return BadRequest(new { message = "Department not found" });

            var project = new Project
            {
                Name = dto.Name.Trim(),
                DepartmentId = dto.DepartmentId,
                IsActive = true
            };

            _context.Projects.Add(project);
            _context.SaveChanges();

            return Ok(project);
        }

        [HttpPost("task")]
        public IActionResult CreateTask([FromBody] CreateTaskDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { message = "Name is required" });

            var name = dto.Name.Trim();
            if (_context.TaskMasters.Any(t => t.Name == name))
                return BadRequest(new { message = "Task already exists" });

            var task = new TaskMaster
            {
                Name = name,
                IsActive = true
            };

            _context.TaskMasters.Add(task);
            _context.SaveChanges();

            return Ok(task);
        }

        [HttpPut("toggle-project/{projectId:int}")]
        public IActionResult ToggleProject(int projectId)
        {
            var project = _context.Projects.FirstOrDefault(p => p.Id == projectId);
            if (project == null)
                return NotFound(new { message = "Project not found" });

            project.IsActive = !project.IsActive;
            _context.SaveChanges();

            return Ok(new { project.Id, project.IsActive });
        }

        [HttpPost("assign-user-project")]
        public IActionResult AssignUserProject([FromQuery] int userId, [FromQuery] int projectId)
        {
            if (userId <= 0 || projectId <= 0)
                return BadRequest(new { message = "userId and projectId must be positive" });

            var targetUser = _context.Users.FirstOrDefault(u => u.Id == userId);
            if (targetUser == null)
                return NotFound(new { message = "User not found" });

            var project = _context.Projects.FirstOrDefault(p => p.Id == projectId);
            if (project == null)
                return NotFound(new { message = "Project not found" });

            if (!string.Equals(targetUser.Role, Roles.Manager, StringComparison.OrdinalIgnoreCase))
            {
                if (!_context.UserDepartments.Any(ud => ud.UserId == userId && ud.DepartmentId == project.DepartmentId))
                    return BadRequest(new { message = "Map the user to this project's department before assigning the project" });
            }

            if (_context.UserProjects.Any(x => x.UserId == userId && x.ProjectId == projectId))
                return BadRequest(new { message = "User is already assigned to this project" });

            var mapping = new UserProject
            {
                UserId = userId,
                ProjectId = projectId
            };

            _context.UserProjects.Add(mapping);
            _context.SaveChanges();

            return Ok();
        }

        [HttpPost("assign-user-department")]
        public IActionResult AssignUserDepartment([FromQuery] int userId, [FromQuery] int departmentId)
        {
            if (userId <= 0 || departmentId <= 0)
                return BadRequest(new { message = "userId and departmentId must be positive" });

            if (!_context.Users.Any(u => u.Id == userId))
                return NotFound(new { message = "User not found" });

            if (!_context.Departments.Any(d => d.Id == departmentId))
                return NotFound(new { message = "Department not found" });

            if (_context.UserDepartments.Any(x => x.UserId == userId && x.DepartmentId == departmentId))
                return BadRequest(new { message = "User is already assigned to this department" });

            var mapping = new UserDepartment
            {
                UserId = userId,
                DepartmentId = departmentId
            };

            _context.UserDepartments.Add(mapping);
            _context.SaveChanges();

            return Ok();
        }

        [HttpDelete("unassign-user-department")]
        public IActionResult UnassignUserDepartment([FromQuery] int userId, [FromQuery] int departmentId)
        {
            if (userId <= 0 || departmentId <= 0)
                return BadRequest(new { message = "userId and departmentId must be positive" });

            if (!_context.Users.Any(u => u.Id == userId))
                return NotFound(new { message = "User not found" });

            var mapping = _context.UserDepartments.FirstOrDefault(x => x.UserId == userId && x.DepartmentId == departmentId);
            if (mapping == null)
                return NotFound(new { message = "Department mapping not found" });

            // Remove any mapped projects that belong to this department to keep mappings consistent.
            var deptProjectIds = _context.Projects
                .AsNoTracking()
                .Where(p => p.DepartmentId == departmentId)
                .Select(p => p.Id)
                .ToList();

            if (deptProjectIds.Count > 0)
            {
                var userProjects = _context.UserProjects
                    .Where(up => up.UserId == userId && deptProjectIds.Contains(up.ProjectId))
                    .ToList();
                if (userProjects.Count > 0)
                {
                    _context.UserProjects.RemoveRange(userProjects);
                }
            }

            _context.UserDepartments.Remove(mapping);
            _context.SaveChanges();

            return Ok();
        }
    }
}
