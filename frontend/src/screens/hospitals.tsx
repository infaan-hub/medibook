/** PHASE 8 — Hospital catalog pages (React).

Public screens:
 - HospitalListPage  : /hospitals — paginated hospital directory with city filter
 - HospitalDetailPage: /hospitals/:id — single hospital detail
*/

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getHospital, listHospitals } from "../api/specialties";
import type { Hospital } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { Hospital as HospitalIcon, Phone, Search } from "lucide-react";

export function HospitalListPage() {
  const { t } = useTranslation();
  const [hospitals, setHospitals] = useState<Hospital[] | null>(null);
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (pageNum: number, cityFilter?: string) => {
      setLoading(true);
      setError(null);
      listHospitals(cityFilter, pageNum, 12)
        .then((response) => {
          if (response.success) {
            setHospitals(response.data.results);
            setTotalPages(Math.ceil(response.data.count / 12) || 1);
          } else {
            setError(response.message);
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load(page, city || undefined);
  }, [page, city, load]);

  const handleSearch = (value: string) => {
    setCity(value);
    setPage(1);
  };

  return (
    <div className="page">
      <h1 className="page__title">{t("hospitals.title")}</h1>
      <p className="page__subtitle">{t("hospitals.subtitle")}</p>

      <Card className="hospitals__filters">
        <TextField
          id="hospital-city"
          label={t("hospitals.filterCity")}
          value={city}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder={t("hospitals.cityPlaceholder")}
          className="hospitals__search-input"
        />
      </Card>

      {error && <ErrorState message={error} onRetry={() => load(page, city || undefined)} />}
      {loading && hospitals === null && <Skeleton lines={6} />}

      {!loading && hospitals && hospitals.length === 0 && (
        <EmptyState
          icon={<HospitalIcon size={40} />}
          title={t("hospitals.noHospitals")}
          description={city ? t("hospitals.noHospitalsIn", { city }) : t("hospitals.empty")}
        />
      )}

      {!loading && hospitals && hospitals.length > 0 && (
        <div className="hospitals-grid">
          {hospitals.map((hospital) => (
            <Link key={hospital.id} to={`/hospitals/${hospital.id}`} className="hospital-card">
              <Card className="hospital-card__inner">
                <div className="hospital-card__header">
                  <span className="hospital-card__icon">
                    <HospitalIcon size={20} />
                  </span>
                  <h2 className="hospital-card__name">{hospital.name}</h2>
                </div>
                <p className="hospital-card__city">{hospital.city}</p>
                {hospital.address && (
                  <p className="hospital-card__address">{hospital.address}</p>
                )}
                {hospital.phone && (
                  <p className="hospital-card__contact">
                    <Phone size={14} /> {hospital.phone}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("common.previous")}
          </Button>
          <span className="pagination__info">
            {t("hospitals.pageOf", { page, total: totalPages })}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function HospitalDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getHospital(Number(id))
      .then((response) => {
        if (response.success) {
          setHospital(response.data);
        } else {
          setError(response.message);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && hospital === null && <Skeleton lines={8} />}

      {!loading && hospital && (
        <div className="hospital-detail">
          <Card className="hospital-detail__header">
            <div className="hospital-detail__title-row">
              <span className="hospital-detail__icon">
                <HospitalIcon size={24} />
              </span>
              <h1 className="hospital-detail__name">{hospital.name}</h1>
            </div>
            <p className="hospital-detail__city">{hospital.city}</p>
          </Card>

          <div className="hospital-detail__grid">
            <Card className="hospital-detail__info">
              <h2 className="card__title">{t("hospitals.contactInformation")}</h2>
              {hospital.address && (
                <div className="hospital-detail__field">
                  <span className="hospital-detail__label">{t("settings.address")}</span>
                  <p className="hospital-detail__value">{hospital.address}</p>
                </div>
              )}
              {hospital.phone && (
                <div className="hospital-detail__field">
                  <span className="hospital-detail__label">{t("profile.phone")}</span>
                  <a
                    href={`tel:${hospital.phone}`}
                    className="hospital-detail__link"
                  >
                    {hospital.phone}
                  </a>
                </div>
              )}
              {hospital.email && (
                <div className="hospital-detail__field">
                  <span className="hospital-detail__label">{t("hospitals.email")}</span>
                  <a
                    href={`mailto:${hospital.email}`}
                    className="hospital-detail__link"
                  >
                    {hospital.email}
                  </a>
                </div>
              )}
            </Card>

            {hospital.location_details && Object.keys(hospital.location_details).length > 0 && (
              <Card className="hospital-detail__info">
                <h2 className="card__title">{t("hospitals.locationDetails")}</h2>
                <div className="hospital-detail__fields">
                  {Object.entries(hospital.location_details).map(([key, value]) => (
                    <div key={key} className="hospital-detail__field">
                      <span className="hospital-detail__label">
                        {key.replace(/_/g, " ")}
                      </span>
                      <p className="hospital-detail__value">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="hospital-detail__actions">
            <Link to="/hospitals" className="btn btn--ghost">
              {t("hospitals.backToHospitals")}
            </Link>
          </div>
        </div>
      )}

      {!loading && !hospital && !error && (
        <EmptyState
          icon={<Search size={40} />}
          title={t("hospitals.notFound")}
          description={t("hospitals.notFoundDesc")}
          action={<Link to="/hospitals">{t("hospitals.browseAll")}</Link>}
        />
      )}
    </div>
  );
}
