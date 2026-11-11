import { redirect } from "next/navigation";

import { getViewerOrNull } from "@/lib/access";
import { SignInForm } from "@/components/auth/SignInForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage() {
  // Only an allowed login skips the form: a removed member with a leftover
  // session stays here instead of bouncing between / and /login.
  if (await getViewerOrNull()) redirect("/timeline");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm -rotate-1 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="font-hand text-4xl">Family Memories</CardTitle>
          <CardDescription>
            Our trips, down memory lane. Family only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
