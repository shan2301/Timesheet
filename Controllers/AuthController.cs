using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;
using BCrypt.Net;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace TimesheetAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        // ✅ FIXED CONSTRUCTOR
        public AuthController(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        // ✅ REGISTER
        [HttpPost("register")]
        public IActionResult Register(User user)
        {
            if (string.IsNullOrEmpty(user.Password))
                return BadRequest(new { message = "Password is required" });

            if (_context.Users.Any(u => u.Email == user.Email))
                return BadRequest(new { message = "Email already exists" });

            // Hash password
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(user.Password);

            user.Role = Roles.Employee; // default role
            user.IsActive = true;

            user.CreatedDate = DateTime.UtcNow;

            _context.Users.Add(user);
            _context.SaveChanges();

            return Ok(new { message = "User registered successfully" });
        }

        // ✅ LOGIN + JWT
        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
                return BadRequest(new { message = "Email and password are required" });

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == request.Email);

            if (user == null)
                return Unauthorized("Invalid email or password");

            if (!user.IsActive)
                return Unauthorized(new { message = "User is disabled" });

            bool isValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);

            if (!isValid)
                return Unauthorized("Invalid email or password");

            // password ok

            // 🔐 CREATE TOKEN
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role) // 🔥 ADD THIS
            };

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_configuration["Jwt:Key"])
            );

            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"],
                audience: _configuration["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(2),
                signingCredentials: creds
            );

            var jwt = new JwtSecurityTokenHandler().WriteToken(token);

            return Ok(new
            {
                message = "Login successful",
                token = jwt,
                userId = user.Id,
                email = user.Email
            });
        }

        [Authorize]
        [HttpGet("test")]
        public IActionResult Test()
        {
            return Ok("You are authenticated 🎉");
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpGet("users")]
        public IActionResult GetAllUsers()
        {
            var users = _context.Users
                .Select(u => new
                {
                    u.Id,
                    u.Name,
                    u.Email,
                    u.ContactNumber,
                    u.Role,
                    u.Designation,
                    u.ManagerId,
                    u.IsActive,
                    u.CreatedDate
                })
                .ToList();

            return Ok(users);
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpGet("users/{id:int}")]
        public IActionResult GetUser(int id)
        {
            var user = _context.Users
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    u.Id,
                    u.Name,
                    u.Email,
                    u.ContactNumber,
                    u.Role,
                    u.Designation,
                    u.ManagerId,
                    u.IsActive,
                    u.CreatedDate
                })
                .FirstOrDefault();

            if (user == null)
                return NotFound(new { message = "User not found" });

            return Ok(user);
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpPost("create-user")]
        public IActionResult CreateUser(CreateUserDto dto)
        {
            var allowedRoles = new[] { Roles.Employee, Roles.Manager, Roles.Admin };

            if (!allowedRoles.Contains(dto.Role))
                return BadRequest(new { message = "Invalid role" });

            if (_context.Users.Any(u => u.Email == dto.Email))
                return BadRequest(new { message = "Email already exists" });

            if (dto.ManagerId.HasValue)
            {
                var mgr = _context.Users.FirstOrDefault(u => u.Id == dto.ManagerId.Value);
                if (mgr == null)
                    return BadRequest(new { message = "Manager not found" });
                if (mgr.Role != Roles.Manager)
                    return BadRequest(new { message = "Assigned manager must have role Manager" });
            }

            var user = new User
            {
                Name = dto.Name,
                Email = dto.Email,
                ContactNumber = string.IsNullOrWhiteSpace(dto.ContactNumber) ? null : dto.ContactNumber.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                Role = dto.Role,
                IsActive = true,
                Designation = dto.Role == Roles.Admin
                    ? null
                    : (string.IsNullOrWhiteSpace(dto.Designation) ? null : dto.Designation.Trim()),
                ManagerId = dto.Role == Roles.Employee ? dto.ManagerId : null,
                CreatedDate = DateTime.UtcNow
            };

            _context.Users.Add(user);
            _context.SaveChanges();

            return Ok(new { message = "User created successfully" });
        }

        public class UpdateUserMetaDto
        {
            public string? Name { get; set; }
            public string? ContactNumber { get; set; }
            public string? Designation { get; set; }
            public int? ManagerId { get; set; }
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpPut("update-user-meta/{id:int}")]
        public IActionResult UpdateUserMeta(int id, [FromBody] UpdateUserMetaDto dto)
        {
            var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var user = _context.Users.FirstOrDefault(u => u.Id == id);
            if (user == null)
                return NotFound(new { message = "User not found" });

            if (dto.ManagerId.HasValue)
            {
                var mgr = _context.Users.FirstOrDefault(u => u.Id == dto.ManagerId.Value);
                if (mgr == null)
                    return BadRequest(new { message = "Manager not found" });
                if (mgr.Role != Roles.Manager)
                    return BadRequest(new { message = "Assigned manager must have role Manager" });
            }

            if (dto.Name != null)
            {
                var nextName = dto.Name.Trim();
                if (string.IsNullOrWhiteSpace(nextName))
                    return BadRequest(new { message = "Name is required" });
                user.Name = nextName;
            }

            user.ContactNumber = string.IsNullOrWhiteSpace(dto.ContactNumber) ? null : dto.ContactNumber.Trim();
            if (user.Role != Roles.Admin)
            {
                user.Designation = string.IsNullOrWhiteSpace(dto.Designation) ? null : dto.Designation.Trim();
            }
            user.ManagerId = user.Role == Roles.Employee ? dto.ManagerId : null;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Updated",
                PerformedBy = adminId,
                Entity = "User",
                EntityId = user.Id,
                Details = "Updated user metadata (name, contact, designation, manager as applicable)"
            });

            _context.SaveChanges();

            return Ok(new { user.Id, user.Name, user.Email, user.ContactNumber, user.Designation, user.ManagerId });
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpPut("update-role/{id}")]
        public IActionResult UpdateRole(int id, [FromBody] string role)
        {
            var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var allowedRoles = new[] { Roles.Employee, Roles.Manager, Roles.Admin };

            if (!allowedRoles.Contains(role))
                return BadRequest("Invalid role");

            var user = _context.Users.FirstOrDefault(u => u.Id == id);

            if (user == null)
                return NotFound();

            var previousRole = user.Role;
            user.Role = role;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Updated",
                PerformedBy = adminId,
                Entity = "User",
                EntityId = user.Id,
                Details = $"Role: {previousRole} -> {role}"
            });

            _context.SaveChanges();

            return Ok(user);
        }

        [Authorize(Roles = Roles.Admin)]
        [HttpPut("toggle-user/{id}")]
        public IActionResult ToggleUser(int id)
        {
            var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            var user = _context.Users.FirstOrDefault(u => u.Id == id);

            if (user == null)
                return NotFound();

            var previous = user.IsActive;
            user.IsActive = !user.IsActive;

            _context.AuditLogs.Add(new AuditLog
            {
                Action = "Updated",
                PerformedBy = adminId,
                Entity = "User",
                EntityId = user.Id,
                Details = $"IsActive: {previous} -> {user.IsActive}"
            });

            _context.SaveChanges();

            return Ok(new { user.Id, user.IsActive });
        }
    }
}