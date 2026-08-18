const initData = window.Telegram?.WebApp?.initData || '';

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-telegram-init-data': initData,
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `Ошибка ${res.status}`);
    err.status = res.status;
    err.detail = data.detail;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  hasInitData: Boolean(initData),
  me: () => request('/api/me'),
  brief: () => request('/api/brief'),
  saveSection: (sectionId, value) =>
    request(`/api/brief/${sectionId}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  tasks: (agent) => request(`/api/tasks${agent ? `?agent=${agent}` : ''}`),
  createTask: (agent, prompt) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify({ agent, prompt }) }),
  billing: () => request('/api/billing'),
  invoice: (plan) => request('/api/billing/invoice', { method: 'POST', body: JSON.stringify({ plan }) }),
};

/**
 * Открывает окно оплаты Telegram. Возвращает статус, но опираться на него
 * для включения тарифа нельзя — это браузер клиента. Тариф включает сервер
 * по событию successful_payment; здесь мы только обновляем экран.
 */
export const payWithStars = (link) =>
  new Promise((resolve) => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.openInvoice) {
      window.open(link, '_blank');
      return resolve('unknown');
    }
    tg.openInvoice(link, resolve);
  });

export const haptic = (style = 'light') => {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* вне Telegram просто ничего не делаем */
  }
};
