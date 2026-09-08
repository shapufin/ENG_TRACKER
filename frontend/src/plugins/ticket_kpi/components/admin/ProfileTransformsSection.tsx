import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfileTransformsSectionProps {
  title: string;
  transforms: Record<string, string>;
  onTransformsChange: (transforms: Record<string, string>) => void;
}

export const ProfileTransformsSection: React.FC<ProfileTransformsSectionProps> = ({
  title,
  transforms,
  onTransformsChange,
}) => (
  <div className="space-y-2">
    <Label>{title}</Label>
    <div className="grid grid-cols-3 gap-2">
      {Object.entries(transforms).map(([raw, norm]) => (
        <div key={raw} className="flex gap-1">
          <Input value={raw} disabled className="text-xs" />
          <Input
            value={norm}
            onChange={(e) => onTransformsChange({ ...transforms, [raw]: e.target.value })}
            className="text-xs"
          />
        </div>
      ))}
    </div>
  </div>
);
