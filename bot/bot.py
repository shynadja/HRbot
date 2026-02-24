import os
import logging
import json
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from telegram.constants import ParseMode
from dotenv import load_dotenv
from flask import Flask, request, jsonify
import threading

load_dotenv()

# Настройки
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")
PORT = int(os.getenv("PORT", 5000))

# Логирование
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Flask приложение для вебхука
app = Flask(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user
    
    logger.info(f"User {user.id} started the bot")
    
    # Создаем клавиатуру с веб-приложением
    keyboard = [[
        InlineKeyboardButton(
            "🚀 Открыть TalkPro", 
            web_app=WebAppInfo(url=f"{WEB_APP_URL}/?user_id={user.id}")
        )
    ]]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"🌟 *Добро пожаловать в TalkPro, {user.first_name}!*\n\n"
        "Нажмите кнопку ниже, чтобы открыть мини-приложение.\n"
        "Там вы сможете:\n"
        "• Искать кандидатов\n"
        "• Планировать встречи\n"
        "• Анализировать резюме",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=reply_markup
    )

async def handle_web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик данных из веб-приложения"""
    data = json.loads(update.effective_message.web_app_data.data)
    user = update.effective_user
    
    logger.info(f"Received data from user {user.id}: {data}")
    
    action = data.get('action')
    
    if action == 'button_clicked':
        await update.effective_message.reply_text(
            f"✅ Вы нажали кнопку в мини-приложении!"
        )
    elif action == 'cold_search':
        await update.effective_message.reply_text(
            f"🔍 Запущен поиск кандидатов..."
        )
    else:
        await update.effective_message.reply_text(
            f"📝 Получены данные: {data}"
        )

# Flask эндпоинт для вебхука
@app.route('/webhook', methods=['POST'])
def webhook():
    """Обработчик вебхука от Telegram"""
    update = Update.de_json(request.get_json(), application.bot)
    application.process_update(update)
    return jsonify({"status": "ok"})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

def run_flask():
    """Запуск Flask сервера в отдельном потоке"""
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

def setup_webhook():
    """Настройка вебхука вместо polling"""
    webhook_url = f"{WEB_APP_URL}/webhook"
    application.bot.set_webhook(url=webhook_url)
    logger.info(f"Webhook set to {webhook_url}")

def main():
    """Запуск бота"""
    global application
    
    if not TOKEN:
        print("❌ Ошибка: TELEGRAM_BOT_TOKEN не найден в .env файле")
        return
    
    print(f"✅ Токен загружен: {TOKEN[:10]}...")
    print(f"🌐 Web App URL: {WEB_APP_URL}")
    
    # Создание приложения
    application = Application.builder().token(TOKEN).build()
    
    # Добавление обработчиков
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))
    
    # Выбор метода: polling или webhook
    use_webhook = os.getenv("USE_WEBHOOK", "false").lower() == "true"
    
    if use_webhook:
        # Запуск Flask в отдельном потоке
        flask_thread = threading.Thread(target=run_flask)
        flask_thread.daemon = True
        flask_thread.start()
        
        # Настройка вебхука
        setup_webhook()
        print(f"🚀 Бот запущен с вебхуком на порту {PORT}...")
        
        # Держим основной поток живым
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n👋 Остановка бота...")
    else:
        # Запуск polling
        print("🚀 Telegram бот запущен (polling)...")
        print("📱 Нажмите Ctrl+C для остановки")
        application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()