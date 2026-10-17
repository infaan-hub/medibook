import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  listArticles,
  getArticle,
  toggleArticleLike,
  type Article,
} from "../api/blog";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { useToast } from "../state/app-context";
import {
  Activity,
  Apple,
  Brain,
  ChevronLeft,
  Dumbbell,
  Heart,
  HeartPulse,
  Leaf,
  Newspaper,
  type LucideIcon,
} from "lucide-react";

const CATEGORIES = [
  { key: "", labelKey: "blog.categories.all" },
  { key: "health_tips", labelKey: "blog.categories.health_tips" },
  { key: "wellness", labelKey: "blog.categories.wellness" },
  { key: "nutrition", labelKey: "blog.categories.nutrition" },
  { key: "mental_health", labelKey: "blog.categories.mental_health" },
  { key: "fitness", labelKey: "blog.categories.fitness" },
  { key: "general", labelKey: "blog.categories.general" },
];

function authorLabel(article: Article): string {
  if (!article.author_name) return "";
  return article.author_role === "doctor" ? `Dr. ${article.author_name}` : article.author_name;
}

/** Themed cover per category — every tip shows an image, uploaded or not. */
const CATEGORY_COVER: Record<string, { icon: LucideIcon; modifier: string }> = {
  health_tips: { icon: HeartPulse, modifier: "health-tips" },
  wellness: { icon: Leaf, modifier: "wellness" },
  nutrition: { icon: Apple, modifier: "nutrition" },
  mental_health: { icon: Brain, modifier: "mental-health" },
  fitness: { icon: Dumbbell, modifier: "fitness" },
  general: { icon: Activity, modifier: "general" },
};

/**
 * The tip's cover image. Uploaded images win; anything without one (or with a
 * broken /media link) gets a category-themed gradient + icon so the grid
 * never renders a card with no image at all.
 */
export function BlogCover({ article, className }: { article: Article; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (article.image && !broken) {
    return (
      <img
        src={article.image}
        alt={article.title}
        className={className}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  const cover = CATEGORY_COVER[article.category] ?? CATEGORY_COVER.general;
  const Icon = cover.icon;
  return (
    <div
      className={`blog__cover blog__cover--${cover.modifier}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={article.title}
    >
      <Icon size={36} aria-hidden="true" />
    </div>
  );
}

/** Heart toggle with the live count (optimistic in the parent). */
function LikeButton({
  liked,
  count,
  onToggle,
  className,
}: {
  liked: boolean;
  count: number;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`blog__like${liked ? " blog__like--liked" : ""}${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-pressed={liked}
      aria-label={t("blog.likes", { count })}
      title={liked ? t("blog.unlike") : t("blog.like")}
    >
      <Heart size={16} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
      <span>{count}</span>
    </button>
  );
}

export function BlogListPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
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

  /** Optimistic flip; the server's fresh count wins, rollback on failure. */
  const handleToggleLike = useCallback(
    async (article: Article) => {
      const prevLiked = article.liked_by_me ?? false;
      const prevCount = article.likes_count ?? 0;
      setArticles((rows) =>
        rows.map((a) =>
          a.id === article.id
            ? {
                ...a,
                liked_by_me: !prevLiked,
                likes_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
              }
            : a
        )
      );
      try {
        const r = await toggleArticleLike(article.slug);
        setArticles((rows) =>
          rows.map((a) =>
            a.id === article.id
              ? { ...a, liked_by_me: r.data.liked, likes_count: r.data.likes_count }
              : a
          )
        );
      } catch (err) {
        setArticles((rows) =>
          rows.map((a) =>
            a.id === article.id
              ? { ...a, liked_by_me: prevLiked, likes_count: prevCount }
              : a
          )
        );
        notify(
          "error",
          err instanceof Error ? err.message : "Could not update the like."
        );
      }
    },
    [notify]
  );

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
            <div key={article.id} className="blog__card">
              <BlogCover article={article} className="blog__card-image" />
              <div className="blog__card-body">
                <span className="blog__card-category">
                  {t(`blog.categories.${article.category}`)}
                </span>
                <h3 className="blog__card-title">
                  {/* Stretched link: the whole card opens the tip, while the
                      like button below stays independently tappable. */}
                  <Link to={`/blog/${article.slug}`} className="blog__card-title-link">
                    {article.title}
                  </Link>
                </h3>
                <p className="blog__card-excerpt">{article.excerpt}</p>
                {article.author_name && (
                  <span className="blog__card-author">{authorLabel(article)}</span>
                )}
                <div className="blog__card-footer">
                  {article.published_at && (
                    <time className="blog__card-date">
                      {new Date(article.published_at).toLocaleDateString()}
                    </time>
                  )}
                  <LikeButton
                    liked={article.liked_by_me ?? false}
                    count={article.likes_count ?? 0}
                    onToggle={() => handleToggleLike(article)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogArticlePage() {
  const { t } = useTranslation();
  const { notify } = useToast();
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

  /** Optimistic flip; the server's fresh count wins, rollback on failure. */
  const handleToggleLike = useCallback(async () => {
    if (!article) return;
    const prevLiked = article.liked_by_me ?? false;
    const prevCount = article.likes_count ?? 0;
    setArticle({
      ...article,
      liked_by_me: !prevLiked,
      likes_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
    });
    try {
      const r = await toggleArticleLike(article.slug);
      setArticle({
        ...article,
        liked_by_me: r.data.liked,
        likes_count: r.data.likes_count,
      });
    } catch (err) {
      setArticle({ ...article, liked_by_me: prevLiked, likes_count: prevCount });
      notify(
        "error",
        err instanceof Error ? err.message : "Could not update the like."
      );
    }
  }, [article, notify]);

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
          {article.author_name && <span>{authorLabel(article)}</span>}
          {article.published_at && (
            <time>{new Date(article.published_at).toLocaleDateString()}</time>
          )}
          <LikeButton
            liked={article.liked_by_me ?? false}
            count={article.likes_count ?? 0}
            onToggle={handleToggleLike}
            className="blog__like--article"
          />
        </div>
        <BlogCover article={article} className="blog-article__image" />
        <div className="blog-article__body">
          {article.content || article.excerpt}
        </div>
      </article>
    </div>
  );
}
