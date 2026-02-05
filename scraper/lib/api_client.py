import os
import httpx
import json
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL")
API_KEY = os.getenv("API_KEY")

def send_to_api(data: dict):
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json; charset=utf-8" # 明確指定 UTF-8
    }

    try:
        # httpx 會自動處理 dict 轉 json，預設就是 utf-8
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                API_URL,
                json=data, # 這裡傳入 dict，httpx 會自動處理
                headers=headers
            )
            response.raise_for_status()
            return True
    except Exception as e:
        # 這裡的 print 如果報錯，是因為終端機無法顯示中文
        print(f"Request failed: {str(e).encode('utf-8')}")

    return False
