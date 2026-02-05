import os
import json
import logging
from datetime import datetime
from dotenv import load_dotenv
from lib.api_client import send_to_api

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "dev").lower()
OUTPUT_FILE = "scraped_data.json"

def handle_output(data: dict):
    if APP_ENV == "prod":
        success = send_to_api(data)
        if not success:
            _save_to_local_json(data, "failed_api_calls.json")
    else:
        _save_to_local_json(data, OUTPUT_FILE)

def _save_to_local_json(data: dict, filename: str):
    existing_data = []
    if os.path.exists(filename):
        try:
            with open(filename, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            existing_data = []

    existing_data.append(data)

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)
