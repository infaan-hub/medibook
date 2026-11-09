import { Link } from "react-router-dom";
import { Card, Button } from "../components/ui";

export function PsychotherapySuccessScreen() {
  return (
    <div className="page">
      <Card>
        <h1 className="page__title">Request sent</h1>
        <p>Your psychotherapy request has been submitted. A coordinator will review and assign a psychologist. You will be notified when it is accepted.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link to="/psychotherapy"><Button>View my psychotherapy</Button></Link>
          <Link to="/dashboard"><Button variant="secondary">Home</Button></Link>
        </div>
      </Card>
    </div>
  );
}