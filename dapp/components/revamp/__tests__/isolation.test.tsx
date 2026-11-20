import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { RevampThemeProvider, useRevampTheme } from "../theme";
import { RevampButton } from "../ui";

function ThemeProbe() {
  const { theme, toggleTheme, portalContainer } = useRevampTheme();
  return <>
    <button onClick={toggleTheme}>Toggle preview theme</button>
    <span data-testid="theme">{theme}</span>
    {portalContainer && createPortal(<span data-testid="portal">Themed popup</span>, portalContainer)}
  </>;
}

describe("redesign isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "light";
    document.documentElement.style.setProperty("--background", "legacy-value");
  });

  it("switches and persists the preview theme without changing the legacy theme or losing portal scope", async () => {
    localStorage.setItem("theme", "light");
    const result = render(<RevampThemeProvider><ThemeProbe /></RevampThemeProvider>);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("portal").closest("[data-ckboost-revamp]")).toHaveAttribute("data-theme", "dark");
    fireEvent.click(screen.getByRole("button", {name: "Toggle preview theme"}));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(localStorage.getItem("ckboost-revamp-theme")).toBe("light");
    expect(document.documentElement.className).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("legacy-value");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(screen.getByTestId("portal").closest("[data-ckboost-revamp]")).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("button", {name: "Toggle preview theme"}));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.className).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    fireEvent.click(screen.getByRole("button", {name: "Toggle preview theme"}));
    result.unmount();
    render(<RevampThemeProvider><ThemeProbe /></RevampThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
  });

  it("preserves a single link when composing an action with Radix Slot", () => {
    render(<RevampButton asChild variant="secondary"><a href="/">Current site</a></RevampButton>);
    expect(screen.getByRole("link", {name: "Current site"})).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
