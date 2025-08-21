from backend.app import db
from sqlalchemy import Column, Integer, String, Float, DateTime

class SensorData(db.Model):
    """
    Example model that maps to your 'sens00' table in PostgreSQL.
    Adjust column names/types as needed to match your actual schema.
    """
    __tablename__ = 'sens00'  # Make sure this matches your actual table name
    
    mt_name = Column(String, primary_key=True)
    mt_time = Column(DateTime, primary_key=True)
    mt_value = Column(String)
    mt_quality = Column(String)                  # If your table has this column

    def __repr__(self):
        return f"<SensorDate(mt_time={self.mt_time}, mt_name={self.mt_name}, mt_value={self.mt_value})>"
