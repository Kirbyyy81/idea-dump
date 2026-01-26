'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
    onSearch: (query: string) => void;
    placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search projects...' }: SearchBarProps) {
    const [query, setQuery] = useState('');

    const handleChange = (value: string) => {
        setQuery(value);
        onSearch(value);
    };

    const handleClear = () => {
        setQuery('');
        onSearch('');
    };

    return (
        <div className="relative">
            <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
            />
            <input
                type="text"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder}
                className="input pl-11 pr-10"
            />
            {query && (
                <button
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <X size={18} />
                </button>
            )}
        </div>
    );
}
