import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePhoneRecordDetail } from "./usePhoneRecordDetail";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";

const viewport = (phone: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: phone && query === MOBILE_CARD_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );

describe("usePhoneRecordDetail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the tapped record on phones and closes it again", () => {
    viewport(true);
    const { result } = renderHook(() => usePhoneRecordDetail<{ id: number }>());
    expect(result.current.record).toBeNull();

    act(() => result.current.onRowClick?.({ id: 5 }));
    expect(result.current.record).toEqual({ id: 5 });

    act(() => result.current.onOpenChange(false));
    expect(result.current.record).toBeNull();
  });

  it("leaves rows inert from tablet width up so desktop behaviour is unchanged", () => {
    viewport(false);
    const { result } = renderHook(() => usePhoneRecordDetail<{ id: number }>());
    expect(result.current.onRowClick).toBeUndefined();
  });
});
