const express = require('express');
const { TARIFFS } = require('../tariffs');
const { summarize } = require('../limits');
const bot = require('../bot/bot');

const router = express.Router();

/** Экран тарифов: что есть, что куплено, сколько осталось. */
router.get('/', (req, res) => {
  const summary = summarize(req.userRow);
  res.json({
    current: summary,
    tariffs: TARIFFS.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      stars: t.stars,
      pitch: t.pitch,
      lines: t.lines,
      note: t.note,
      perDay: t.perDay,
      perPeriod: t.perPeriod,
      // Долларовый потолок наружу не отдаём: клиент покупает задачи,
      // а не токены, и знать про наши расходы ему незачем.
    })),
  });
});

/**
 * Ссылка на счёт. Валюта XTR, provider_token пустой — так устроены звёзды.
 *
 * В payload кладём тариф и того, кто платит: обратно он придёт вместе
 * с successful_payment, и без него платёж прилетел бы обезличенным.
 */
router.post('/invoice', async (req, res) => {
  const tariff = TARIFFS.find((t) => t.id === (req.body && req.body.plan));
  if (!tariff) return res.status(400).json({ error: 'Неизвестный тариф' });

  try {
    const payload = `plan:${tariff.id}:${req.telegramUser.id}`;
    const extra = {};

    // Подписка с автопродлением — только для месячных тарифов. «Старт» продаём
    // разовым счётом: это пробник, и подписываться на него незачем.
    if (tariff.kind === 'sub') extra.subscription_period = 30 * 24 * 60 * 60;

    const link = await bot.createInvoiceLink(
      `Тариф «${tariff.name}»`,
      tariff.lines.join('. ') + '.',
      payload,
      '',
      'XTR',
      [{ label: tariff.name, amount: tariff.stars }],
      extra
    );

    res.json({ link });
  } catch (err) {
    console.error('invoice:', err.message);
    // Самая вероятная причина — потолок цены у подписок в звёздах.
    // Скажем это прямо, чтобы не гадать по логам.
    res.status(500).json({
      error: 'Не удалось создать счёт',
      detail: err.message,
    });
  }
});

module.exports = router;
