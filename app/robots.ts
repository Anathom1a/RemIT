import type { MetadataRoute } from 'next'
import { config } from '@/lib/config'

/**
 * robots.txt. Личный кабинет, админка и служебные маршруты в индекс не пускаем:
 * там нет полезного для поиска содержимого, зато есть персональные данные.
 */
export default function robots(): MetadataRoute.Robots {
  const host = `https://${config.brand.domain}`

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/kabinet', '/admin', '/api/', '/vhod', '/registraciya', '/obnovlenie/tag/'],
      },
    ],
    sitemap: `${host}/sitemap.xml`,
    host,
  }
}
