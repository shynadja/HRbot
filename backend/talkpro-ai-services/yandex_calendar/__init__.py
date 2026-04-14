"""
Модуль для работы с Яндекс.Календарем
"""
from .yandex_calendar import YandexCalendarRealClient
from .mock_client import MockYandexCalendarClient
from .queue_client import YandexCalendarQueueClient

# Синглтон-клиент
_singleton_client = None


def get_yandex_calendar_client(use_real: bool = False, email: str = None, app_password: str = None):
    """
    Возвращает один и тот же экземпляр клиента (синглтон)
    
    Args:
        use_real: использовать реальный API (требуется email и app_password)
        email: Яндекс.почта
        app_password: пароль приложения
    
    Returns:
        YandexCalendarQueueClient
    """
    global _singleton_client
    
    if _singleton_client is None:
        if use_real and email and app_password:
            print(f"Яндекс.Календарь: Создан реальный клиент для {email}")
            _singleton_client = YandexCalendarQueueClient(
                use_real=True,
                email=email,
                app_password=app_password,
                max_retries=3
            )
        else:
            print("Яндекс.Календарь: Создан мок-клиент")
            _singleton_client = YandexCalendarQueueClient(
                base_client=MockYandexCalendarClient(fail_rate=0.1),
                max_retries=3
            )
    else:
        print("Яндекс.Календарь: Используется существующий клиент")
    
    return _singleton_client


def reset_calendar_client():
    """Сброс синглтона (для тестирования)"""
    global _singleton_client
    _singleton_client = None


__all__ = [
    'YandexCalendarRealClient',
    'MockYandexCalendarClient',
    'YandexCalendarQueueClient',
    'get_yandex_calendar_client',
    'reset_calendar_client'
]