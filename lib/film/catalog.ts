// Stock film catalogue derived from the canister label images in public/film-labels.
// Each entry slug matches a file public/film-labels/<slug>.webp.
// Films keep their commonly printed display names; brand values are the canister maker.

export interface FilmCatalogEntry {
    brand: string;
    name: string;
    slug: string;
    iso: number;
    process: 'C41' | 'E6' | 'BW' | 'ECN2';
}

export const FILM_CATALOG: FilmCatalogEntry[] = [
    { brand: 'Aeronega', name: 'Aeronega C41', slug: 'aeronega-c41', iso: 400, process: 'C41' },
    { brand: 'Agfa', name: 'Aviphot Pan 200', slug: 'agfa-aviphot-pan-200', iso: 200, process: 'BW' },
    { brand: 'Alien', name: 'Cinefilm 50D 5203', slug: 'alien-5203-50d', iso: 50, process: 'ECN2' },
    { brand: 'Alien', name: 'Cinefilm 250D 5207', slug: 'alien-5207-250d', iso: 250, process: 'ECN2' },
    { brand: 'Alien', name: 'Cinefilm 200T 5213', slug: 'alien-5213-200t', iso: 200, process: 'ECN2' },
    { brand: 'Alien', name: 'Cinefilm 500T 5219', slug: 'alien-5219-500t', iso: 500, process: 'ECN2' },
    { brand: 'Alien', name: 'Double-X BW 5222', slug: 'alien-5222-xx-bw', iso: 200, process: 'BW' },
    { brand: 'Alien', name: 'E100 5294', slug: 'alien-5294-e100', iso: 100, process: 'E6' },
    { brand: 'Alien', name: 'Aeronega 100', slug: 'alien-aeronega-100', iso: 100, process: 'C41' },
    { brand: 'Alien', name: 'CN400 Pro', slug: 'alien-cn400-pro', iso: 400, process: 'C41' },
    { brand: 'Cinefilm', name: '50D 5203', slug: 'cinefilm-5203-50d', iso: 50, process: 'ECN2' },
    { brand: 'Cinefilm', name: '250D 5207', slug: 'cinefilm-5207-250d', iso: 250, process: 'ECN2' },
    { brand: 'Cinefilm', name: '200T 5213', slug: 'cinefilm-5213-200t', iso: 200, process: 'ECN2' },
    { brand: 'Cinefilm', name: '500T 5219', slug: 'cinefilm-5219-500t', iso: 500, process: 'ECN2' },
    { brand: 'CineStill', name: '400D', slug: 'cinestill-400d-v2', iso: 400, process: 'C41' },
    { brand: 'CineStill', name: '50D', slug: 'cinestill-50d-v2', iso: 50, process: 'C41' },
    { brand: 'CineStill', name: '800T', slug: 'cinestill-800t-v2', iso: 800, process: 'C41' },
    { brand: 'CineStill', name: 'BwXX', slug: 'cinestill-bw-xx-v2', iso: 400, process: 'BW' },
    { brand: 'CineStill', name: 'Crystal 100D 5207', slug: 'cinestill-crystal-100d-5207', iso: 100, process: 'C41' },
    { brand: 'CineStill', name: 'Crystal 200T 5213', slug: 'cinestill-crystal-200t-5213', iso: 200, process: 'C41' },
    { brand: 'CineStill', name: 'Crystal 250D 5207', slug: 'cinestill-crystal-250d-5207', iso: 250, process: 'C41' },
    { brand: 'CineStill', name: 'Crystal 500T 5219', slug: 'cinestill-crystal-500t-5219', iso: 500, process: 'C41' },
    { brand: 'CineStill', name: 'Crystal 50D 5203', slug: 'cinestill-crystal-50d-5203', iso: 50, process: 'C41' },
    { brand: 'CineStill', name: 'Double-X 5222', slug: 'cinestill-double-x-5222', iso: 200, process: 'BW' },
    { brand: 'CineStill', name: 'Vision3 200T 5213', slug: 'cinestill-vision3-200t-5213', iso: 200, process: 'ECN2' },
    { brand: 'Foma', name: 'Fomapan 100 Classic', slug: 'fomapan-100-classic', iso: 100, process: 'BW' },
    { brand: 'Foma', name: 'Fomapan 200 Creative', slug: 'fomapan-200-creative', iso: 200, process: 'BW' },
    { brand: 'Foma', name: 'Fomapan 400 Action', slug: 'fomapan-400-action', iso: 400, process: 'BW' },
    { brand: 'Foma', name: 'Fomapan Pan 100', slug: 'fomapan-pan-100', iso: 100, process: 'BW' },
    { brand: 'Foma', name: 'Fomapan Pan 400', slug: 'fomapan-pan-400', iso: 400, process: 'BW' },
    { brand: 'Foma', name: 'Fomapan R 100', slug: 'fomapan-r-100', iso: 100, process: 'BW' },
    { brand: 'Fujifilm', name: 'Neopan Acros 100 II', slug: 'fuji-acros-100-ii-v2', iso: 100, process: 'BW' },
    { brand: 'Fujifilm', name: 'Pro 400H', slug: 'fuji-pro-400h-120-v2', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Provia 100F', slug: 'fuji-provia-100f-v3', iso: 100, process: 'E6' },
    { brand: 'Fujifilm', name: 'Simple Ace', slug: 'fuji-simple-ace', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Super G Ace 400', slug: 'fuji-super-g-ace-400', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Superia Premium 400', slug: 'fuji-superia-premium-400-v2', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Superia X-TRA 400', slug: 'fuji-superia-xtra-400', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Velvia 100', slug: 'fuji-velvia-100', iso: 100, process: 'E6' },
    { brand: 'Fujifilm', name: 'Velvia 50', slug: 'fuji-velvia-50-v4', iso: 50, process: 'E6' },
    { brand: 'Fujifilm', name: 'X-TRA 400', slug: 'fuji-xtra-400-v3', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Fujicolor 100', slug: 'fujicolor-100', iso: 100, process: 'C41' },
    { brand: 'Fujifilm', name: 'Fujicolor 400', slug: 'fujicolor-400', iso: 400, process: 'C41' },
    { brand: 'Fujifilm', name: 'Fujicolor C100', slug: 'fujicolor-c100', iso: 100, process: 'C41' },
    { brand: 'Fujifilm', name: 'Fujicolor C200', slug: 'fujicolor-c200-v2', iso: 200, process: 'C41' },
    { brand: 'Fujifilm', name: 'Natura 1600', slug: 'fujicolor-natura-1600', iso: 1600, process: 'C41' },
    { brand: 'Fujifilm', name: 'NS 160', slug: 'fujicolor-ns-160', iso: 160, process: 'C41' },
    { brand: 'Harman', name: 'Phoenix 200', slug: 'harman-phoenix-200', iso: 200, process: 'C41' },
    { brand: 'Ilford', name: 'Delta 100', slug: 'ilford-delta-100', iso: 100, process: 'BW' },
    { brand: 'Ilford', name: 'Delta 3200', slug: 'ilford-delta-3200-v2', iso: 3200, process: 'BW' },
    { brand: 'Ilford', name: 'Delta 400', slug: 'ilford-delta-400-v2', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'FP4 Plus 125', slug: 'ilford-fp4-plus-125', iso: 125, process: 'BW' },
    { brand: 'Ilford', name: 'HP5 Plus 400', slug: 'ilford-hp5-plus-400', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Delta 100', slug: 'ilford-icon-delta-100', iso: 100, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Delta 3200', slug: 'ilford-icon-delta-3200', iso: 3200, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Delta 400', slug: 'ilford-icon-delta-400', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'ICON FP4 125', slug: 'ilford-icon-fp4-125', iso: 125, process: 'BW' },
    { brand: 'Ilford', name: 'ICON HP5 400', slug: 'ilford-icon-hp5-400', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Ortho 80', slug: 'ilford-icon-ortho-80', iso: 80, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Pan 100', slug: 'ilford-icon-pan-100', iso: 100, process: 'BW' },
    { brand: 'Ilford', name: 'ICON Pan 400', slug: 'ilford-icon-pan-400', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'ICON SFX 200', slug: 'ilford-icon-sfx-200', iso: 200, process: 'BW' },
    { brand: 'Ilford', name: 'ICON XP2 400', slug: 'ilford-icon-xp2-400', iso: 400, process: 'C41' },
    { brand: 'Ilford', name: 'Ortho Plus 80', slug: 'ilford-ortho-plus-80', iso: 80, process: 'BW' },
    { brand: 'Ilford', name: 'Pan 100', slug: 'ilford-pan-100', iso: 100, process: 'BW' },
    { brand: 'Ilford', name: 'Pan 400', slug: 'ilford-pan-400', iso: 400, process: 'BW' },
    { brand: 'Ilford', name: 'Pan F Plus 50', slug: 'ilford-panf-plus-50', iso: 50, process: 'BW' },
    { brand: 'Ilford', name: 'SFX 200', slug: 'ilford-sfx-200-v2', iso: 200, process: 'BW' },
    { brand: 'Ilford', name: 'XP2 Super 400', slug: 'ilford-xp2-super-400', iso: 400, process: 'C41' },
    { brand: 'Kentmere', name: 'Pan 100', slug: 'kentmere-pan-100', iso: 100, process: 'BW' },
    { brand: 'Kentmere', name: 'Pan 200', slug: 'kentmere-pan-200', iso: 200, process: 'BW' },
    { brand: 'Kentmere', name: 'Pan 400', slug: 'kentmere-pan-400', iso: 400, process: 'BW' },
    { brand: 'Kodak', name: 'Kodachrome 25', slug: 'kodachrome-25', iso: 25, process: 'E6' },
    { brand: 'Kodak', name: 'ColorPlus 200', slug: 'kodak-colorplus-200-v2', iso: 200, process: 'C41' },
    { brand: 'Kodak', name: 'Crystal 1000 5294', slug: 'kodak-crystal-1000-5294', iso: 1000, process: 'C41' },
    { brand: 'Kodak', name: 'Eastman Double-X 5222', slug: 'kodak-eastman-double-x-5222', iso: 200, process: 'BW' },
    { brand: 'Kodak', name: 'Ektachrome 100D Super 8', slug: 'kodak-ektachrome-100d-super8', iso: 100, process: 'E6' },
    { brand: 'Kodak', name: 'Ektachrome 100VS', slug: 'kodak-ektachrome-100vs', iso: 100, process: 'E6' },
    { brand: 'Kodak', name: 'Ektachrome E100', slug: 'kodak-ektachrome-e100-v2', iso: 100, process: 'E6' },
    { brand: 'Kodak', name: 'Ektar 100', slug: 'kodak-ektar-100-v2', iso: 100, process: 'C41' },
    { brand: 'Kodak', name: 'Funsaver', slug: 'kodak-funsaver', iso: 800, process: 'C41' },
    { brand: 'Kodak', name: 'Gold 100', slug: 'kodak-gold-100', iso: 100, process: 'C41' },
    { brand: 'Kodak', name: 'Gold 200', slug: 'kodak-gold-200-v2', iso: 200, process: 'C41' },
    { brand: 'Kodak', name: 'Kodacolor 100', slug: 'kodak-kodacolor-100', iso: 100, process: 'C41' },
    { brand: 'Kodak', name: 'Kodacolor 200', slug: 'kodak-kodacolor-200', iso: 200, process: 'C41' },
    { brand: 'Kodak', name: 'Portra 160', slug: 'kodak-portra-160-v3', iso: 160, process: 'C41' },
    { brand: 'Kodak', name: 'Portra 400', slug: 'kodak-portra-400', iso: 400, process: 'C41' },
    { brand: 'Kodak', name: 'Portra 800', slug: 'kodak-portra-800-v2', iso: 800, process: 'C41' },
    { brand: 'Kodak', name: 'ProImage 100', slug: 'kodak-proimage-100', iso: 100, process: 'C41' },
    { brand: 'Kodak', name: 'T-Max 100', slug: 'kodak-tmax-100', iso: 100, process: 'BW' },
    { brand: 'Kodak', name: 'T-Max 400', slug: 'kodak-tmax-400', iso: 400, process: 'BW' },
    { brand: 'Kodak', name: 'Tri-X 400', slug: 'kodak-tri-x-400', iso: 400, process: 'BW' },
    { brand: 'Kodak', name: 'UltraMax 400', slug: 'kodak-ultramax-400-v3', iso: 400, process: 'C41' },
    { brand: 'Kodak', name: 'Vision3 200T 5213', slug: 'kodak-vision3-200t-5213', iso: 200, process: 'ECN2' },
    { brand: 'Kodak', name: 'Vision3 250D 5207', slug: 'kodak-vision3-250d-5207', iso: 250, process: 'ECN2' },
    { brand: 'Kodak', name: 'Vision3 500T 5219', slug: 'kodak-vision3-500t-5219', iso: 500, process: 'ECN2' },
    { brand: 'Kodak', name: 'Vision3 50D 5203', slug: 'kodak-vision3-50d-5203', iso: 50, process: 'ECN2' },
    { brand: 'Konica', name: 'Centuria 400', slug: 'konica-centuria-400', iso: 400, process: 'C41' },
    { brand: 'Lomography', name: 'LomoChrome Metropolis', slug: 'lomochrome-metropolis', iso: 400, process: 'C41' },
    { brand: 'Lomography', name: 'LomoChrome Purple', slug: 'lomochrome-purple', iso: 400, process: 'C41' },
    { brand: 'Lucky', name: 'SHD 100', slug: 'lucky-shd-100', iso: 100, process: 'BW' },
    { brand: 'Lucky', name: 'SHD 400', slug: 'lucky-shd-400', iso: 400, process: 'BW' },
    { brand: 'ORWO', name: 'FPan 100', slug: 'orwo-fpan100', iso: 100, process: 'BW' },
    { brand: 'ORWO', name: 'FPan 400', slug: 'orwo-fpan400', iso: 400, process: 'BW' },
    { brand: 'ORWO', name: 'UN54', slug: 'orwo-un54', iso: 100, process: 'BW' },
    { brand: 'Polaroid', name: 'B&W 600', slug: 'polaroid-bw-600', iso: 640, process: 'C41' },
    { brand: 'Polaroid', name: 'B&W i-Type', slug: 'polaroid-bw-itype', iso: 640, process: 'C41' },
    { brand: 'Polaroid', name: 'B&W SX-70', slug: 'polaroid-bw-sx70', iso: 150, process: 'C41' },
    { brand: 'Polaroid', name: 'Color 600', slug: 'polaroid-color-600', iso: 640, process: 'C41' },
    { brand: 'Polaroid', name: 'Color i-Type', slug: 'polaroid-color-itype', iso: 640, process: 'C41' },
    { brand: 'Polaroid', name: 'Color SX-70', slug: 'polaroid-color-sx70', iso: 150, process: 'C41' },
    { brand: 'Rene', name: 'Cinefilm 50D 5203', slug: 'rene-5203-50d', iso: 50, process: 'ECN2' },
    { brand: 'Rene', name: 'Cinefilm 250D 5207', slug: 'rene-5207-250d', iso: 250, process: 'ECN2' },
    { brand: 'Rene', name: 'Cinefilm 200T 5213', slug: 'rene-5213-200t', iso: 200, process: 'ECN2' },
    { brand: 'Rene', name: 'Cinefilm 500T 5219', slug: 'rene-5219-500t', iso: 500, process: 'ECN2' },
    { brand: 'Rollei', name: 'Infrared 400', slug: 'rollei-infrared-400', iso: 400, process: 'BW' },
    { brand: 'Shenguang', name: 'Color 400', slug: 'shenguang-color-400', iso: 400, process: 'C41' },
    { brand: 'Sunny', name: 'Sunny 100', slug: 'sunny-100', iso: 100, process: 'C41' },
    { brand: 'Wolffen', name: 'NC400 Color', slug: 'wolffen-nc400-color', iso: 400, process: 'C41' },
    { brand: 'Yesstar', name: 'Yesstar 200', slug: 'yesstar-200', iso: 200, process: 'C41' },
];

export function filmCatalogBrands(): string[] {
    return [...new Set(FILM_CATALOG.map((entry) => entry.brand))];
}

export function filmCatalogByBrand(brand: string): FilmCatalogEntry[] {
    return FILM_CATALOG.filter((entry) => entry.brand === brand);
}

export function findFilmCatalogEntry(brand: string, name: string): FilmCatalogEntry | undefined {
    const normalized = (value: string) => value.trim().toLowerCase();
    return FILM_CATALOG.find(
        (entry) => normalized(entry.brand) === normalized(brand) && normalized(entry.name) === normalized(name)
    );
}

export function getFilmLabelImageUrl(slug: string): string {
    return `/film-labels/${slug}.webp`;
}

export function getFilmLabelImageForRoll(brand: string, filmName: string): string | null {
    const entry = findFilmCatalogEntry(brand, filmName);
    return entry ? getFilmLabelImageUrl(entry.slug) : null;
}
