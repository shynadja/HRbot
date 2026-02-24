export const initTelegram = () => {
  const tg = window.Telegram?.WebApp
  
  if (tg) {
    tg.ready()
    tg.expand()
    tg.setHeaderColor('#17212B')
    tg.setBackgroundColor('#17212B')
    tg.setBottomBarColor('#182533')
    
    return tg
  }
  
  return null
}

export const getUserData = () => {
  const tg = window.Telegram?.WebApp
  return tg?.initDataUnsafe?.user || null
}

export const getInitData = () => {
  const tg = window.Telegram?.WebApp
  return tg?.initData || ''
}