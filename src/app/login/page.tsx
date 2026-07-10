import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  return (
    <div className="grid flex-1 place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
          <BarChart3 className="size-6" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Sign in to SocialView
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your video performance across every platform, on one screen.
        </p>

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo: callbackUrl ?? "/dashboard",
            });
          }}
        >
          <Button type="submit" className="w-full" size="lg">
            Continue with Google
          </Button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Signing in only shares your name and email. You connect YouTube,
          TikTok, and Instagram separately, whenever you choose.
        </p>
      </div>
    </div>
  );
}
