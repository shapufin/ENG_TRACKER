import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogBody, DialogTitle } from "./dialog";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "./select";

describe("Dialog with nested Popover and Select wheel scrolling", () => {
  it("verifies wheel events inside popover content are not canceled", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogBody>
            <Popover open={true}>
              <PopoverTrigger asChild>
                <button>Trigger</button>
              </PopoverTrigger>
              <PopoverContent>
                <div data-testid="scroll-container" style={{ height: "100px", overflowY: "auto" }}>
                  <div style={{ height: "300px" }}>Long content</div>
                </div>
              </PopoverContent>
            </Popover>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );

    const scrollContainer = screen.getByTestId("scroll-container");
    const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 50 });
    scrollContainer.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);
  });

  it("verifies wheel events inside select content are not canceled", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogBody>
            <Select open={true}>
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Option 1</SelectItem>
                <SelectItem value="2">Option 2</SelectItem>
                <SelectItem value="3">Option 3</SelectItem>
              </SelectContent>
            </Select>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );

    const option = screen.getByText("Option 1");
    const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 50 });
    option.dispatchEvent(wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);
  });
});
