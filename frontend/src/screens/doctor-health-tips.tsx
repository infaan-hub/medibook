import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  createArticle,
  deleteArticle,
  listMyArticles,
  updateArticle,
  type Article,
} from "../api/blog";
import { Button, Card, EmptyState, ErrorState, Skeleton, TextField } from "../components/ui";
import { useToast } from "../state/app-context";
import { Newspaper } from "lucide-react";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function authorLabel(article: Article): string {
  if (!article.author_name) return "";
  return article.author_role === "doctor" ? `Dr. ${article.author_name}` : article.author_name;
}

const CATEGORIES = ["health_tips", "wellness", "nutrition", "mental_health", "fitness", "general"];

/**
 * Doctor → Health Tips: write an article (front image required), then edit or
 * delete the ones already sent to the patient Health Tips feed.
 */
export function DoctorHealthTipsScreen() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

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

  function clearImageInput() {
    setFile(null);
    const input = document.getElementById("health-tip-image") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function resetForm() {
    setTitle("");
    setExcerpt("");
    setContent("");
    setCategory("health_tips");
    clearImageInput();
  }

  function startEdit(article: Article) {
    setEditing(article);
    setTitle(article.title);
    setExcerpt(article.excerpt ?? "");
    setContent(article.content ?? "");
    setCategory(article.category);
    clearImageInput();
    document.getElementById("health-tip-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditing(null);
    resetForm();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      notify("error", "Title and article text are required.");
      return;
    }
    if (!editing && !file) {
      notify("error", "Choose a front image for the article.");
      return;
    }
    const form = new FormData();
    form.append("title", title.trim());
    form.append("excerpt", excerpt.trim());
    form.append("content", content.trim());
    form.append("category", category);
    if (file) form.append("image", file);
    setSaving(true);
    try {
      if (editing) {
        await updateArticle(editing.slug, form);
        notify("success", "Health tip updated.");
      } else {
        await createArticle(form);
        notify("success", "Health tip published — patients can read it now.");
      }
      setEditing(null);
      resetForm();
      load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setSaving(false);
    }
  }

  async function remove(article: Article) {
    if (!window.confirm(`Delete "${article.title}"? Patients will no longer see it.`)) return;
    setDeleting(article.id);
    try {
      await deleteArticle(article.slug);
      notify("success", "Health tip deleted.");
      if (editing?.id === article.id) {
        setEditing(null);
        resetForm();
      }
      load();
    } catch (reason) {
      notify("error", message(reason));
    } finally {
      setDeleting(null);
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
        <div className="health-tips-page__form-head">
          <h2>{editing ? "Edit health tip" : "New health tip"}</h2>
          {editing && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
        </div>
        <form id="health-tip-form" onSubmit={submit} className="admin-form-grid">
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
              Front image{" "}
              {editing ? (
                "(optional — keeps the current image)"
              ) : (
                <b aria-hidden="true">*</b>
              )}
            </span>
            <input
              id="health-tip-image"
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required={!editing}
            />
          </label>
          <div className="admin-form-actions">
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : "Publish health tip"}
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
                {article.author_name && (
                  <span className="blog__card-author">{authorLabel(article)}</span>
                )}
                {!article.published && <span className="blog__card-status">Draft</span>}
                <time className="blog__card-date">
                  {(article.published_at ?? article.created_at) &&
                    new Date(article.published_at ?? article.created_at).toLocaleDateString()}
                </time>
                <div className="health-tips-card-actions">
                  <Button type="button" variant="secondary" onClick={() => startEdit(article)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    loading={deleting === article.id}
                    onClick={() => remove(article)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
