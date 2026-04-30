using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TimesheetAPI.Data;
using TimesheetAPI.Security;
using System.Security.Claims;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/user")]
    [Authorize(Roles = Roles.AdminOrManagerOrEmployee)]
    public class UserController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UserController(AppDbContext context)
        {
            _context = context;
        }

        /// <summary>Profile for the currently logged-in user.</summary>
        [HttpGet("me")]
        public IActionResult Me()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var me = _context.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new
                {
                    id = u.Id,
                    name = u.Name,
                    email = u.Email,
                    contactNumber = u.ContactNumber,
                    role = u.Role,
                    designation = u.Designation,
                    isActive = u.IsActive,
                    createdDate = u.CreatedDate,
                    manager = u.ManagerId == null
                        ? null
                        : _context.Users.Where(m => m.Id == u.ManagerId).Select(m => new { id = m.Id, name = m.Name, email = m.Email }).FirstOrDefault(),
                    departments = _context.UserDepartments
                        .AsNoTracking()
                        .Where(ud => ud.UserId == u.Id)
                        .Join(
                            _context.Departments.AsNoTracking(),
                            ud => ud.DepartmentId,
                            d => d.Id,
                            (ud, d) => new { id = d.Id, name = d.Name }
                        )
                        .OrderBy(x => x.name)
                        .ToList()
                })
                .FirstOrDefault();

            if (me == null)
                return NotFound(new { message = "User not found" });

            return Ok(me);
        }

        /// <summary>Projects the current user is assigned to (for timesheet entry).</summary>
        [Authorize(Roles = Roles.Employee)]
        [HttpGet("projects")]
        public IActionResult GetUserProjects()
        {
            var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var list = _context.UserProjects
                .AsNoTracking()
                .Where(up => up.UserId == userId)
                .Join(
                    _context.Projects.AsNoTracking(),
                    up => up.ProjectId,
                    p => p.Id,
                    (up, p) => new { id = p.Id, name = p.Name, p.IsActive }
                )
                .Where(x => x.IsActive)
                .OrderBy(x => x.name)
                .ToList();

            return Ok(list);
        }

        /// <summary>Active tasks that employees can use in weekly timesheets.</summary>
        [Authorize(Roles = Roles.Employee)]
        [HttpGet("tasks")]
        public IActionResult GetActiveTasks()
        {
            var list = _context.TaskMasters
                .AsNoTracking()
                .Where(t => t.IsActive)
                .OrderBy(t => t.Name)
                .Select(t => new { id = t.Id, name = t.Name })
                .ToList();

            return Ok(list);
        }
    }
}
