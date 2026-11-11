import { getViewer } from "@/lib/access";
import { AppNav } from "@/components/site/AppNav";
import { UpdateBanner } from "@/components/site/UpdateBanner";

// Every signed-in page lives under this layout, so the navigation is always
// there. getViewer() redirects to /login without a session.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  return (
    <>
      <AppNav viewer={{ name: viewer.name, email: viewer.email, role: viewer.role }} />
      {/* Phones: clear the fixed 4rem tab bar plus the iPhone home indicator. */}
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      <UpdateBanner />
    </>
  );
}
