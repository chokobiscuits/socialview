import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - SocialView",
  description: "The terms for using SocialView.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: 10 July 2026</p>

      <p>
        SocialView is a personal analytics dashboard. By using it you agree to
        these terms.
      </p>

      <h2>What SocialView does</h2>
      <p>
        SocialView reads the view counts and basic engagement metrics of your
        own videos from the platforms you connect (YouTube, TikTok, Instagram)
        and displays them together. It has read-only access and never posts,
        modifies, or deletes anything on your accounts.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>
          Connect only accounts you own or are authorised to manage.
        </li>
        <li>
          Keep your sign-in credentials secure. You are responsible for activity
          under your account.
        </li>
        <li>
          Use the service in compliance with the terms of each platform you
          connect, including the YouTube, TikTok, and Meta developer and platform
          policies.
        </li>
      </ul>

      <h2>Availability</h2>
      <p>
        SocialView is provided as-is, without warranty. It may be unavailable at
        times, and the data it shows depends on the connected platforms&apos;
        APIs, which can change or impose limits outside our control.
      </p>

      <h2>Data and deletion</h2>
      <p>
        How your data is handled is described in our{" "}
        <a href="/privacy">Privacy Policy</a>. You can disconnect any platform at
        any time, which deletes the data collected from it.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may be updated. Continued use after a change constitutes
        acceptance of the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions can be sent to{" "}
        <a href="mailto:chocottori0322@gmail.com">chocottori0322@gmail.com</a>.
      </p>
    </>
  );
}
