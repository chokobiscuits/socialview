import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - SocialView",
  description: "How SocialView handles your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: 10 July 2026</p>

      <p>
        SocialView is a personal dashboard that shows the view counts of a
        creator&apos;s own videos across YouTube, TikTok, and Instagram on one
        screen. This policy explains what it collects and why.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account identity.</strong> When you sign in with Google
          we store your name, email address, and profile image so we can
          recognise you on return visits.
        </li>
        <li>
          <strong>Access to platforms you connect.</strong> When you connect a
          YouTube, TikTok, or Instagram account, the platform gives us an access
          token scoped to reading your own videos and their statistics. We
          request read-only access only.
        </li>
        <li>
          <strong>Your video metrics.</strong> For each of your videos we store
          the title, thumbnail URL, link, publish date, and periodic snapshots
          of its view, like, and comment counts. The snapshots are what let the
          dashboard show change over time; the platforms themselves report only
          a current total.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We never post, edit, or delete anything on your accounts.</li>
        <li>We do not read your private messages, followers, or personal data beyond public video metrics.</li>
        <li>We do not sell, rent, or share your data with anyone.</li>
        <li>We show no advertising and run no third-party trackers.</li>
      </ul>

      <h2>How your tokens are stored</h2>
      <p>
        The access tokens that let us read your video statistics are encrypted
        at rest with AES-256-GCM before they are written to the database. They
        are decrypted only in memory, on the server, at the moment a refresh is
        performed, and are never sent to your browser.
      </p>

      <h2>How the data is used</h2>
      <p>
        Your video metrics are used solely to display your own dashboard to you.
        A scheduled job refreshes the snapshots roughly once an hour so the
        charts stay current.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Disconnecting a platform from the Platforms page permanently deletes that
        connection, its stored token, and every video and snapshot it produced.
        Because the platform APIs only ever report a current total, deleted view
        history cannot be reconstructed. To remove your account entirely, contact
        us and we will erase all associated records.
      </p>

      <h2>Third parties</h2>
      <p>
        We rely on Google (sign-in and the YouTube Data API), TikTok, and Meta
        (Instagram) for the data you choose to connect, and on Vercel and
        Supabase to host the application and its database. Your use of each
        connected platform remains governed by that platform&apos;s own terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be sent to{" "}
        <a href="mailto:chocottori0322@gmail.com">chocottori0322@gmail.com</a>.
      </p>
    </>
  );
}
