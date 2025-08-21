using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PostgreSQLVisual.Models

{
    [Table("sens00_view", Schema = "public")] // Ensure this matches the actual table name in your PostgreSQL database
    public class SensorData
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.None)] // Since views don't auto-generate keys
        [Column("id")] // Ensure this matches the exact case as in the database
        public long Id { get; set; }

        [Column("mt_name")]
        [MaxLength(255)]
        public string MtName { get; set; }

        [Column("mt_value")]
        [MaxLength(255)]
        public string MtValue { get; set; }

        [Column("mt_time")]
        public DateTime MtTime { get; set; }

        [Column("mt_quality")]
        [MaxLength(1)]
        public string MtQuality { get; set; }

        // Additional properties or navigation properties for relationships can be added here
    }
}
