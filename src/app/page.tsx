import { redirect } from "next/navigation";

// The timeline is the home screen. "/" stays valid for the installed app's
// start_url and for old push links.
export default function RootPage() {
  redirect("/timeline");
}
