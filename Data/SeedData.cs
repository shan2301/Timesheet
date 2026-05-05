using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;

namespace TimesheetAPI.Data
{
    public static class SeedData
    {
        public static void Initialize(AppDbContext db)
        {
            var adminEmail = "sundarshashank@gmail.com";

            if (!db.Users.Any(u => u.Email == adminEmail))
            {
                db.Users.Add(new User
                {
                    Name = "Admin",
                    Email = adminEmail,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("123456"),
                    Role = Roles.Admin,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });

                db.SaveChanges();
            }

            // Backfill previous role name to the new standardized role
            var legacyUsers = db.Users.Where(u => u.Role == "User").ToList();
            if (legacyUsers.Count > 0)
            {
                foreach (var u in legacyUsers)
                {
                    u.Role = Roles.Employee;
                }

                db.SaveChanges();
            }

            // If the IsActive column was just added with a default of false,
            // existing rows may all be disabled. Flip to active once in that case.
            var totalUsers = db.Users.Count();
            if (totalUsers > 0 && db.Users.All(u => !u.IsActive))
            {
                foreach (var u in db.Users)
                {
                    u.IsActive = true;
                }

                db.SaveChanges();
            }
        }
    }
}

