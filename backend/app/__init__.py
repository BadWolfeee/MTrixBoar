from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from .utils.config import settings

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    
    # Load database URL from environment/.env via pydantic Settings
    app.config['SQLALCHEMY_DATABASE_URI'] = settings.DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    # Improve resilience to dropped connections
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
    }
    
    db.init_app(app)
    
    # Import and register the API blueprint
    from .routes.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Define a default route for the homepage
    @app.route('/')
    def home():
        return "Welcome to the SCADA API!"
    
    # Health endpoint (checks DB if available)
    @app.route('/health')
    def health():
        try:
            with db.engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            return jsonify({"status": "ok", "db": "up"}), 200
        except Exception as ex:
            return jsonify({"status": "degraded", "db": "down", "error": str(ex)}), 503

    return app
