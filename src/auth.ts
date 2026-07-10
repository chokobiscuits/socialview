import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

/**
 * Google is the identity provider, and only that.
 *
 * The sign-in consent screen asks for `openid email profile` and nothing more.
 * Read access to a creator's videos is a *separate* grant, obtained by the
 * /api/connect/<platform> flows and stored as a PlatformConnection. Folding
 * `youtube.readonly` in here would force every user to hand over their video
 * data merely to log in.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      // Auth.js would otherwise look for AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.
      // The same client is reused by the YouTube connect flow, which reads
      // these names via lib/env, so pass them through explicitly.
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { scope: "openid email profile", prompt: "select_account" },
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    // The connect flows key every PlatformConnection off session.user.id, so
    // make its presence explicit rather than relying on adapter defaults.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
