using System.Net;
using System.Net.Mail;

namespace TimesheetAPI.Services
{
    public class EmailService
    {
        private readonly IConfiguration _config;

        public EmailService(IConfiguration config)
        {
            _config = config;
        }

        private bool Enabled => string.Equals(_config["Smtp:Enabled"], "true", StringComparison.OrdinalIgnoreCase);

        public bool CanSend()
        {
            if (!Enabled) return false;
            return
                !string.IsNullOrWhiteSpace(_config["Smtp:Host"]) &&
                !string.IsNullOrWhiteSpace(_config["Smtp:Username"]) &&
                !string.IsNullOrWhiteSpace(_config["Smtp:Password"]) &&
                !string.IsNullOrWhiteSpace(_config["Smtp:FromEmail"]);
        }

        public void TrySend(string toEmail, string subject, string body)
        {
            if (!CanSend()) return;
            if (string.IsNullOrWhiteSpace(toEmail)) return;

            var host = _config["Smtp:Host"]!;
            var port = int.TryParse(_config["Smtp:Port"], out var p) ? p : 587;
            var username = _config["Smtp:Username"]!;
            var password = _config["Smtp:Password"]!;
            var fromEmail = _config["Smtp:FromEmail"]!;
            var fromName = _config["Smtp:FromName"] ?? "Timesheet";

            using var smtp = new SmtpClient(host, port)
            {
                EnableSsl = true,
                Credentials = new NetworkCredential(username, password)
            };

            using var msg = new MailMessage
            {
                From = new MailAddress(fromEmail, fromName),
                Subject = string.IsNullOrWhiteSpace(subject) ? "Timesheet notification" : subject,
                Body = body ?? string.Empty,
                IsBodyHtml = false
            };

            msg.To.Add(toEmail);
            smtp.Send(msg);
        }
    }
}

