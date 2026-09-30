import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createArticle, listMyArticles, type Article } from "../api/blog";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { useToast } from "../state/app-context";
import { Newspaper } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

const CATEGORIES = ["health_tips", "wellness", "nutrition", "mental_health", "fitness", "general"];

/**
 * Doctor → Health Tips: write an article (front image required) and review the
 * ones already published to the patient Health Tips feed.
 */
export function DoctorHealthTipsScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("health_tips");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listMyArticles()
      .then((r) => setArticles(r.data?.results ?? []))
      .catch((reason: unknown) => setError(message(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      notify("error", "Title and article text are required.");
      return;
    }
    if (!file) {
      notify("error", "Choose a front image for the article.");
      return;
    }
    const form = new FormData();
    form.append("title", title.trim());
    form.append("excerpt", excerpt.trim());
    form.append("content", content.trim());
    form.append("category", category);
    form.append("image", file);
    setSaving(true);
    try {
      await createArticle(form);
      notify("success", "Health tip published — patients can read it now.");
      setTitle("");
      setExcerpt("");
      setContent("");
      setCategory("health_tips");
      setFile(null);
      const input = document.getElementById("health-tip-image") as HTMLInputElement | null;
      if (input) input.value = "";
      load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page health-tips-page">
      <h1 className="page__title">Health Tips</h1>
      <p className="health-tips-page__lead">
        Write a health article for patients — it appears on their Health Tips feed as a card with
        your name and photo attribution.
      </p>

      <Card className="admin-form-card health-tips-page__form">
        <form onSubmit={submit} className="admin-form-grid">
          <TextField
            id="health-tip-title"
            label="Title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <TextField
            id="health-tip-excerpt"
            label="Short description"
            name="excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            hint="Shown on the patient's card (1–2 sentences)."
          />
          <label className="admin-field">
            <span>
              Category <b aria-hidden="true">*</b>
            </span>
            <select
              className="health-tips-page__select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {t(`blog.categories.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field admin-field--wide">
            <span>
              Article text <b aria-hidden="true">*</b>
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={9}
              required
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>
              Front image <b aria-hidden="true">*</b>
            </span>
            <input
              id="health-tip-image"
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <div className="admin-form-actions">
            <Button type="submit" loading={saving}>
              Publish health tip
            </Button>
          </div>
        </form>
      </Card>

      <h2 className="health-tips-page__section">My articles</h2>
      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={28} />}
          title="No articles yet"
          description="Your published health tips will appear here."
        />
      ) : (
        <div className="blog__grid">
          {articles.map((article) => (
            <div key={article.id} className="blog__card">
              {article.image && (
                <img
                  src={article.image}
                  alt={article.title}
                  className="blog__card-image"
                  loading="lazy"
                />
              )}
              <div className="blog__card-body">
                <span className="blog__card-category">{t(`blog.categories.${article.category}`)}</span>
                <h3 className="blog__card-title">{article.title}</h3>
                <p className="blog__card-excerpt">{article.excerpt}</p>
                <time className="blog__card-date">
                  {(article.published_at ?? article.created_at) &&
                    new Date(article.published_at ?? article.created_at).toLocaleDateString()}
                </time>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
