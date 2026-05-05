using OfficeOpenXml;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using TimesheetAPI.Data;
using TimesheetAPI.Models;
using TimesheetAPI.Security;
using TimesheetAPI.Services;
using System.Text;
using System.Text.Json.Serialization;

// EPPlus 5+ requires an explicit license context (use Commercial for commercial products).
ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        // Return enums as strings (e.g. "CasualLeave") so the Angular UI can match values.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    }); // ✅ IMPORTANT
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Enter JWT token like: Bearer {your token}"
    });

    options.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            new string[] {}
        }
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod()
    );
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,

            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"])
            )
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<NotificationService>();

// Database connection
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure()
    )
);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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

// Middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// "http" launch profile has no HTTPS URL; redirect middleware then logs a warning.
if (!app.Environment.IsDevelopment())
{
    //app.UseHttpsRedirection();
}

app.UseRouting();

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers().RequireCors("AllowAll"); // ✅ IMPORTANT

app.Run();