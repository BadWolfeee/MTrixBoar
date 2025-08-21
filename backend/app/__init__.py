from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    
    # Adjust the URI to match your PostgreSQL credentials/database
    app.config['SQLALCHEMY_DATABASE_URI'] = "postgresql://postgres:sa1234@localhost:5432/postgres" #home admin & 5432/telemetria // work sa1234 & 5432/postgres
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    
    # Import and register the API blueprint
    from .routes.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Define a default route for the homepage
    @app.route('/')
    def home():
        return "Welcome to the SCADA API!"

    return app
