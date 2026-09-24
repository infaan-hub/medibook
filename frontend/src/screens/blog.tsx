import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listArticles, getArticle, type Article } from "../api/blog";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ChevronLeft, Newspaper } from "lucide-react";

const CATEGORIES = [
  { key: "", labelKey: "blog.categories.all" },
  { key: "health_tips", labelKey: "blog.categories.health_tips" },
  { key: "wellness", labelKey: "blog.categories.wellness" },
  { key: "nutrition", labelKey: "blog.categories.nutrition" },
  { key: "mental_health", labelKey: "blog.categories.mental_health" },
  { key: "fitness", labelKey: "blog.categories.fitness" },
  { key: "general", labelKey: "blog.categories.general" },
];

export function BlogListPage() {
  const { t } = useTranslation();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listArticles(category || undefined)
      .then((r) => setArticles(r.data?.results ?? []))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load articles.")
      )
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page blog-page">
      <h1 className="page__title">{t("blog.title")}</h1>

      <div className="blog__categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`btn btn--sm ${category === cat.key ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setCategory(cat.key)}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <div className="blog__grid">
          <Skeleton lines={6} />
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={28} />}
          title={t("blog.noArticles")}
          description={t("blog.noArticlesDesc")}
        />
      ) : (
        <div className="blog__grid">
          {articles.map((article) => (
            <Link
              key={article.id}
              to={`/blog/${article.slug}`}
              className="blog__card"
            >
              {article.image && (
                <img
                  src={article.image}
                  alt={article.title}
                  className="blog__card-image"
                  loading="lazy"
                />
              )}
              <div className="blog__card-body">
                <span className="blog__card-category">
                  {t(`blog.categories.${article.category}`)}
                </span>
                <h3 className="blog__card-title">{article.title}</h3>
                <p className="blog__card-excerpt">{article.excerpt}</p>
                {article.published_at && (
                  <time className="blog__card-date">
                    {new Date(article.published_at).toLocaleDateString()}
                  </time>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogArticlePage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getArticle(slug)
      .then((r) => setArticle(r.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Article not found.")
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="page">
        <Skeleton lines={8} />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="page">
        <ErrorState message={error || "Article not found."} />
        <Link to="/blog" className="btn btn--ghost">
          <ChevronLeft size={16} /> {t("blog.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="page blog-article">
      <Link to="/blog" className="btn btn--ghost blog-article__back">
        <ChevronLeft size={16} /> {t("blog.backToList")}
      </Link>

      <article className="blog-article__content">
        <span className="blog__card-category">
          {t(`blog.categories.${article.category}`)}
        </span>
        <h1>{article.title}</h1>
        <div className="blog-article__meta">
          {article.author_name && <span>{article.author_name}</span>}
          {article.published_at && (
            <time>{new Date(article.published_at).toLocaleDateString()}</time>
          )}
        </div>
        {article.image && (
          <img
            src={article.image}
            alt={article.title}
            className="blog-article__image"
          />
        )}
        <div className="blog-article__body">
          {article.content || article.excerpt}
        </div>
      </article>
    </div>
  );
}
