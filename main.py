from fastapi import FastAPI
import os
app = FastAPI()
@app.get("/")
def home():
  return {"status": "Railway is running ✅"}
if __name__ == "__main__":
  import uvicorn
  uvicorn.run(
    "main:app",
    host="0.0.0.0",
    port=int(os.environ.get("PORT",
                            3000))
  )
