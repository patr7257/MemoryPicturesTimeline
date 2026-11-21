"use client";

import { useEffect, useState } from "react";

import { FamiliesTab } from "@/components/family/FamiliesTab";
import { PeopleTab } from "@/components/family/PeopleTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialFamilyTab, type FamilyTab } from "@/lib/family-admin";
import type { FamilyWithMembers } from "@/lib/family-queries";
import type { AdminPerson } from "@/lib/member-queries";
import type { LoginEntry } from "@/lib/members";

// Super admin /family: two tabs chosen by the URL hash. The server cannot see
// the hash, so the first render uses the invite hint and the hash is applied
// right after mount.
export function FamilyAdmin({
  families,
  people,
  logins,
  colors,
  viewerEmail,
  invitePersonId,
}: {
  families: FamilyWithMembers[];
  people: AdminPerson[];
  logins: LoginEntry[];
  colors: Record<string, string>;
  viewerEmail: string;
  invitePersonId: string | null;
}) {
  const hasInvite = invitePersonId !== null;
  const [tab, setTab] = useState<FamilyTab>(() => initialFamilyTab("", hasInvite));

  useEffect(() => {
    const fromHash = initialFamilyTab(window.location.hash, hasInvite);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash only exists in the browser
    setTab(fromHash);
  }, [hasInvite]);

  function change(next: FamilyTab) {
    setTab(next);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand mb-4 text-4xl">Family</h1>
      <Tabs value={tab} onValueChange={(v) => change(v as FamilyTab)}>
        <TabsList className="h-11! w-full sm:h-9!">
          <TabsTrigger value="families" className="text-sm">
            Families
          </TabsTrigger>
          <TabsTrigger value="people" className="text-sm">
            People
          </TabsTrigger>
        </TabsList>
        <TabsContent value="families" className="pt-4">
          <FamiliesTab families={families} people={people} colors={colors} />
        </TabsContent>
        <TabsContent value="people" className="pt-4">
          <PeopleTab
            families={families}
            people={people}
            logins={logins}
            colors={colors}
            viewerEmail={viewerEmail}
            invitePersonId={invitePersonId}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
