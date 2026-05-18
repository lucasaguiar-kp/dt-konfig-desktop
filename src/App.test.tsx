import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the DT Konfig shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "DT Konfig" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Inicializando aplicativo desktop",
      }),
    ).toBeInTheDocument();
  });
});
