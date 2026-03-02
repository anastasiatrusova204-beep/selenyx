import os
from dotenv import load_dotenv

# Загружаем переменные из файла .env
# Так токен бота не хранится прямо в коде — это важно для безопасности
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не найден. Создай файл .env и добавь туда токен.")
