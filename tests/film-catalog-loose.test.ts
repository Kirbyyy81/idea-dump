import { findFilmCatalogEntryLoose } from '@/lib/film/catalog';
import { expect, test, describe } from 'vitest';

describe('findFilmCatalogEntryLoose', () => {
    test('exact match still works', () => {
        expect(findFilmCatalogEntryLoose('Kodak', 'Portra 400')?.slug).toBe('kodak-portra-400');
    });

    test('hand-typed variants match', () => {
        expect(findFilmCatalogEntryLoose('Kodak', 'Portra 400 120')?.slug).toBe('kodak-portra-400');
        expect(findFilmCatalogEntryLoose('Ilford', 'HP5 Plus')?.slug).toBe('ilford-hp5-plus-400');
        expect(findFilmCatalogEntryLoose('Ilford', 'HP5')?.slug).toBe('ilford-hp5-plus-400');
        expect(findFilmCatalogEntryLoose('Fujifilm', 'C200')?.slug).toBe('fujicolor-c200-v2');
        expect(findFilmCatalogEntryLoose('Kodak', 'Gold 200 35mm film')?.slug).toBe('kodak-gold-200-v2');
        expect(findFilmCatalogEntryLoose('CineStill', '800T')?.slug).toBe('cinestill-800t-v2');
        expect(findFilmCatalogEntryLoose('Kodak', 'Ultramax 400')?.slug).toBe('kodak-ultramax-400-v3');
        expect(findFilmCatalogEntryLoose('Fujifilm', 'Neopan Acros 100')?.slug).toBe('fuji-acros-100-ii-v2');
    });

    test('no match returns undefined', () => {
        expect(findFilmCatalogEntryLoose('Kodak', 'Something Weird')).toBeUndefined();
        expect(findFilmCatalogEntryLoose('Kodak', '')).toBeUndefined();
    });

    test('cross-brand lookup when brand unknown', () => {
        expect(findFilmCatalogEntryLoose('', 'Portra 400')?.slug).toBe('kodak-portra-400');
    });
});
