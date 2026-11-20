import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { RevampThemeProvider } from "../theme";
import { RevampSelect } from "../ui";

function FilterExample() {
  const [value, setValue] = useState("all");
  return <RevampThemeProvider>
    <RevampSelect label="Status" value={value} onValueChange={setValue}
      displayValue={value === "all" ? "Status" : undefined}
      options={[{value:"all",label:"All statuses"},{value:"active",label:"Active"},{value:"completed",label:"Completed"}]} />
    <button onClick={() => setValue("all")}>Clear filters</button>
  </RevampThemeProvider>;
}

describe("themed filter selection", () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  });

  it("keeps the label after selecting and clearing without mixing portal text and React children", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<FilterExample />);
      const trigger = screen.getByRole("combobox", {name:"Status"});
      expect(trigger).toHaveTextContent("Status");
      fireEvent.keyDown(trigger, {key:"ArrowDown"});
      const active = await screen.findByRole("option", {name:"Active"});
      fireEvent.click(active);
      await waitFor(() => expect(trigger).toHaveTextContent("Active"));
      fireEvent.click(screen.getByRole("button", {name:"Clear filters"}));
      expect(trigger).toHaveTextContent("Status");
      fireEvent.keyDown(trigger, {key:"ArrowDown"});
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
      expect(screen.getByRole("listbox").closest("[data-ckboost-revamp]")).toBeTruthy();
      expect(errors.mock.calls.filter(args => String(args[0]).includes("createPortal"))).toEqual([]);
    } finally { errors.mockRestore(); }
  });
});
