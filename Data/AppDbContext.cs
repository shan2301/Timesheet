using Microsoft.EntityFrameworkCore;
using TimesheetAPI.Models;

namespace TimesheetAPI.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Timesheet> Timesheets { get; set; }
        public DbSet<Department> Departments { get; set; }
        public DbSet<Project> Projects { get; set; }
        public DbSet<TaskMaster> TaskMasters { get; set; }
        public DbSet<LeaveRequest> LeaveRequests { get; set; }
        public DbSet<LeavePolicy> LeavePolicies { get; set; }
        public DbSet<WeeklyTimesheet> WeeklyTimesheets { get; set; }
        public DbSet<WeeklyTimesheetEntry> WeeklyTimesheetEntries { get; set; }
        public DbSet<UserProject> UserProjects { get; set; }
        public DbSet<UserDepartment> UserDepartments { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Department → Projects: one-to-many
            modelBuilder.Entity<Project>()
                .HasOne(p => p.Department)
                .WithMany(d => d.Projects)
                .HasForeignKey(p => p.DepartmentId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserProject>()
                .HasIndex(x => new { x.UserId, x.ProjectId })
                .IsUnique();

            modelBuilder.Entity<UserDepartment>()
                .HasIndex(x => new { x.UserId, x.DepartmentId })
                .IsUnique();

            modelBuilder.Entity<Timesheet>()
                .HasOne(t => t.Project)
                .WithMany()
                .HasForeignKey(t => t.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TaskMaster>()
                .HasIndex(t => t.Name)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasOne(u => u.Manager)
                .WithMany(m => m.DirectReports)
                .HasForeignKey(u => u.ManagerId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<LeaveRequest>()
                .HasOne(lr => lr.User)
                .WithMany()
                .HasForeignKey(lr => lr.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<LeaveRequest>()
                .HasOne(lr => lr.ReviewedBy)
                .WithMany()
                .HasForeignKey(lr => lr.ReviewedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<LeaveRequest>()
                .Property(lr => lr.Type)
                .HasConversion<string>();

            modelBuilder.Entity<LeaveRequest>()
                .Property(lr => lr.PolicyType)
                .HasConversion<string>();

            modelBuilder.Entity<LeavePolicy>()
                .Property(lp => lp.Type)
                .HasConversion<string>();

            modelBuilder.Entity<LeavePolicy>()
                .HasIndex(lp => lp.Type)
                .IsUnique();

            modelBuilder.Entity<WeeklyTimesheet>()
                .HasIndex(x => new { x.UserId, x.WeekStartDate })
                .IsUnique();

            modelBuilder.Entity<WeeklyTimesheetEntry>()
                .HasOne(e => e.WeeklyTimesheet)
                .WithMany(w => w.Entries)
                .HasForeignKey(e => e.WeeklyTimesheetId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<WeeklyTimesheetEntry>()
                .HasOne(e => e.Project)
                .WithMany()
                .HasForeignKey(e => e.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<WeeklyTimesheetEntry>()
                .HasOne(e => e.TaskMaster)
                .WithMany()
                .HasForeignKey(e => e.TaskMasterId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<WeeklyTimesheetEntry>()
                .HasIndex(e => new { e.WeeklyTimesheetId, e.ProjectId, e.TaskMasterId, e.WorkDate })
                .IsUnique();
        }
    }
}