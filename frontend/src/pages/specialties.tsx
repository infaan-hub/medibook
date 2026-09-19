/** PHASE 8 — Specialty catalog pages (React).

Public screens:
 - SpecialtyListPage  : /specialties — paginated specialty directory
 - SpecialtyDetailPage: /specialties/:id — single specialty detail
*/

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getSpecialty, listSpecialties } from "../api/specialties";
import type { Specialty } from "../api/types";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../components/ui";

function formatSpecialties(
  specialties: Specialty[]
): (Specialty & { slug: string })[] {
  return specialties.map((s) => ({ ...s, slug: s.name.toLowerCase().replace(/\s+/g, "-") }));
}

export function SpecialtyListPage() {
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
      <h1 className="page__title">Medical Specialties</h1>
      <p className="page__subtitle">Explore healthcare specialties and find the right care.</p>

      {error && <ErrorState message={error} onRetry={() => load(page)} />}
      {loading && specialties === null && <Skeleton lines={6} />}

      {!loading && specialties && specialties.length === 0 && (
        <EmptyState
          icon="🏥"
          title="No specialties found"
          description="Specialty catalog is empty."
        />
      )}

      {!loading && specialties && specialties.length > 0 && (
        <div className="specialties-grid">
          {formatSpecialties(specialties).map((specialty) => (
            <Link key={specialty.id} to={`/specialties/${specialty.id}`} className="specialty-card">
              <Card className="specialty-card__inner">
                <div className="specialty-card__header">
                  <span className="specialty-card__icon">🏥</span>
                  <h2 className="specialty-card__name">{specialty.name}</h2>
                </div>
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
            Previous
          </Button>
          <span className="pagination__info">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function SpecialtyDetailPage() {
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

  return (
    <div className="page">
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && specialty === null && <Skeleton lines={8} />}

      {!loading && specialty && (
        <div className="specialty-detail">
          <Card className="specialty-detail__header">
            <div className="specialty-detail__title-row">
              <span className="specialty-detail__icon">🏥</span>
              <h1 className="specialty-detail__name">{specialty.name}</h1>
            </div>
            {specialty.description && (
              <p className="specialty-detail__description">{specialty.description}</p>
            )}
          </Card>

          <Card className="specialty-detail__info">
            <h2 className="card__title">About this specialty</h2>
            {specialty.description ? (
              <p className="specialty-detail__full-description">{specialty.description}</p>
            ) : (
              <p className="specialty-detail__empty">No description available.</p>
            )}
          </Card>

          <div className="specialty-detail__actions">
            <Link to="/doctors" className="btn btn--secondary">
              Find doctors in this specialty
            </Link>
            <Link to="/specialties" className="btn btn--ghost">
              Back to specialties
            </Link>
          </div>
        </div>
      )}

      {!loading && !specialty && !error && (
        <EmptyState
          icon="🔍"
          title="Specialty not found"
          description="This specialty doesn't exist or is no longer available."
          action={<Link to="/specialties">Browse all specialties</Link>}
        />
      )}
    </div>
  );
}