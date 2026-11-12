import React from "react";

interface AttendedEmployeesProps {
  employees?: { user_id: number; name: string }[];
}

/** Employees whose EPR review the HBPR attended: one partnership row covers the year. */
export const AttendedEmployees: React.FC<AttendedEmployeesProps> = ({ employees }) => {
  if (!employees || employees.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-muted-foreground text-xs font-medium">
        HBPR attended ({employees.length})
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {employees.map((employee) => (
          <li
            key={employee.user_id}
            className="bg-muted text-foreground rounded-lg px-2 py-0.5 text-xs"
          >
            {employee.name}
          </li>
        ))}
      </ul>
    </div>
  );
};
