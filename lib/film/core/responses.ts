import type { FilmCamera, FilmCameraView, FilmMaintenanceRecord, FilmMaintenanceView, FilmPhotoView, FilmRollSummary, FilmRollView } from '@/lib/types';

export function filmCameraView(value: FilmCamera): FilmCameraView {
    return {
        id: value.id,
        name: value.name,
        brand: value.brand,
        model: value.model,
        purchase_date: value.purchase_date,
        notes: value.notes,
    };
}

export function filmMaintenanceView(value: FilmMaintenanceRecord): FilmMaintenanceView {
    return {
        id: value.id,
        camera_id: value.camera_id,
        service_date: value.service_date,
        service_type: value.service_type,
        provider_name: value.provider_name,
        maintenance_cost: value.maintenance_cost,
        notes: value.notes,
    };
}

export function filmPhotoView(value: FilmPhotoView): FilmPhotoView {
    return {
        id: value.id,
        name: value.name,
        mime_type: value.mime_type,
        web_view_link: value.web_view_link,
        width: value.width,
        height: value.height,
        is_favorite: value.is_favorite,
    };
}

export function filmRollView(value: FilmRollView): FilmRollView {
    return {
        id: value.id,
        camera_id: value.camera_id,
        film_name: value.film_name,
        brand: value.brand,
        format: value.format,
        film_type: value.film_type,
        process_type: value.process_type,
        iso: value.iso,
        status: value.status,
        purchase_price: value.purchase_price,
        lab_name: value.lab_name,
        processing_cost: value.processing_cost,
        scanning_cost: value.scanning_cost,
        shipping_cost: value.shipping_cost,
        processing_date: value.processing_date,
        location_name: value.location_name,
        frames_taken: value.frames_taken,
        successful_photos: value.successful_photos,
        notes: value.notes,
        drive_folder_id: value.drive_folder_id,
        cover_photo_id: value.cover_photo_id,
        cover_image_url: value.cover_image_url,
        ...(value.photos ? { photos: value.photos.map(filmPhotoView) } : {}),
    };
}

export function filmRollSummary(value: FilmRollSummary): FilmRollSummary {
    return {
        id: value.id,
        camera_id: value.camera_id,
        film_name: value.film_name,
        brand: value.brand,
        format: value.format,
        film_type: value.film_type,
        process_type: value.process_type,
        iso: value.iso,
        status: value.status,
        purchase_price: value.purchase_price,
        location_name: value.location_name,
        frames_taken: value.frames_taken,
        notes: value.notes,
        cover_photo_id: value.cover_photo_id,
        cover_image_url: value.cover_image_url,
        camera: value.camera ? { name: value.camera.name } : null,
    };
}

