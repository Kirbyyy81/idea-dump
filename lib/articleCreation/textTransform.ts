import {
    DEFAULT_IMAGE_SUFFIX,
    IMAGE_NAME_PREFIX,
} from '@/lib/articleCreation/constants';

export function toSlug(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/&/g, ' and ')
        .replace(/['\u2019]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function getWordCount(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    return trimmed.split(/\s+/).filter(Boolean).length;
}

export function getReadingTime(text: string): {
    wordCount: number;
    minutes: number;
    label: string;
} {
    const wordCount = getWordCount(text);
    if (wordCount === 0) {
        return {
            wordCount: 0,
            minutes: 0,
            label: '',
        };
    }

    const minutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
        wordCount,
        minutes,
        label: `${minutes} min read`,
    };
}

export function buildImageName(
    title: string,
    suffix: string = DEFAULT_IMAGE_SUFFIX
): string {
    const slug = toSlug(title);
    if (!slug) return '';

    return `${IMAGE_NAME_PREFIX}-${slug}-${suffix}`;
}

export function buildTocAnchors(multilineText: string): string[] {
    return multilineText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => toSlug(line))
        .filter(Boolean)
        .map((line, index) => `${index + 1}-${line}`);
}
