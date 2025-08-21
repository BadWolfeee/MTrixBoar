using Microsoft.EntityFrameworkCore;
using PostgreSQLVisual.Data;
using PostgreSQLVisual.Services; // Adjust namespace based on your project


var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// Configure Entity Framework Core with PostgreSQL
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<ISensorDataService, SensorDataService>();

builder.Services.AddLogging(loggingBuilder => {
    loggingBuilder.AddConsole()
                  .AddFilter(DbLoggerCategory.Database.Command.Name, LogLevel.Information);
});

// Add any other services your application might need here
// e.g., builder.Services.AddScoped<ISensorDataService, SensorDataService>();

var app = builder.Build();


// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
