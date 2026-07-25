import { Link, createFileRoute } from '@tanstack/react-router'

import { ThemeToggle } from '#/components/theme-toggle'
import { canonical, seo } from '#/lib/seo'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: seo({
      title: 'Privacy Policy',
      description:
        'How Shelf collects, uses, and protects your data — and the choices you have.',
      path: '/privacy',
    }),
    links: [canonical('/privacy')],
  }),
  component: PrivacyPage,
})

const UPDATED = 'July 20, 2026'

function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-8">
        <Link to="/welcome" className="font-display text-[22px] font-bold">
          Shelf
          <span className="text-cat-restaurant">.</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-8">
        <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-[14px] text-ink-faint">
          Last updated: {UPDATED}
        </p>

        <div className="prose-shelf mt-10 space-y-8 text-[15px] leading-relaxed text-ink-soft">
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Who we are
            </h2>
            <p className="mt-2">
              Shelf (“the app”, “we”) is a personal web app for keeping lists of
              things to try, watch, read, and visit — on your own or shared with
              people you invite. This policy explains what we collect, why, and
              the choices you have. If you have questions, reach out through the
              app.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              What we collect
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">Account details.</strong> Your
                name, email address, and a securely hashed password. We never
                store your password in plain text.
              </li>
              <li>
                <strong className="text-ink">Your content.</strong> The
                shelves, items, notes, links, images, reactions, and activity
                you create, plus who you share shelves with.
              </li>
              <li>
                <strong className="text-ink">Encrypted notes.</strong> Notes in
                your private vault are end-to-end encrypted in your browser
                using a key derived from your passphrase. We store only the
                ciphertext — we cannot read them, and we cannot recover them if
                you lose your passphrase.
              </li>
              <li>
                <strong className="text-ink">Technical data.</strong> To keep
                you signed in and secure, we store session records that include
                your IP address and browser user-agent.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              How we use it
            </h2>
            <p className="mt-2">
              We use your data solely to provide the app: authenticating you,
              storing and displaying your shelves, and enabling sharing with
              people you invite. We do not sell your data, and we do not use it
              for advertising or profiling.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Third-party services
            </h2>
            <p className="mt-2">
              When you add or search for items, the app may contact these
              services to fetch details (titles, cover art, addresses). Your
              search text is sent to the relevant service; your account and
              private data are not:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">TMDb</strong> — movie and TV
                metadata and images.
              </li>
              <li>
                <strong className="text-ink">Open Library</strong> — book
                metadata and cover images.
              </li>
              <li>
                <strong className="text-ink">free-exercise-db</strong> — open
                public-domain (Unlicense) exercise names, form photos, and
                how-to steps, loaded from{' '}
                <a
                  className="text-ink underline"
                  href="https://github.com/yuhonas/free-exercise-db"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                .
              </li>
              <li>
                <strong className="text-ink">Google Places / Maps</strong> —
                restaurant and place lookups, and resolving pasted Google Maps
                links. See{' '}
                <a
                  className="text-ink underline"
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google’s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong className="text-ink">Link previews</strong> — for
                wishlist links you paste, we fetch the page to read its
                Open Graph preview tags.
              </li>
            </ul>
            <p className="mt-2">
              These providers have their own privacy policies. Our hosting and
              database provider stores the data described above on our behalf.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Sharing
            </h2>
            <p className="mt-2">
              When you share a shelf, its contents become visible to anyone you
              invite (via a revocable invite link) and to anyone with a
              read-only view link you generate. You can revoke either link at
              any time, which immediately cuts off access.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Retention & your rights
            </h2>
            <p className="mt-2">
              We keep your data for as long as your account exists. You can edit
              or delete your shelves and items at any time. To access, export,
              correct, or permanently delete your account and all associated
              data, contact us through the app. Deleting your account cascades to
              remove your shelves, items, notes, reactions, and activity.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Cookies
            </h2>
            <p className="mt-2">
              We use a single essential cookie to keep you signed in. We do not
              use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Children
            </h2>
            <p className="mt-2">
              Shelf is not directed to children under 13, and we do not
              knowingly collect data from them.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              Changes
            </h2>
            <p className="mt-2">
              We may update this policy from time to time. Material changes will
              be reflected in the “Last updated” date above.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-line pt-6">
          <Link
            to="/welcome"
            className="text-[14px] text-ink-soft underline hover:text-ink"
          >
            ← Back to Shelf
          </Link>
        </div>
      </main>
    </div>
  )
}
