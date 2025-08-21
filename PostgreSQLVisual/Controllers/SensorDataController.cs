using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using PostgreSQLVisual.Services; // Adjust this to match the namespace of your ISensorDataService
using System.Threading.Tasks;
using PostgreSQLVisual.Services;
using PostgreSQLVisual.Models;
using Microsoft.CodeAnalysis.Elfie.Diagnostics;

namespace PostgreSQLVisual.Controllers
{
    public class SensorDataController : Controller
    {
        private readonly ISensorDataService _sensorDataService;
        private readonly ILogger<SensorDataController> _logger; // Add this line
        private readonly IWebHostEnvironment _env;

        public SensorDataController(ISensorDataService sensorDataService, ILogger<SensorDataController> logger, IWebHostEnvironment env)
        {
            _sensorDataService = sensorDataService;
            _logger = logger; // Assign the injected logger
            _env = env;
        }

        // Asynchronous action method to display all sensor data
        public async Task<IActionResult> Index(string period = null)
        {
            // Await the asynchronous operation to get the result before applying further operations
            var sensorDataList = await _sensorDataService.GetAllSensorDataAsync();

            // Now you can work with sensorDataList as an IEnumerable<SensorData>
            var query = sensorDataList.AsQueryable(); // Now this should work

            // Adjust the query based on the selected time period
            if (!string.IsNullOrEmpty(period))
            {
                var endTime = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
                var startTime = endTime;

                switch (period)
                {
                    case "hour":
                        startTime = endTime.AddHours(-1);
                        break;
                    case "day":
                        startTime = endTime.AddDays(-1);
                        break;
                    case "week":
                        startTime = endTime.AddDays(-7);
                        break;
                    case "month":
                        startTime = endTime.AddMonths(-1);
                        break;
                    case "year":
                        startTime = endTime.AddYears(-1);
                        break;
                        // Add more cases as needed
                }

                // Now filter the query based on the calculated startTime and endTime
                query = query.Where(d => d.MtTime >= startTime && d.MtTime <= endTime);
            }

            // Since query is now an IQueryable, you can directly pass it to the View
            return View(query.ToList());
        }




        // Action method to display details for a single sensor data entry
        public async Task<IActionResult> Details(int id)
        {
            var sensorData = await _sensorDataService.GetSensorDataByIdAsync(id);
            if (sensorData == null)
            {
                return NotFound();
            }
            return View(sensorData);
        }


        [HttpGet]
        public async Task<IActionResult> GetSensorDataByPeriod(string period)
        {
            try
            {
                var sensorData = await _sensorDataService.GetSensorDataByPeriodAsync(period);
                return Json(sensorData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching sensor data for period: {Period}", period);

                // Provide a detailed error in development, generic error in production
                var error = _env.IsDevelopment()
                    ? $"An error occurred: {ex.Message}. Stack Trace: {ex.StackTrace}"
                    : "An error occurred while fetching sensor data.";

                return Json(new { error });
            }
        }

        // Additional methods to interact with sensor data can be added here
    }
}

