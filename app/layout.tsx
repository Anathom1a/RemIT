import type { Metadata, Viewport } from 'next'
import { config } from '@/lib/config'
import { JsonLd } from '@/components/seo/json-ld'
import { YandexMetrika } from '@/components/seo/metrika'
import { organizationJsonLd, siteUrl, websiteJsonLd } from '@/lib/seo'
import { formatPrice, getPlan } from '@/lib/plans'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${config.brand.domain}`),
  title: {
    default: `${config.brand.name} — удалённый доступ к компьютеру`,
    template: `%s — ${config.brand.name}`,
  },
  description:
    'Программа удалённого доступа к компьютеру: подключение по ID и паролю без VPN. Бесплатно 3 часа управления в сутки, подписка от ' +
    `${formatPrice(getPlan('start').priceMonthly)} в месяц, компаниям — пробный период до 30 дней. Серверы в России, оплата в рублях.`,
  keywords: [
    'удалённый доступ',
    'удалённый доступ к компьютеру',
    'удалённый рабочий стол',
    'программа для удалённого доступа',
    'удалённая техподдержка',
    'российский аналог TeamViewer',
    'AnyDesk альтернатива',
    'RemIT',
  ],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: config.brand.name,
    url: siteUrl,
    title: `${config.brand.name} — удалённый доступ к компьютеру`,
    description: `Бесплатно 3 часа в сутки, подписка от ${formatPrice(getPlan('start').priceMonthly)} в месяц, компаниям — пробный период до 30 дней. Серверы в России.`,
  },
  verification: {
    google: config.seo.googleVerification || undefined,
    yandex: config.seo.yandexVerification || undefined,
  },
  category: 'technology',
}

export const viewport: Viewport = {
  themeColor: '#05070d',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <YandexMetrika />
      </body>
    </html>
  )
}
