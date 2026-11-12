import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, Button } from "../components/ui";

export function TrainingSuccessScreen() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <Card>
        <h1 className="page__title">{t("training.successTitle")}</h1>
        <p>{t("training.successDesc")}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link to="/training"><Button>{t("training.viewMine")}</Button></Link>
          <Link to="/dashboard"><Button variant="secondary">{t("training.home")}</Button></Link>
        </div>
      </Card>
    </div>
  );
}
