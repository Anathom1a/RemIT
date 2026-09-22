import type { MetadataRoute } from 'next'
import { config } from '@/lib/config'
import { getStore } from '@/lib/store'
import { compareVersions } from '@/lib/updates'

export const dynamic = 'force-dynamic'

/** Карта сайта: публичные страницы и страницы опубликованных выпусков. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = `https://${config.brand.domain}`
  const now = new Date()

  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/tarify', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/dlya-biznesa', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/probnyy-period', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/skachat', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/sravnenie', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/podderzhka', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/dokumenty/oferta', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/dokumenty/soglashenie', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/dokumenty/politika', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/dokumenty/soglasie', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/dokumenty/cookie', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/dokumenty/licenzii', priority: 0.2, changeFrequency: 'yearly' },
  ]

  const entries: MetadataRoute.Sitemap = pages.map((page) => ({
    url: `${host}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))

  try {
    const store = await getStore()
    const releases = (await store.listReleases())
      .filter((release) => release.published)
      .sort((a, b) => compareVersions(b.version, a.version))
      .slice(0, 20)

    for (const release of releases) {
      entries.push({
        url: `${host}/obnovlenie/${release.version}`,
        lastModified: release.publishedAt ? new Date(release.publishedAt) : now,
        changeFrequency: 'yearly',
        priority: 0.4,
      })
    }
  } catch {
    // Хранилище недоступно — отдаём карту сайта хотя бы со статическими страницами.
  }

  return entries
}
