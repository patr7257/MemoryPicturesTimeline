"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig, motion } from "motion/react";
import {
  Bell,
  Images,
  LogOut,
  MapPin,
  Menu,
  Plane,
  Plus,
  Upload,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { SignOutDialog } from "@/components/auth/SignOutDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeSection, NAV_TABS, viewerInitial, type NavSection } from "@/lib/nav";
import type { Role } from "@/lib/access-policy";
import { cn } from "@/lib/utils";

export type NavViewer = { name: string; email: string; role: Role };

const ICONS: Record<Exclude<NavSection, "account">, LucideIcon> = {
  timeline: Images,
  vacations: Plane,
  upload: Upload,
  map: MapPin,
  people: Users,
  notifications: Bell,
};

// Rendered inside (app)/layout.tsx on every signed-in page. The layout adds
// the bottom padding that keeps content clear of the phone tab bar.
export function AppNav({ viewer }: { viewer: NavViewer }) {
  const section = activeSection(usePathname());
  const [moreOpen, setMoreOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const isAdmin = viewer.role === "super_admin";
  const moreActive = section === "people" || section === "notifications" || section === "account";

  function askSignOut() {
    setMoreOpen(false);
    setSignOutOpen(true);
  }

  return (
    <MotionConfig reducedMotion="user">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:gap-3">
          <Link
            href="/timeline"
            className="shrink-0 font-hand text-3xl leading-none whitespace-nowrap md:text-2xl lg:text-4xl"
          >
            Family Memories
          </Link>

          <nav aria-label="Main" className="ml-auto hidden min-w-0 items-center gap-0.5 md:flex lg:gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = ICONS[tab.key];
              const active = section === tab.key;
              const primary = tab.key === "upload";
              return (
                <Button
                  key={tab.key}
                  variant={primary ? (active ? "default" : "secondary") : "ghost"}
                  nativeButton={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "h-9 px-2.5 text-sm whitespace-nowrap lg:px-3",
                    !primary && active && "bg-muted font-semibold text-foreground",
                    primary && "mx-0.5",
                  )}
                  render={<Link href={tab.href} />}
                >
                  <Icon data-slot="icon" className="hidden lg:block" />
                  {tab.label}
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto md:ml-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                aria-current={section === "account" ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-full pr-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:pr-2.5",
                  section === "account" && "bg-muted",
                )}
              >
                <Avatar>
                  <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                    {viewerInitial(viewer.name, viewer.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-28 truncate lg:inline">{viewer.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem render={<Link href="/account" />} className="min-h-10">
                  <UserRound /> Account
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem render={<Link href="/members" />} className="min-h-10">
                    <UsersRound /> Members
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-10" onClick={() => setSignOutOpen(true)}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch">
          <TabLink href="/timeline" label="Timeline" Icon={Images} active={section === "timeline"} />
          <TabLink href="/vacations" label="Vacations" Icon={Plane} active={section === "vacations"} />
          <li className="flex flex-1 items-center justify-center">
            <Link
              href="/upload"
              aria-label="Add photos"
              aria-current={section === "upload" ? "page" : undefined}
              className={cn(
                "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95",
                section === "upload" && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
              )}
            >
              <Plus className="size-6" />
            </Link>
          </li>
          <TabLink href="/map" label="Map" Icon={MapPin} active={section === "map"} />
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)] md:hidden">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="px-2 pb-2">
            <SheetLink href="/people" Icon={Users} active={section === "people"} onNavigate={() => setMoreOpen(false)}>
              People
            </SheetLink>
            <SheetLink href="/notifications" Icon={Bell} active={section === "notifications"} onNavigate={() => setMoreOpen(false)}>
              Alerts
            </SheetLink>
            <SheetLink href="/account" Icon={UserRound} active={section === "account"} onNavigate={() => setMoreOpen(false)}>
              Account
            </SheetLink>
            {isAdmin && (
              <SheetLink href="/members" Icon={UsersRound} active={false} onNavigate={() => setMoreOpen(false)}>
                Members
              </SheetLink>
            )}
            <li>
              <button
                type="button"
                onClick={askSignOut}
                className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-medium text-destructive"
              >
                <LogOut className="size-5" /> Sign out
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </MotionConfig>
  );
}

function TabLink({
  href,
  label,
  Icon,
  active,
}: {
  href: "/timeline" | "/vacations" | "/map";
  label: string;
  Icon: LucideIcon;
  active: boolean;
}) {
  return (
    <li className="flex flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {active && (
          <motion.span
            layoutId="mobile-tab-indicator"
            className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}

function SheetLink({
  href,
  Icon,
  active,
  onNavigate,
  children,
}: {
  href: "/people" | "/notifications" | "/account" | "/members";
  Icon: LucideIcon;
  active: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 px-3 text-sm font-medium",
          active && "bg-muted text-primary",
        )}
      >
        <Icon className="size-5" /> {children}
      </Link>
    </li>
  );
}
