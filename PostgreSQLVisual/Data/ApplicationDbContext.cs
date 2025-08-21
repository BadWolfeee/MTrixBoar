using Microsoft.EntityFrameworkCore;
using PostgreSQLVisual.Models; // Ensure this using directive matches the namespace where your SensorData model is located

namespace PostgreSQLVisual.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        // Define your DbSets (tables) here
        // public DbSet<YourEntity> YourEntities { get; set; }// DbSet for sensor data
        public DbSet<SensorData> SensorData { get; set; } // This line maps the SensorData class to a table in your database
    }
}
