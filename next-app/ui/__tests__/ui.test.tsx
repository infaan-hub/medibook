import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  Spinner,
  Button,
  TextField,
  Card,
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui";

describe("Spinner", () => {
  it("renders with status role", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("respects custom label", () => {
    render(<Spinner label="Please wait" />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Please wait"
    );
  });
});

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn", "btn--danger");
  });

  it("disables when loading", () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("TextField", () => {
  it("renders label and input", () => {
    render(<TextField id="email" label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows error message and marks input invalid", () => {
    render(<TextField id="name" label="Name" error="Required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows hint when no error", () => {
    render(<TextField id="pw" label="Password" hint="8+ chars" />);
    expect(screen.getByText("8+ chars")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders children inside section", () => {
    render(<Card>Content</Card>);
    const section = screen.getByText("Content").closest("section");
    expect(section).toHaveClass("card");
  });
});

describe("Badge", () => {
  it("renders status text with badge class", () => {
    render(<Badge status="confirmed" />);
    const badge = screen.getByText("confirmed");
    expect(badge).toHaveClass("badge", "badge--confirmed");
  });
});

describe("EmptyState", () => {
  it("renders title and optional description", () => {
    render(<EmptyState title="No results" description="Try again later" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Try again later")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Refresh</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("renders error message", () => {
    render(<ErrorState message="Something broke" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });

  it("renders retry button when onRetry provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("renders correct number of lines", () => {
    const { container } = render(<Skeleton lines={5} />);
    expect(container.querySelectorAll(".skeleton__line")).toHaveLength(5);
  });
});
