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
using Microsoft.AspNetCore.Diagnostics;

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

// JWT config (Render env vars use double-underscore, e.g. Jwt__Key).
// HS256 requires >= 256-bit key. If missing/short, keep app running but auth will fail until configured.
var jwtKey = builder.Configuration["Jwt:Key"] ?? string.Empty;
var jwtKeyBytes = Encoding.UTF8.GetBytes(jwtKey);
if (jwtKeyBytes.Length < 32)
{
    Console.WriteLine("WARNING: Jwt:Key is missing/too short. Set Jwt__Key to >= 32 chars/bytes for HS256.");
    jwtKeyBytes = Encoding.UTF8.GetBytes("00000000000000000000000000000000"); // 32 bytes fallback
}

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
                jwtKeyBytes
            )
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<NotificationService>();

// Database connection
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        connectionString,
        sqlOptions =>
        {
            sqlOptions.CommandTimeout(120);
            sqlOptions.EnableRetryOnFailure();
        }
    )
);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        SeedData.Initialize(db);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database startup skipped: {ex.Message}");
    }
}

// Middleware
app.UseExceptionHandler(appError =>
{
    appError.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        var ex = feature?.Error;

        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            message = "Unhandled server error",
            detail = ex?.Message
        });
    });
});

app.UseSwagger();
app.UseSwaggerUI();

// "http" launch profile has no HTTPS URL; redirect middleware then logs a warning.
if (!app.Environment.IsProduction())
{
    app.UseHttpsRedirection();
}
app.UseRouting();

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/", () => "Timesheet API is live");
app.MapGet("/healthz", () => Results.Ok("healthy"));

app.Run();