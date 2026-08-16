/**
 * Структура брифа. Это перенесённый в код «Шаблон брифа» из хранилища:
 * каждый раздел — экран мастера настройки в мини-аппе.
 *
 * Фронтенд рисует форму по этому описанию и ничего не знает про конкретные
 * поля заранее — значит, добавить вопрос можно правкой одного файла.
 *
 * Типы полей:
 *   text  — короткая строка
 *   long  — многострочный текст
 *   list  — список строк, добавляются по одному
 *   table — таблица с фиксированными колонками
 */
const SECTIONS = [
  {
    id: 'who',
    step: 1,
    title: 'Кто вы',
    hint: 'Одно-два предложения: что за бизнес, где находится, для кого работает. Агент вставит это в тексты почти дословно, поэтому пишите живым языком.',
    required: true,
    fields: [{ key: 'text', type: 'long', label: 'Расскажите о бизнесе', placeholder: 'Детская творческая лаборатория кино в Краснодаре для ребят 8–17 лет…' }],
  },
  {
    id: 'pillars',
    step: 2,
    title: 'Чем вы отличаетесь',
    hint: 'Три-четыре опоры. Нужна отстройка, а не достоинства: «опытные мастера» напишет любой конкурент, это не опора.',
    required: true,
    fields: [{ key: 'items', type: 'list', label: 'Отличия', placeholder: 'Не ставим сценическую речь — работаем с камерой' }],
  },
  {
    id: 'offers',
    step: 3,
    title: 'Что вы продаёте',
    hint: 'Колонку «что получает на выходе» заполняйте по каждой строке отдельно. Именно на ней агенты чаще всего врут — обещают одному тарифу то, что есть у другого.',
    required: true,
    fields: [
      {
        key: 'rows',
        type: 'table',
        label: 'Услуги и тарифы',
        columns: [
          { key: 'name', label: 'Услуга' },
          { key: 'who', label: 'Для кого' },
          { key: 'price', label: 'Цена' },
          { key: 'term', label: 'Срок' },
          { key: 'outcome', label: 'Что получает на выходе' },
        ],
      },
    ],
  },
  {
    id: 'entry',
    step: 4,
    title: 'Точка входа',
    hint: 'Что человек может сделать первым шагом. Платно или бесплатно — пишите прямо: если тут нет однозначного «бесплатно», агенту запрещено это слово.',
    required: true,
    fields: [
      { key: 'text', type: 'long', label: 'Первый шаг клиента', placeholder: 'Бесплатное пробное занятие и бесплатная консультация…' },
      { key: 'reply_time', type: 'text', label: 'За сколько отвечаете на заявку', placeholder: 'в течение дня' },
    ],
  },
  {
    id: 'audience',
    step: 5,
    title: 'Кому вы продаёте',
    hint: 'Если платит один человек, а пользуется другой — это важно: текст читает первый, а убеждает его второй.',
    required: true,
    fields: [
      { key: 'payer', type: 'text', label: 'Кто платит', placeholder: 'родитель' },
      { key: 'user', type: 'text', label: 'Кто пользуется', placeholder: 'ребёнок 8–17 лет' },
      { key: 'worries', type: 'list', label: 'Что его тревожит', placeholder: 'а вдруг бросит' },
    ],
  },
  {
    id: 'voice',
    step: 6,
    title: 'Как вы звучите',
    hint: 'Тон и метафоры вашего дела. И обязательно — что раздражает вашу аудиторию: это работает сильнее, чем список желаемого.',
    required: true,
    fields: [
      { key: 'tone', type: 'text', label: 'Тон', placeholder: 'на равных, без сюсюканья' },
      { key: 'metaphors', type: 'text', label: 'Уместные метафоры', placeholder: 'язык съёмочной площадки: дубль, крупный план' },
      { key: 'irritants', type: 'list', label: 'Что раздражает аудиторию', placeholder: 'пафос про творческий полёт' },
      { key: 'address', type: 'text', label: 'Обращение', placeholder: 'на «вы»' },
    ],
  },
  {
    id: 'never',
    step: 7,
    title: 'Чего вы никогда не обещаете',
    hint: 'Отраслевые запреты. Медицина — никаких обещаний излечения, образование — никаких гарантий поступления, финансы — никакой доходности. Сюда же всё, за что вы однажды уже получали претензию.',
    required: true,
    fields: [{ key: 'items', type: 'list', label: 'Запреты', placeholder: 'Не обещаем карьеру в кино' }],
  },
  {
    id: 'channels',
    step: 8,
    title: 'Площадки и как до вас дойти',
    hint: 'Если ссылки нет — так и пишите «нет». Агенту запрещено звать туда, куда человек физически не может перейти.',
    required: true,
    fields: [
      {
        key: 'rows',
        type: 'table',
        label: 'Площадки',
        columns: [
          { key: 'platform', label: 'Площадка' },
          { key: 'link', label: 'Ссылка' },
          { key: 'purpose', label: 'Что там делаем' },
        ],
      },
      { key: 'cta', type: 'text', label: 'Целевое действие', placeholder: 'записаться на бесплатное пробное' },
      { key: 'how', type: 'text', label: 'Как человек это делает', placeholder: 'форма на сайте или звонок' },
    ],
  },
  {
    id: 'state',
    step: 9,
    title: 'Что есть и чего нет сегодня',
    hint: 'Самый живой раздел, обновляйте раз в неделю. Здесь написано, о чём агентам НЕЛЬЗЯ говорить, пока оно не появилось: готовые работы, действующие акции, работающая группа.',
    required: false,
    fields: [{ key: 'items', type: 'list', label: 'Текущее состояние', placeholder: 'Готовых работ учеников пока нет — не обещать их показ' }],
  },
  {
    id: 'leads',
    step: 10,
    title: 'Заявки с сайта',
    hint: 'Заполняется, только если подключаем разбор заявок. Без этого раздела аналитик работать не сможет.',
    required: false,
    fields: [
      { key: 'source', type: 'text', label: 'Откуда берём заявки', placeholder: 'файл на хостинге, выгрузка по FTP' },
      { key: 'format', type: 'long', label: 'Какие поля есть в заявке', placeholder: 'имя, телефон, почта, возраст, программа, сообщение…' },
      { key: 'tests', type: 'text', label: 'Как выглядят тестовые заявки', placeholder: 'телефоны 900 000-00-00, почты на example.com' },
    ],
  },
  {
    id: 'open',
    step: 11,
    title: 'Открытые вопросы',
    hint: 'Сюда агенты сами дописывают, чего им не хватило. Разбирайте этот список время от времени — он показывает, где тексты идут вслепую.',
    required: false,
    fields: [{ key: 'items', type: 'list', label: 'Вопросы без ответа', placeholder: '' }],
  },
];

const REQUIRED_IDS = SECTIONS.filter((s) => s.required).map((s) => s.id);

/** Считает, насколько бриф готов: заполнены ли обязательные разделы. */
function briefProgress(sections) {
  const filled = REQUIRED_IDS.filter((id) => {
    const v = sections && sections[id];
    if (!v) return false;
    return Object.values(v).some((field) => {
      if (Array.isArray(field)) return field.length > 0;
      return typeof field === 'string' && field.trim() !== '';
    });
  });
  return { done: filled.length, total: REQUIRED_IDS.length, ready: filled.length === REQUIRED_IDS.length };
}

module.exports = { SECTIONS, REQUIRED_IDS, briefProgress };
