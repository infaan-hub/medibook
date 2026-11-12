import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Brain, CheckCircle2 } from "lucide-react";
import { Card, Button } from "../components/ui";

export function PsychotherapySuccessScreen() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <Card className="card--fit">
        <div className="booking-success">
          <div className="booking-success__icon"><CheckCircle2 size={48} /></div>
          <h1 className="page__title">{t("psychotherapy.successTitle")}</h1>
          <p className="page__subtitle">
            {t("psychotherapy.successDesc")}
          </p>
          <div className="booking-success__actions">
            <Link to="/psychotherapy"><Button>{t("psychotherapy.viewMine")}</Button></Link>
            <Link to="/dashboard"><Button variant="secondary">{t("psychotherapy.home")}</Button></Link>
          </div>
        </div>
      </Card>
    </div>
  );
}