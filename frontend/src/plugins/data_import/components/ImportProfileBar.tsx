import React, { useState } from "react";
import { Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportProfile } from "../types/dataImport";

interface ImportProfileBarProps {
  profiles: ImportProfile[];
  targetKey: string;
  onLoadProfile: (profile: ImportProfile) => void;
  onSaveProfile: (name: string) => void;
}

export const ImportProfileBar: React.FC<ImportProfileBarProps> = ({
  profiles,
  targetKey,
  onLoadProfile,
  onSaveProfile,
}) => {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  const targetProfiles = profiles.filter((p) => p.target_key === targetKey);

  const handleSave = () => {
    if (!name.trim()) return;
    onSaveProfile(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center">
      <div className="flex-1 space-y-2">
        <label className="text-sm font-medium">Load saved mapping</label>
        <Select
          value=""
          onValueChange={(value) => {
            const profile = targetProfiles.find((p) => p.id.toString() === value);
            if (profile) onLoadProfile(profile);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a profile" />
          </SelectTrigger>
          <SelectContent>
            {targetProfiles.length === 0 && (
              <SelectItem value="none" disabled>
                No profiles saved
              </SelectItem>
            )}
            {targetProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id.toString()}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <label className="text-sm font-medium">Save current mapping as</label>
        <div className="flex gap-2">
          <Input
            placeholder="Profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button variant="outline" onClick={handleSave} disabled={!name.trim()}>
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
