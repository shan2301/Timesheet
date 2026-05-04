using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TimesheetAPI.Data;
using TimesheetAPI.Security;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = Roles.Admin)]
    public class AuditController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AuditController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public IActionResult List(
            [FromQuery] string? entity = null,
            [FromQuery] int? entityId = null,
            [FromQuery] int take = 100)
        {
            take = Math.Clamp(take, 1, 500);
            var q = _context.AuditLogs.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(entity))
                q = q.Where(a => a.Entity == entity.Trim());

            if (entityId.HasValue)
                q = q.Where(a => a.EntityId == entityId.Value);

            var rows = q
                .OrderByDescending(a => a.CreatedDate)
                .Take(take)
                .Select(a => new
                {
                    a.Id,
                    a.Action,
                    a.PerformedBy,
                    a.Entity,
                    a.EntityId,
                    a.CreatedDate,
                    a.Details
                })
                .ToList();

            return Ok(rows);
        }
    }
}
