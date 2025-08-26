from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from sqlalchemy import func, text
from backend.app.models.sensor_data import SensorData
from backend.app import db
import re

SENSOR_TABLE_RE = re.compile(r"^sens\d+$")

api_bp = Blueprint('api', __name__)

@api_bp.route('/sensor-data', methods=['GET'])
def get_sensor_data():
    """
    Simple endpoint to return all sensor data rows.
    """
    data = SensorData.query.limit(100).all()  # limit for demonstration
    # Convert the SQLAlchemy objects to a list of dicts for JSON
    result = []
    for row in data:
        result.append({
            # Create a unique identifier from the composite keys if needed:
            'uid': f"{row.mt_name}_{row.mt_time.isoformat()}" if row.mt_time else row.mt_name,
            'mt_name': row.mt_name,
            'mt_value': row.mt_value,
            'mt_time': row.mt_time.isoformat() if row.mt_time else None,
            'mt_quality': row.mt_quality
        })
    return jsonify(result)

@api_bp.route('/sensor-data/recent', methods=['GET'])
def get_recent_sensor_data():
    # Get the current time (assuming your timestamps are in UTC)
    now = datetime.utcnow()
    # Define the start time as 24 hours ago
    start_time = now - timedelta(days=1)
    
    # Query for all sensor data from the last day
    data = SensorData.query.filter(SensorData.mt_time >= start_time).all()
    
    # Serialize the data for JSON output
    result = [{
        'mt_name': row.mt_name,
        'mt_value': row.mt_value,
        'mt_time': row.mt_time.isoformat() if row.mt_time else None,
        'mt_quality': row.mt_quality
    } for row in data]
    
    return jsonify(result)

@api_bp.route('/sensor-data/filtered', methods=['GET'])
def get_filtered_sensor_data():
    sensor_type = request.args.get('sensor_type')  # e.g., "I1", "Analog", etc.
    start_time_str = request.args.get('start')
    end_time_str = request.args.get('end')
    
    filters = []
    
    # Apply sensor type filter if provided
    if sensor_type:
        filters.append(SensorData.mt_name.ilike(f'%{sensor_type}%'))
    
    # Apply time range filter if provided
    if start_time_str:
        try:
            start_time = datetime.fromisoformat(start_time_str)
            filters.append(SensorData.mt_time >= start_time)
        except Exception:
            return jsonify({'error': 'Invalid start time format'}), 400

    if end_time_str:
        try:
            end_time = datetime.fromisoformat(end_time_str)
            filters.append(SensorData.mt_time <= end_time)
        except Exception:
            return jsonify({'error': 'Invalid end time format'}), 400

    data = SensorData.query.filter(*filters).all()
    result = [{
        'mt_name': row.mt_name,
        'mt_value': row.mt_value,
        'mt_time': row.mt_time.isoformat() if row.mt_time else None,
        'mt_quality': row.mt_quality
    } for row in data]
    
    return jsonify(result)

@api_bp.route('/sensor-data/newest', methods=['GET'])
def get_newest_sensor_data():
    # Subquery: get the latest time for each sensor (grouped by mt_name)
    subq = db.session.query(
        SensorData.mt_name,
        func.max(SensorData.mt_time).label('latest_time')
    ).group_by(SensorData.mt_name).subquery()

    # Join the SensorData table with the subquery on mt_name and mt_time
    query = SensorData.query.join(
        subq,
        (SensorData.mt_name == subq.c.mt_name) & (SensorData.mt_time == subq.c.latest_time)
    )

    data = query.all()
    result = [{
        'mt_name': row.mt_name,
        'mt_value': row.mt_value,
        'mt_time': row.mt_time.isoformat() if row.mt_time else None,
        'mt_quality': row.mt_quality
    } for row in data]

    return jsonify(result)

@api_bp.route('/sensors', methods=['GET'])
def list_sensors():
    """
    Discover sensXX tables dynamically and return basic metadata for each:
    - table (real DB table name)
    - name  (display name; currently same as table, replace later if you add a metadata table)
    - approx_rows (fast approximate rowcount from pg_stat_user_tables)
    - latest (exact latest mt_time)
    """
    # Fast approximate counts for sensXX tables
    rows = db.session.execute(text("""
        SELECT relname AS table_name, n_live_tup AS approx_rows
        FROM pg_stat_user_tables
        WHERE schemaname = 'public' AND relname ~ '^sens\\d+$'
        ORDER BY relname
    """)).mappings().all()

    sensors = []
    for r in rows:
        t = r["table_name"]

        # exact latest timestamp from each table (safe-ish dynamic SQL; we validate the name)
        latest = db.session.execute(text(f'SELECT MAX(mt_time) FROM public."{t}"')).scalar()

        sensors.append({
            "table": t,
            "name": t,  # placeholder; later you can override from a sensors_meta table
            "approx_rows": r["approx_rows"],
            "latest": latest.isoformat() if latest else None,
            "notes": "",
        })

    return jsonify(sensors)

@api_bp.route('/sensor-data/by-table', methods=['GET'])
def get_sensor_data_by_table():
    """
    Query a specific sensXX table.
    Params:
      sensor: required, e.g. sens00
      start:  optional ISO datetime
      end:    optional ISO datetime
      limit:  optional int (default 1000)
    Example:
      /api/sensor-data/by-table?sensor=sens01&start=2023-02-01T00:00:00&end=2023-02-28T23:59:59&limit=500
    """
    sensor = request.args.get('sensor')
    if not sensor or not SENSOR_TABLE_RE.fullmatch(sensor):
        return jsonify({"error": "Invalid or missing 'sensor' (expected like sens00)"}), 400

    start_time_str = request.args.get('start')
    end_time_str = request.args.get('end')
    limit = int(request.args.get('limit', 1000))

    params, where = {}, []
    if start_time_str:
        try:
            start_time = datetime.fromisoformat(start_time_str)
            where.append("mt_time >= :start"); params["start"] = start_time
        except Exception:
            return jsonify({'error': 'Invalid start time format'}), 400

    if end_time_str:
        try:
            end_time = datetime.fromisoformat(end_time_str)
            where.append("mt_time <= :end"); params["end"] = end_time
        except Exception:
            return jsonify({'error': 'Invalid end time format'}), 400

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # Dynamic table name: validated by regex, then quoted as identifier
    q = text(f'''
        SELECT mt_time, mt_name, mt_value, mt_quality
        FROM public."{sensor}"
        {where_sql}
        ORDER BY mt_time ASC
        LIMIT :limit
    ''')
    params["limit"] = limit

    rows = db.session.execute(q, params).mappings().all()
    return jsonify([dict(r) for r in rows])

