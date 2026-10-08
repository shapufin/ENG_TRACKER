import React from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleDistributionBody } from "./RoleDistributionBody";
import { TechDistributionBody } from "./TechDistributionBody";
import type { PeopleWidgetProps } from "./trendTypes";

/** Active users by role, and members per tech and level, as two tabs of one card. */
export const PeopleMixWidget: React.FC<PeopleWidgetProps> = (props) => (
  <Tabs defaultValue="roles" className="h-full">
    <ChartCard
      sectionId="people-mix"
      title="People Mix"
      className="h-full"
      action={
        <TabsList aria-label="People views">
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="tech">Tech</TabsTrigger>
        </TabsList>
      }
    >
      <TabsContent value="roles" className="mt-0">
        <RoleDistributionBody {...props} />
      </TabsContent>
      <TabsContent value="tech" className="mt-0">
        <TechDistributionBody {...props} />
      </TabsContent>
    </ChartCard>
  </Tabs>
);
