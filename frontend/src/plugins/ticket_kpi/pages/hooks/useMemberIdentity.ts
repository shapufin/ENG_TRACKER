import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { userService } from "@/services/userService";

/**
 * Name and assigned clients of a member a leader is looking at.
 *
 * A leader cannot read `/users/users/<id>/` for a member (it answers 404), so
 * the squad list the leader is already allowed to see is the source; an admin
 * reads the user directly. `clientIds` is `undefined` until the squad has
 * loaded (and always for an admin, who is not limited to a member's clients).
 */
export const useMemberIdentity = (memberId: number | undefined) => {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_staff || user?.is_superuser);

  const { data: squad } = useQuery({
    queryKey: ["ticket_kpi", "squad_profiles"],
    queryFn: () => userService.getMyTeamMembers({ excludeManagers: true }),
    enabled: Boolean(memberId) && !isAdmin,
  });
  const { data: detail } = useQuery({
    queryKey: ["users", "detail", memberId],
    queryFn: () => userService.getUser(memberId!),
    enabled: Boolean(memberId) && isAdmin,
  });

  const profile = squad?.find((p) => p.user.id === memberId);
  const person = profile?.user ?? detail;
  const name = person
    ? `${person.first_name} ${person.last_name}`.trim() || person.username
    : undefined;
  return { name, clientIds: profile?.clients, squadLoaded: squad !== undefined, isAdmin };
};
