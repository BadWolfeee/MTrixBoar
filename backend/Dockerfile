FROM python:3.10-slim

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code
COPY . .

# Set environment variables for Flask
ENV FLASK_APP=app/main.py
ENV FLASK_RUN_HOST=0.0.0.0

# Expose the Flask port
EXPOSE 5000

# Start the Flask application
CMD ["flask", "run"]
