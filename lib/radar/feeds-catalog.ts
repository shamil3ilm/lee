/**
 * Official announcement feeds of AI labs and companies (new products and
 * models are announced on company blogs first). Every feed was fetched
 * live on 2026-10-08 with lee's User-Agent: it answered 200 with RSS/Atom
 * items, and the site's robots.txt allows the feed path. Feeds exist to be
 * read by feed readers; lee keeps only the title, link, date and an
 * excerpt of at most 500 characters, and links back to the post.
 * docs/ai-radar.md lists the labs checked that offer no feed (they are not
 * fetched). Client-safe: no imports.
 */

export interface OfficialFeed {
  /** Stable id — never change once shipped (stored in item metrics). */
  id: string
  /** Who publishes it. */
  org: string
  label: string
  url: string
}

export const OFFICIAL_FEEDS: readonly OfficialFeed[] = [
  { id: 'openai', org: 'OpenAI', label: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
  { id: 'google-deepmind', org: 'Google DeepMind', label: 'Google DeepMind blog', url: 'https://deepmind.google/blog/rss.xml' },
  { id: 'google-ai', org: 'Google', label: 'Google — AI (The Keyword)', url: 'https://blog.google/innovation-and-ai/technology/ai/rss/' },
  { id: 'google-developers', org: 'Google', label: 'Google Developers Blog (Gemini API)', url: 'https://developers.googleblog.com/feeds/posts/default/' },
  { id: 'google-research', org: 'Google', label: 'Google Research blog', url: 'https://research.google/blog/rss/' },
  { id: 'meta-newsroom', org: 'Meta', label: 'Meta Newsroom', url: 'https://about.fb.com/news/feed/' },
  { id: 'meta-engineering', org: 'Meta', label: 'Engineering at Meta', url: 'https://engineering.fb.com/feed/' },
  { id: 'microsoft-ai-news', org: 'Microsoft', label: 'Microsoft Source — AI', url: 'https://news.microsoft.com/source/topics/ai/feed/' },
  { id: 'microsoft-research', org: 'Microsoft', label: 'Microsoft Research blog', url: 'https://www.microsoft.com/en-us/research/feed/' },
  { id: 'mistral', org: 'Mistral AI', label: 'Mistral AI news', url: 'https://mistral.ai/news/rss' },
  { id: 'huggingface', org: 'Hugging Face', label: 'Hugging Face blog', url: 'https://huggingface.co/blog/feed.xml' },
  { id: 'nvidia', org: 'NVIDIA', label: 'NVIDIA blog', url: 'https://blogs.nvidia.com/feed/' },
  { id: 'nvidia-developer', org: 'NVIDIA', label: 'NVIDIA Technical Blog', url: 'https://developer.nvidia.com/blog/feed' },
  { id: 'aws-ml', org: 'Amazon', label: 'AWS Machine Learning blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/' },
  { id: 'apple-ml', org: 'Apple', label: 'Apple Machine Learning Research', url: 'https://machinelearning.apple.com/rss.xml' },
  { id: 'github-ai', org: 'GitHub', label: 'The GitHub Blog — AI & ML', url: 'https://github.blog/ai-and-ml/feed/' },
  { id: 'together', org: 'Together AI', label: 'Together AI blog', url: 'https://www.together.ai/blog/rss.xml' },
  { id: 'ollama', org: 'Ollama', label: 'Ollama blog', url: 'https://ollama.com/blog/rss.xml' },
  { id: 'qwen', org: 'Qwen (Alibaba)', label: 'Qwen blog', url: 'https://qwenlm.github.io/blog/index.xml' },
]

export function feedById(id: string | null | undefined): OfficialFeed | null {
  return OFFICIAL_FEEDS.find((f) => f.id === id) ?? null
}

/** Hosts of the official feeds: a post on one of them is a primary source. */
export const OFFICIAL_HOSTS: ReadonlySet<string> = new Set(
  OFFICIAL_FEEDS.map((f) => new URL(f.url).hostname.replace(/^www\./, '')),
)
