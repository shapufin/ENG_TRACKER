export const handleRejectConfirm = (
  rejectingRecord: { id: number; type: "overtime" | "standby" | "leave" } | null,
  reason: string,
  mutations: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    otReject: { mutate: (p: any) => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sbReject: { mutate: (p: any) => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaveReject: { mutate: (p: any) => void };
  },
  onClear: () => void
) => {
  if (!rejectingRecord) return;
  const { id, type } = rejectingRecord;
  const payload = { id, reason };
  if (type === "overtime") mutations.otReject.mutate(payload);
  else if (type === "standby") mutations.sbReject.mutate(payload);
  else mutations.leaveReject.mutate(payload);
  onClear();
};
