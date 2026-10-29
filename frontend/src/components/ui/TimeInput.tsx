/**
 * TimeInput — type a 24-hour time and let the field fill in the rest.
 * "9" or "09" becomes 09:00, "1430" becomes 14:30, and the AM/PM tag beside it
 * follows the hour. The value stays a plain "HH:mm" string, the same as the
 * native time input it replaces, so forms and payloads do not change.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { dayPeriod, formatTimeInput, parseTypedTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

type TimeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Show the AM/PM tag. Turn off in cramped table cells. */
  showPeriod?: boolean;
};

// A time that cannot be mistaken for the start of a longer one, so it is safe to
// report while the person is still typing: "0930", "9:30", "9pm". "09" waits for blur.
const isComplete = (typed: string) =>
  /\d{1,2}:\d{2}/.test(typed) || /\d{4}/.test(typed) || /[ap]m?$/i.test(typed);

export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, onChange, showPeriod = true, className, onBlur, ...props }, ref) => {
    const [text, setText] = React.useState(value);

    React.useEffect(() => {
      setText((current) => (parseTypedTime(current) === value ? current : value));
    }, [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const typed = event.target.value;
      if (typed.trim() === "") {
        setText("");
        onChange("");
        return;
      }
      const formatted = formatTimeInput(typed);
      setText(formatted);
      const parsed = parseTypedTime(formatted);
      if (parsed && isComplete(formatted)) onChange(parsed);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const parsed = parseTypedTime(text);
      if (text.trim() === "") {
        onChange("");
        setText("");
      } else if (parsed) {
        onChange(parsed);
        setText(parsed);
      } else {
        setText(value);
      }
      onBlur?.(event);
    };

    const period = showPeriod ? dayPeriod(value) : "";

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:MM"
          maxLength={8}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(showPeriod && "pr-10", className)}
        />
        {period && (
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium"
          >
            {period}
          </span>
        )}
      </div>
    );
  }
);
TimeInput.displayName = "TimeInput";
