import { config } from './config'

export type PlanId = 'free' | 'start' | 'pro' | 'business' | 'corporate'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** Цена за месяц в копейках. 0 — бесплатный тариф. */
  priceMonthly: number
  /** Цена за год в копейках (12 месяцев со скидкой). */
  priceYearly: number
  /** Лимит активного управления в сутки, секунды. null — без лимита. */
  dailySeconds: number | null
  /** Сколько одновременных исходящих сессий разрешено. */
  concurrentSessions: number
  /** Сколько устройств можно закрепить за аккаунтом. null — без лимита. */
  devices: number | null
  features: string[]
  highlighted?: boolean
  /**
   * Цена договорная: тариф не продаётся через кассу, условия обсуждаются.
   * Число одновременных сессий задаётся отдельно для каждого клиента.
   */
  negotiable?: boolean
}

/**
 * Тарифная сетка. Бесплатный тариф — 3 часа управления в сутки,
 * счётчик обнуляется в 00:00 по московскому времени.
 */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Бесплатный',
    tagline: '3 часа удалённого управления каждый день',
    priceMonthly: 0,
    priceYearly: 0,
    dailySeconds: config.quota.freeSecondsPerDay,
    concurrentSessions: 1,
    devices: 3,
    features: [
      '3 часа активных сессий в сутки',
      'Счётчик обнуляется в 00:00 МСК',
      'Передача файлов и чат',
      'Шифрование соединения',
      'До 3 устройств в адресной книге',
    ],
  },
  {
    id: 'start',
    name: 'Старт',
    tagline: 'Для частного мастера и одного рабочего места',
    priceMonthly: 39000,
    priceYearly: 390000,
    dailySeconds: null,
    concurrentSessions: 1,
    devices: 10,
    features: [
      'Без лимита по времени',
      '1 одновременная сессия',
      'До 10 устройств в адресной книге',
      'История подключений 30 дней',
      'Поддержка в Telegram',
    ],
  },
  {
    id: 'pro',
    name: 'Профи',
    tagline: 'Для специалиста техподдержки с потоком заявок',
    priceMonthly: 89000,
    priceYearly: 890000,
    dailySeconds: null,
    concurrentSessions: 3,
    devices: 100,
    features: [
      'Без лимита по времени',
      '3 одновременные сессии',
      'До 100 устройств в адресной книге',
      'Неподтверждённый доступ к своим устройствам',
      'История подключений 180 дней',
      'Пробный период по заявке',
      'Приоритетная поддержка',
    ],
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Бизнес',
    tagline: 'Для отдела поддержки и сервисной компании',
    priceMonthly: 249000,
    priceYearly: 2490000,
    dailySeconds: null,
    concurrentSessions: 10,
    devices: null,
    features: [
      'Без лимита по времени и устройствам',
      '10 одновременных сессий',
      'Общая адресная книга команды',
      'Журнал действий и выгрузка отчётов',
      'Договор и закрывающие документы',
      'Пробный период до 30 дней по заявке',
      'Выделенный менеджер',
    ],
  },
  {
    id: 'corporate',
    name: 'Корпоративный',
    tagline: 'Для крупной поддержки: сколько сессий нужно, столько и включаем',
    priceMonthly: 0,
    priceYearly: 0,
    negotiable: true,
    dailySeconds: null,
    // Значение по умолчанию: реальное число задаётся в подписке клиента.
    concurrentSessions: 25,
    devices: null,
    features: [
      'Одновременные сессии без потолка — 25, 50, 100 и больше',
      'Число сессий меняется по звонку, без смены тарифа',
      'Без лимита по времени и устройствам',
      'Общая адресная книга и журнал действий',
      'Пробный период до 30 дней по заявке',
      'Выделенный сервер под ваш контур по запросу',
      'Договор, счёт и закрывающие документы',
    ],
  },
]

export const PLANS_BY_ID: Record<PlanId, Plan> = PLANS.reduce(
  (acc, plan) => ({ ...acc, [plan.id]: plan }),
  {} as Record<PlanId, Plan>,
)

export function getPlan(id: string | null | undefined): Plan {
  if (id && id in PLANS_BY_ID) return PLANS_BY_ID[id as PlanId]
  return PLANS_BY_ID.free
}

export function isPaidPlan(id: string | null | undefined): boolean {
  const plan = getPlan(id)
  return plan.priceMonthly > 0 || Boolean(plan.negotiable)
}

/** Бесплатный тариф — единственный, который выдаётся сам собой. */
export function isFreePlan(id: string | null | undefined): boolean {
  return getPlan(id).id === 'free'
}

/** Тарифы, которые можно оплатить на сайте: без договорных. */
export function purchasablePlans(): Plan[] {
  return PLANS.filter((plan) => plan.priceMonthly > 0 && !plan.negotiable)
}

/** «390 ₽» — цена из копеек в подпись для витрины. */
export function formatPrice(kopeks: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: kopeks % 100 === 0 ? 0 : 2,
  }).format(kopeks / 100)
}
