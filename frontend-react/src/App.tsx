import { useEffect, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  source_url: string;
  is_generated: boolean;
  original_article_id: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

  useEffect(() => {
    axios.get<Article[]>(`${apiBaseUrl}/api/articles`)
      .then(res => {
        setArticles(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('API Error:', err);
        setLoading(false);
      });
  }, []);

  const closeModal = () => setSelectedArticle(null);
  const openModal = (article: Article) => setSelectedArticle(article);
  const originalArticles = articles.filter(article => !article.is_generated);
  const generatedArticles = articles.filter(article => article.is_generated);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-6"></div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Loading BeyondChats...</h1>
          <p className="text-lg text-gray-600">Original + AI Enhanced Articles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent mb-6">
            BeyondChats AI
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
            Laravel + Groq LLM + React TSX - Original articles + AI enhanced versions
          </p>
        </div>

        {/* Original Articles */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900">Original Articles</h2>
              <p className="text-gray-600 mt-2">Scraped from BeyondChats.</p>
            </div>
            <span className="text-sm font-semibold px-3 py-1 bg-emerald-100/80 text-emerald-800 rounded-full">
              {originalArticles.length} total
            </span>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {originalArticles.map((article: Article) => (
              <article 
                key={article.id} 
                className="group p-8 rounded-3xl shadow-2xl border-4 transition-all duration-500 hover:-translate-y-3 hover:shadow-3xl backdrop-blur-sm cursor-pointer bg-white/90 border-gray-200/60 hover:border-blue-200/80"
                onClick={() => openModal(article)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openModal(article);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {/* Badge */}
                <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold mb-6 shadow-lg transform group-hover:scale-105 transition-all bg-emerald-500/90 text-white shadow-emerald-500/50">
                  Original BeyondChats
                </div>
                
                {/* Title */}
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 leading-tight group-hover:text-blue-600 transition-all line-clamp-2">
                  {article.title}
                </h2>
                
                {/* Preview */}
                <div 
                  className="text-gray-700 mb-8 leading-relaxed line-clamp-4 prose prose-sm max-w-none" 
                  dangerouslySetInnerHTML={{ 
                    __html: article.content.replace(/<[^>]*>/g, '').substring(0, 300) 
                  }} 
                />
                
                {/* Footer */}
                <div className="flex items-center justify-between pt-6 border-t border-gray-200/50">
                  <a 
                    href={article.source_url} 
                    target="_blank" 
                    className="inline-flex items-center space-x-2 text-xl font-bold text-blue-600 hover:text-blue-800 group-hover:translate-x-2 transition-all"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span>Full Article</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                  <span className="text-sm font-semibold px-3 py-1 bg-gray-100/80 rounded-full backdrop-blur-sm">
                    Article #{article.id}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* AI Enhanced Articles */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900">AI Enhanced Articles</h2>
              <p className="text-gray-600 mt-2">Updated with LLM insights.</p>
            </div>
            <span className="text-sm font-semibold px-3 py-1 bg-blue-100/80 text-blue-800 rounded-full">
              {generatedArticles.length} total
            </span>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {generatedArticles.map((article: Article) => (
              <article 
                key={article.id} 
                className="group p-8 rounded-3xl shadow-2xl border-4 transition-all duration-500 hover:-translate-y-3 hover:shadow-3xl backdrop-blur-sm cursor-pointer bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-indigo-500/20 border-blue-300/50"
                onClick={() => openModal(article)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openModal(article);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {/* Badge */}
                <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold mb-6 shadow-lg transform group-hover:scale-105 transition-all bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-blue-500/50">
                  AI Enhanced (Groq)
                </div>
                
                {/* Title */}
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 leading-tight group-hover:text-blue-600 transition-all line-clamp-2">
                  {article.title}
                </h2>
                
                {/* Preview */}
                <div 
                  className="text-gray-700 mb-8 leading-relaxed line-clamp-4 prose prose-sm max-w-none" 
                  dangerouslySetInnerHTML={{ 
                    __html: article.content.replace(/<[^>]*>/g, '').substring(0, 300) 
                  }} 
                />
                
                {/* Footer */}
                <div className="flex items-center justify-between pt-6 border-t border-gray-200/50">
                  <a 
                    href={article.source_url} 
                    target="_blank" 
                    className="inline-flex items-center space-x-2 text-xl font-bold text-blue-600 hover:text-blue-800 group-hover:translate-x-2 transition-all"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span>Full Article</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                  <span className="text-sm font-semibold px-3 py-1 bg-gray-100/80 rounded-full backdrop-blur-sm">
                    Article #{article.id}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">
                  {selectedArticle.is_generated ? 'AI Enhanced' : 'Original'}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 mt-1">
                  {selectedArticle.title}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-900 transition-colors text-2xl leading-none"
                aria-label="Close article"
              >
                X
              </button>
            </div>
            <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
              <ReactMarkdown className="prose max-w-none text-slate-800" remarkPlugins={[remarkGfm]}>
                {selectedArticle.content}
              </ReactMarkdown>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <a
                href={selectedArticle.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 font-semibold hover:text-blue-800"
              >
                Source article
              </a>
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-full bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
