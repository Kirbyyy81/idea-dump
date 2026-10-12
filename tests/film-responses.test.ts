import { describe, expect, it } from 'vitest';
import { filmCameraView, filmMaintenanceView, filmPhotoView, filmRollSummary, filmRollView } from '@/lib/film/core/responses';
import type { FilmCamera, FilmMaintenanceRecord, FilmPhoto, FilmRoll } from '@/lib/types';
import { openApiComponents } from '@/lib/openapi/components';

const privateFields = { user_id: 'owner', created_at: '2026-10-01', updated_at: '2026-10-02' };
const camera: FilmCamera = { ...privateFields, id: 'camera', name: 'Travel', brand: 'Nikon', model: 'F3', purchase_date: null, notes: 'Camera notes' };
const photo: FilmPhoto = {
    ...privateFields, id: 'photo', film_roll_id: 'roll', drive_file_id: 'provider-file', name: '01.JPG',
    mime_type: 'image/jpeg', web_view_link: 'https://drive.google.com/file/d/provider-file/view',
    thumbnail_link: `https://lh3.googleusercontent.com/${'x'.repeat(300)}`, width: 6000, height: 4000,
    is_favorite: true, synced_at: '2026-10-02',
};
const roll: FilmRoll = {
    ...privateFields, id: 'roll', camera_id: camera.id, film_name: '200', brand: 'Fuji', format: '35mm',
    film_type: 'NEGATIVE', process_type: 'C41', iso: 200, status: 'PROCESSED', purchase_price: 30,
    lab_name: 'Lab', processing_cost: 15, scanning_cost: 10, shipping_cost: 5, processing_date: null,
    location_name: 'City', frames_taken: 36, successful_photos: 30, notes: 'Trip', drive_folder_id: 'folder',
    cover_photo_id: photo.id, cover_image_url: '/api/film/rolls/roll/cover?v=1', cover_image_path: 'owner/roll/private.webp',
    camera, cover_photo: photo, photos: Array.from({ length: 36 }, (_, id) => ({ ...photo, id: String(id) })),
};

describe('Film browser response allowlists', () => {
    it('removes internal fields and nested records while keeping edit and viewer fields', () => {
        const view = filmRollView(roll);
        expect(view.drive_folder_id).toBe('folder');
        expect(view.cover_image_url).toBe(roll.cover_image_url);
        expect(view.photos).toHaveLength(36);
        expect(view.photos?.[0]).toEqual({ id: '0', name: '01.JPG', mime_type: 'image/jpeg', web_view_link: photo.web_view_link, width: 6000, height: 4000, is_favorite: true });
        for (const field of ['user_id', 'created_at', 'updated_at', 'synced_at', 'drive_file_id', 'thumbnail_link', 'cover_image_path']) {
            expect(JSON.stringify(view)).not.toContain(`"${field}"`);
        }
        expect(view).not.toHaveProperty('camera');
        expect(view).not.toHaveProperty('cover_photo');
        expect(Object.keys(view).every((key) => key in openApiComponents.schemas.FilmRoll.properties)).toBe(true);
        expect(Object.keys(view.photos![0]).sort()).toEqual(openApiComponents.schemas.FilmPhoto.required.toSorted());
        expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(Buffer.byteLength(JSON.stringify(roll)) / 2);
    });

    it('keeps search, filters, cover and canister fields in the smaller library response', () => {
        const summary = filmRollSummary({ ...roll, camera });
        expect(summary).toEqual({ id: roll.id, camera_id: camera.id, camera: { name: camera.name }, film_name: '200', brand: 'Fuji', format: '35mm', film_type: 'NEGATIVE', process_type: 'C41', iso: 200, status: 'PROCESSED', purchase_price: 30, location_name: 'City', frames_taken: 36, notes: 'Trip', cover_photo_id: photo.id, cover_image_url: roll.cover_image_url });
        expect(filmRollSummary({ ...roll, camera: null }).camera).toBeNull();
        expect(filmRollView({ ...roll, photos: [] }).photos).toEqual([]);
        expect(filmRollView({ ...roll, photos: undefined })).not.toHaveProperty('photos');
    });

    it('limits cameras and maintenance to editable display data', () => {
        expect(filmCameraView(camera)).not.toHaveProperty('user_id');
        const record: FilmMaintenanceRecord = { ...privateFields, id: 'maintenance', camera_id: 'camera', service_date: null, service_type: 'Cleaning', provider_name: 'Lab', maintenance_cost: 15, notes: 'Done' };
        expect(Object.keys(filmMaintenanceView(record)).sort()).toEqual(openApiComponents.schemas.FilmMaintenance.required.toSorted());
        expect(filmMaintenanceView(record).notes).toBe('Done');
        expect(filmPhotoView(photo).is_favorite).toBe(true);
    });
});
