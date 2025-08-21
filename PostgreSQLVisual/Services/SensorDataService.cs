using Microsoft.EntityFrameworkCore;
using PostgreSQLVisual.Data; // Adjust this to match the namespace of your ApplicationDbContext
using PostgreSQLVisual.Models; // Adjust this to match the namespace where your SensorData model is located

namespace PostgreSQLVisual.Services
{
    public class SensorDataService : ISensorDataService
    {
        private readonly ApplicationDbContext _context;

        public SensorDataService(ApplicationDbContext context)
        {
            _context = context;
        }

        // Method to get all sensor data
        public async Task<IEnumerable<SensorData>> GetAllSensorDataAsync()
        {
            return await _context.SensorData.ToListAsync();
        }

        // Method to get sensor data by id
        public async Task<SensorData> GetSensorDataByIdAsync(int id)
        {
            return await _context.SensorData.FirstOrDefaultAsync(sd => sd.Id == id);
        }

        // Method to get sensor data for a specific period
        public async Task<IEnumerable<SensorData>> GetSensorDataByPeriodAsync(string period)
        {
            var utcNow = DateTime.UtcNow; // Use UTC time for comparison
            var query = _context.SensorData.AsQueryable();

            switch (period)
            {
                case "hour":
                    query = query.Where(d => d.MtTime >= utcNow.AddHours(-1));
                    break;
                case "day":
                    query = query.Where(d => d.MtTime >= utcNow.AddDays(-1));
                    break;
                case "week":
                    query = query.Where(d => d.MtTime >= utcNow.AddDays(-7));
                    break;
                case "month":
                    query = query.Where(d => d.MtTime >= utcNow.AddMonths(-1));
                    break;
                    // Add more cases as needed
            }

            return await query.ToListAsync();
        }

        // Add more methods as needed for your application
    }
}
