import { Link } from "react-router-dom";
import { Brain, CheckCircle2 } from "lucide-react";
import { Card, Button } from "../components/ui";

export function PsychotherapySuccessScreen() {
  return (
    <div className="page">
      <Card className="card--fit">
        <div className="booking-success">
          <div className="booking-success__icon"><CheckCircle2 size={48} /></div>
          <h1 className="page__title">Request sent</h1>
          <p className="page__subtitle">
            Your psychology service request has been submitted. A coordinator will review and assign a psychologist.
            You will be notified when it is accepted.
          </p>
          <div className="booking-success__actions">
            <Link to="/psychotherapy"><Button>View my psychology service</Button></Link>
            <Link to="/dashboard"><Button variant="secondary">Home</Button></Link>
          </div>
        </div>
      </Card>
    </div>
  );
}