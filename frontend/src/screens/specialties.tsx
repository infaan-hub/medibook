/** PHASE 8 — Specialty catalog pages (React).

Public screens:
 - SpecialtyListPage  : /specialties — paginated specialty directory
 - SpecialtyDetailPage: /specialties/:id — single specialty detail
*/

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getSpecialty, listSpecialties } from "../api/specialties";
import type { Specialty } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { localizeSpecialty } from "../lib/specialty-translations";
import { Stethoscope, Search } from "lucide-react";

function formatSpecialties(
  specialties: Specialty[],
  language: string
): (Specialty & { slug: string })[] {
  return specialties.map((raw) => {
    const s = localizeSpecialty(raw, language);
    return { ...s, slug: s.name.toLowerCase().replace(/\s+/g, "-") };
  });
}

export function SpecialtyListPage() {
  const { t, i18n } = useTranslation();
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (pageNum: number) => {
      setLoading(true);
      setError(null);
      listSpecialties(pageNum, 12)
        .then((response) => {
          if (response.success) {
            setSpecialties(response.data.results);
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
    load(page);
  }, [page, load]);

  return (
    <div className="page">
      <h1 className="page__title">{t("specialties.title")}</h1>
      <p className="page__subtitle">{t("specialties.subtitle")}</p>

      {error && <ErrorState message={error} onRetry={() => load(page)} />}
      {loading && specialties === null && <Skeleton lines={6} />}

      {!loading && specialties && specialties.length === 0 && (
        <EmptyState
          icon={<Stethoscope size={40} />}
          title={t("specialties.none")}
          description={t("specialties.empty")}
        />
      )}

      {!loading && specialties && specialties.length > 0 && (
        <div className="specialties-grid">
          {formatSpecialties(specialties, i18n.language).map((specialty) => (
            <Link key={specialty.id} to={`/specialties/${specialty.id}`} className="specialty-card">
              <Card className="specialty-card__inner">
                <div className="specialty-card__header">
                  <span className="specialty-card__icon">
                    <Stethoscope size={20} />
                  </span>
                  <h2 className="specialty-card__name">{specialty.patient_friendly_name || specialty.name}</h2>
                </div>
                {specialty.patient_friendly_name && specialty.patient_friendly_name !== specialty.name && (
                  <p className="specialty-card__medical-name">{specialty.name}</p>
                )}
                {specialty.description && (
                  <p className="specialty-card__description">{specialty.description}</p>
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
            Page {page} of {totalPages}
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

export function SpecialtyDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getSpecialty(Number(id))
      .then((response) => {
        if (response.success) {
          setSpecialty(response.data);
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

  const display = specialty ? localizeSpecialty(specialty, i18n.language) : null;

  return (
    <div className="page">
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && specialty === null && <Skeleton lines={8} />}

      {!loading && display && (
        <div className="specialty-detail">
          <Card className="specialty-detail__header">
            <div className="specialty-detail__title-row">
              <span className="specialty-detail__icon">
                <Stethoscope size={24} />
              </span>
              <div>
                <h1 className="specialty-detail__name">{display.patient_friendly_name || display.name}</h1>
                {display.patient_friendly_name && display.patient_friendly_name !== display.name && (
                  <p className="specialty-detail__medical-name">{display.name}</p>
                )}
              </div>
            </div>
            {display.description && (
              <p className="specialty-detail__description">{display.description}</p>
            )}
          </Card>

          <Card className="specialty-detail__info">
            <h2 className="card__title">{t("specialties.treats")}</h2>
            {display.what_to_expect ? (
              <p className="specialty-detail__full-description">{display.what_to_expect}</p>
            ) : display.description ? (
              <p className="specialty-detail__full-description">{display.description}</p>
            ) : (
              <p className="specialty-detail__empty">{t("specialties.noDescription")}</p>
            )}
          </Card>

          <div className="specialty-detail__actions">
            <Link to={`/doctors?specialty=${display.id}`} className="btn btn--secondary">
              {t("specialties.findDoctors", { specialty: display.patient_friendly_name || display.name })}
            </Link>
            <Link to="/specialties" className="btn btn--ghost">
              {t("specialties.backToSpecialties")}
            </Link>
          </div>
        </div>
      )}

      {!loading && !specialty && !error && (
        <EmptyState
          icon={<Search size={40} />}
          title={t("specialties.notFound")}
          description={t("specialties.notFoundDesc")}
          action={<Link to="/specialties">{t("specialties.browseAll")}</Link>}
        />
      )}
    </div>
  );
}
