from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"status": "Railway is running ✅"}



fastapi==0.110.0
uvicorn==0.29.0




web: uvicorn main:app --host 0.0.0.0 --port $PORT
