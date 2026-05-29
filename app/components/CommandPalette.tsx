'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

interface Link {
    id: string;
    title: string;
    url?: string;
    domain?: string;
    count?: number;
    meta?: {
        title?: string;
        domain?: string;
        [key: string]: any;
    };
    [key: string]: any;
}

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Link[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Listen for Cmd+K / Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(!isOpen);
                setSearch('');
                setResults([]);
                setSelectedIndex(0);
            } else if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    // Search articles
    useEffect(() => {
        if (!search.trim()) {
            setResults([]);
            setSelectedIndex(0);
            return;
        }

        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/links?limit=10000&offset=0&mode=latest');
                if (!response.ok) {
                    setLoading(false);
                    return;
                }
                const data = await response.json();
                if (cancelled) return;

                const allLinks = data.items || data || [];

                const query = search.toLowerCase();
                const queryWords = query.split(/\s+/).filter(Boolean);

                const filtered = allLinks
                    .filter((link: Link) => {
                        if (!link || !link.id) {
                            return false;
                        }
                        // Try multiple possible title properties
                        const title = (link.title || link.meta?.title || '').toLowerCase();
                        // Try multiple possible domain properties
                        const domain = (link.domain || link.meta?.domain || '').toLowerCase();

                        if (!title && !domain) {
                            return false;
                        }

                        const combined = `${title} ${domain}`;

                        // Match if any word matches, or if the full query is contained
                        const matches = (
                            queryWords.some(word => combined.includes(word)) ||
                            combined.includes(query)
                        );

                        return matches;
                    })
                    .sort((a: Link, b: Link) => {
                        // Prioritize title matches over domain matches
                        const aTitle = (a.title || '').toLowerCase();
                        const bTitle = (b.title || '').toLowerCase();
                        const aHasQuery = aTitle.includes(query) ? 1 : 0;
                        const bHasQuery = bTitle.includes(query) ? 1 : 0;
                        return bHasQuery - aHasQuery;
                    })
                    .slice(0, 10);


                if (!cancelled) {
                    setResults(filtered);
                    setSelectedIndex(0);
                }
            } catch (e) {
                if (!cancelled) {
                    setResults([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [search]);

    const handleSelect = (link: Link) => {
        if (!link.id) return;

        posthog.capture('search_article_opened', {
            article_id: link.id,
            article_title: link.title,
            search_query: search,
        });

        setIsOpen(false);
        setSearch('');
        setResults([]);
        router.push(`/reader/${encodeURIComponent(link.id)}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
            <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
                <div className="command-palette-header">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search articles... (Press ESC to close)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="command-palette-input"
                    />
                </div>

                {loading ? (
                    <div className="command-palette-empty">Searching...</div>
                ) : results.length === 0 && search ? (
                    <div className="command-palette-empty">No articles found</div>
                ) : results.length === 0 ? (
                    <div className="command-palette-empty">Start typing to search articles</div>
                ) : (
                    <div className="command-palette-results">
                        {results.map((result, idx) => {
                            const title = result.title || result.meta?.title || 'Untitled';
                            const domain = result.domain || result.meta?.domain || 'unknown';
                            return (
                                <button
                                    key={result.id}
                                    className={`command-palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleSelect(result)}
                                >
                                    <div className="command-palette-item-title">{title}</div>
                                    <div className="command-palette-item-meta">
                                        <span className="command-palette-domain">{domain}</span>
                                        {result.count ? <span className="command-palette-votes">• {result.count} votes</span> : ''}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="command-palette-footer">
                    <span>↑ ↓ to navigate</span>
                    <span>ENTER to open</span>
                    <span>ESC to close</span>
                </div>
            </div>
        </div>
    );
}
