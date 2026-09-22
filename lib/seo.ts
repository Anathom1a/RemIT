import type { Metadata } from 'next'
import { config } from './config'
import { PLANS, formatPrice } from './plans'

/** Базовый адрес сайта — нужен для канонических ссылок и разметки. */
export const siteUrl = `https://${config.brand.domain}`

/**
 * Метаданные страницы с канонической ссылкой. Канонический адрес важен для
 * Яндекса и Google: без него страницы с параметрами считаются дублями.
 */
export function pageMetadata(options: {
  title: string
  description: string
  path: string
  keywords?: string[]
  noIndex?: boolean
}): Metadata {
  const url = `${siteUrl}${options.path}`

  return {
    title: options.title,
    description: options.description,
    keywords: options.keywords,
    alternates: { canonical: url },
    robots: options.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: config.brand.name,
      url,
      title: options.title,
      description: options.description,
    },
  }
}

/** Микроразметка организации: карточка компании в выдаче и на картах. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.brand.name,
    alternateName: config.brand.latinName,
    url: siteUrl,
    email: config.brand.supportEmail,
    areaServed: 'RU',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: config.brand.supportEmail,
        availableLanguage: ['Russian'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: config.brand.salesEmail,
        availableLanguage: ['Russian'],
      },
    ],
  }
}

/** Микроразметка сайта: помогает показать название и поиск по сайту. */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.brand.name,
    url: siteUrl,
    inLanguage: 'ru-RU',
  }
}

/**
 * Микроразметка программы с ценами. Именно она даёт в выдаче строку
 * «от 390 ₽ в месяц» и помогает попасть в товарные блоки.
 */
export function softwareJsonLd() {
  const paid = PLANS.filter((plan) => plan.priceMonthly > 0)
  const cheapest = paid.reduce((min, plan) => (plan.priceMonthly < min.priceMonthly ? plan : min), paid[0])

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: config.brand.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Удалённый доступ',
    operatingSystem: 'Windows, macOS, Linux, Android, iOS',
    inLanguage: 'ru-RU',
    url: siteUrl,
    downloadUrl: `${siteUrl}/skachat`,
    description:
      'Программа удалённого доступа к компьютеру: подключение по ID и паролю, передача файлов, ' +
      'работа через NAT без VPN. Бесплатно 3 часа управления в сутки, для компаний — пробный период.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'RUB',
      lowPrice: (cheapest.priceMonthly / 100).toFixed(0),
      highPrice: (paid[paid.length - 1].priceMonthly / 100).toFixed(0),
      offerCount: paid.length,
      offers: paid.map((plan) => ({
        '@type': 'Offer',
        name: `Тариф «${plan.name}»`,
        price: (plan.priceMonthly / 100).toFixed(0),
        priceCurrency: 'RUB',
        url: `${siteUrl}/tarify`,
        description: `${plan.tagline}. ${formatPrice(plan.priceMonthly)} в месяц.`,
      })),
    },
  }
}

/** Микроразметка вопросов и ответов: попадает в блок «часто спрашивают». */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

/** Хлебные крошки: показываются в выдаче вместо длинного адреса. */
export function breadcrumbsJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  }
}
