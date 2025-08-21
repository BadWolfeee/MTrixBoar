from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    # You can run this directly for local testing:
    app.run(debug=True, host="0.0.0.0", port=5000)
