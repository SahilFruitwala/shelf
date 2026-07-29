import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/tanstack-react-start'

import appCss from '../styles.css?url'
import { seo } from '#/lib/seo'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

// Dark by default; an explicit choice wins.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('shelf-theme');
    if (stored !== 'light') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        // interactive-widget: the on-screen keyboard resizes the layout
        // viewport instead of panning it, so dvh-sized modals stay on screen
        // and their fields stay reachable above the keyboard.
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      ...seo(),
      { name: 'theme-color', content: '#09090b' },
      { name: 'apple-mobile-web-app-title', content: 'Shelf' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
