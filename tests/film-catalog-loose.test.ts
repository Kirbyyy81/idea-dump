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

    test('rebrand aliases match catalogue films', () => {
        expect(findFilmCatalogEntryLoose('T5SWF', 'Kinoeye 400')?.slug).toBe('kinoeye-400d');
        expect(findFilmCatalogEntryLoose('慢曝T5SWF', 'Kinoeye400D')?.slug).toBe('kinoeye-400d');
        expect(findFilmCatalogEntryLoose('慢曝T5SWF', 'Another Film')).toBeUndefined();
        expect(findFilmCatalogEntryLoose('Lucidfilms', 'Kodak Vision 500T')?.slug).toBe('kodak-vision3-500t-5219');
        expect(findFilmCatalogEntryLoose('Yue Films', 'Kodak Vision3 500T 5219')?.slug).toBe('kodak-vision3-500t-5219');
        expect(findFilmCatalogEntryLoose('Piccolo', 'Piccolo')?.slug).toBe('piccolo-250');
    });

    test('distinct films do not collide', () => {
        expect(findFilmCatalogEntryLoose('Kodak', 'Gold 200')?.slug).toBe('kodak-gold-200-v2');
        expect(findFilmCatalogEntryLoose('Kodak', 'Vision3 250D 5207')?.slug).toBe('kodak-vision3-250d-5207');
        expect(findFilmCatalogEntryLoose('Ilford', 'HP5 Plus 400')?.slug).toBe('ilford-hp5-plus-400');
    });
});
