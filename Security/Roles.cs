namespace TimesheetAPI.Security
{
    public static class Roles
    {
        public const string Employee = "Employee";
        public const string Manager = "Manager";
        public const string Admin = "Admin";

        // Convenience groups (compile-time constants for [Authorize(Roles = ...)])
        public const string AdminOrEmployee = Admin + "," + Employee;
        public const string AdminOrManager = Admin + "," + Manager;
        public const string ManagerOrEmployee = Manager + "," + Employee;
        public const string AdminOrManagerOrEmployee = Admin + "," + Manager + "," + Employee;
    }
}

