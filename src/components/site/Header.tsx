import Link from "next/link";
import { Bell, MapPin, Upload, Users } from "lucide-react";

import { UserActions } from "@/components/auth/UserActions";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-2">
      <Link href="/" className="font-hand text-4xl leading-none">
        Family Memories
      </Link>
      <nav className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/upload" />}>
          <Upload data-slot="icon" />
          Add photos
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/map" />}>
          <MapPin data-slot="icon" />
          Map
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/people" />}>
          <Users data-slot="icon" />
          People
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/notifications" />}>
          <Bell data-slot="icon" />
          Alerts
        </Button>
        <UserActions />
      </nav>
    </header>
  );
}
