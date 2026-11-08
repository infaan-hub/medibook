import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminCreateUserScreen } from "../screens/admin-dashboard";
import { ToastProvider } from "../state/app-context";

describe("admin create-user role selector", () => {
  it("offers patient, doctor, and system coordinator with role-specific guidance", () => {
    render(<MemoryRouter><ToastProvider><AdminCreateUserScreen /></ToastProvider></MemoryRouter>);
    const role = screen.getByRole("combobox", { name: /Account role/ });
    expect(role).toHaveValue("patient");
    expect(screen.getByRole("option", { name: "Patient" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Doctor" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "System coordinator" })).toBeInTheDocument();
    fireEvent.change(role, { target: { value: "coordinator" } });
    expect(screen.getByText(/Coordinates doctors, appointments, emergencies, and patient history/)).toBeInTheDocument();
  });
});

