import type { MetadataRoute } from 'next';

type IdeaDumpManifest = Omit<MetadataRoute.Manifest, 'share_target'> & {
    share_target: {
        action: string;
        method: 'POST';
        enctype: 'multipart/form-data';
        params: {
            files: Array<{
                name: string;
                accept: string[];
            }>;
        };
    };
};

export default function manifest(): IdeaDumpManifest {
    return {
        name: 'IdeaDump',
        short_name: 'IdeaDump',
        description: 'All in one stop for random ideas',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        background_color: '#F8F5EF',
        theme_color: '#F8F5EF',
        icons: [
            {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
        ],
        share_target: {
            action: '/share-target/finance',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
                files: [
                    {
                        name: 'finance_images',
                        accept: [
                            'image/png',
                            '.png',
                            'image/jpeg',
                            '.jpg',
                            '.jpeg',
                            'image/webp',
                            '.webp',
                        ],
                    },
                ],
            },
        },
    };
}
