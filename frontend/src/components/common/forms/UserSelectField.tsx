import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserOption {
  id: number;
  full_name?: string;
  username?: string;
}

interface UserSelectFieldProps {
  value: string;
  users?: UserOption[];
  onChange: (value: string) => void;
}

export const UserSelectField: React.FC<UserSelectFieldProps> = ({ value, users, onChange }) => (
  <div className="space-y-2">
    <Label
      htmlFor="user-select-field"
      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      User
    </Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="user-select-field" className="h-10 px-3">
        <SelectValue placeholder="Self (current user)" />
      </SelectTrigger>
      <SelectContent>
        {users?.map((user) => (
          <SelectItem key={user.id} value={String(user.id)}>
            {user.full_name || user.username}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
