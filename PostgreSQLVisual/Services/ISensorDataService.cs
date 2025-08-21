using PostgreSQLVisual.Models; // Adjust this to match the namespace where your SensorData model is located

namespace PostgreSQLVisual.Services
{
    public interface ISensorDataService
    {
        Task<IEnumerable<SensorData>> GetAllSensorDataAsync();
        Task<SensorData> GetSensorDataByIdAsync(int id);
        // Define more methods that your application requires
        Task<IEnumerable<SensorData>> GetSensorDataByPeriodAsync(string period);
    }
}
