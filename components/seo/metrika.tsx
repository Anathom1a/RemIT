import Script from 'next/script'
import { config } from '@/lib/config'

/**
 * Счётчик Яндекс.Метрики. Подключается, только если задан номер счётчика,
 * поэтому в разработке и на стенде ничего не грузится.
 */
export function YandexMetrika() {
  const id = config.seo.metrikaId
  if (!id) return null

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${JSON.stringify(id)}, "init", { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });`}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}
