const dailyLogContentSchema = {
    type: 'object',
    required: ['date'],
    properties: {
        date: { type: 'string', format: 'date', example: '2026-03-16' },
        day: { type: 'string', example: 'Monday' },
        operation_task: { type: 'string', example: 'Shipped weekly log filters' },
        tools_used: { type: 'string', example: 'Next.js, Supabase' },
        lesson_learned: { type: 'string', example: 'Normalize content types at boundaries' },
    },
    additionalProperties: true,
};

const dailyLogEntrySchema = {
    type: 'object',
    required: ['id', 'user_id', 'source', 'content', 'effective_date', 'created_at', 'updated_at'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid', nullable: true },
        source: { type: 'string', enum: ['agent', 'human'] },
        content: dailyLogContentSchema,
        effective_date: { type: 'string', format: 'date' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
    },
};

const errorSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        message: { type: 'string' },
    },
};

const ticketSchema = {
    type: 'object',
    required: ['id', 'project_id', 'user_id', 'title', 'status', 'priority', 'source', 'tags', 'created_at', 'updated_at'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        project_id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
        notes: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['todo', 'in_progress', 'to_review', 'done', 'closed'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        source: { type: 'string', enum: ['self', 'user_tester'] },
        tags: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
    },
};

const filmCameraSchema = {
    type: 'object',
    required: ['id', 'user_id', 'name', 'created_at', 'updated_at'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        brand: { type: 'string', nullable: true },
        model: { type: 'string', nullable: true },
        purchase_date: { type: 'string', format: 'date', nullable: true },
        notes: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
    },
};

const filmRollSchema = {
    type: 'object',
    required: ['id', 'user_id', 'film_name', 'brand', 'format', 'film_type', 'iso', 'status', 'created_at', 'updated_at'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        camera_id: { type: 'string', format: 'uuid', nullable: true },
        film_name: { type: 'string' },
        brand: { type: 'string' },
        format: { type: 'string', enum: ['35mm', '120', 'Large Format'] },
        film_type: { type: 'string', enum: ['NEGATIVE', 'REVERSAL', 'BW_NEGATIVE'] },
        process_type: { type: 'string', enum: ['C41', 'E6', 'BW', 'ECN2'], nullable: true },
        iso: { type: 'integer' },
        status: { type: 'string', enum: ['UNUSED', 'SHOOTING', 'PROCESSING', 'PROCESSED'] },
        purchase_price: { type: 'number' },
        lab_name: { type: 'string', nullable: true },
        processing_cost: { type: 'number', minimum: 0 },
        scanning_cost: { type: 'number', minimum: 0 },
        shipping_cost: { type: 'number', minimum: 0 },
        processing_date: { type: 'string', format: 'date', nullable: true },
        location_name: { type: 'string', nullable: true },
        frames_taken: { type: 'integer' },
        successful_photos: { type: 'integer' },
        notes: { type: 'string', nullable: true },
        drive_folder_id: { type: 'string', nullable: true },
        cover_photo_id: { type: 'string', format: 'uuid', nullable: true },
        cover_image_url: { type: 'string', nullable: true },
        cover_image_path: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
    },
};

const filmDashboardSchema = {
    type: 'object',
    properties: {
        total_pictures_taken: { type: 'integer' },
        total_money_spent: { type: 'number' },
        total_cameras: { type: 'integer' },
        total_rolls: { type: 'integer' },
        processed_rolls: { type: 'integer' },
        unprocessed_rolls: { type: 'integer' },
        favorite_photos: { type: 'integer' },
        average_spend_per_roll: { type: 'number' },
        maintenance_cost: { type: 'number' },
        total_photos: { type: 'integer' },
        successful_photos: { type: 'integer' },
        average_cost_per_photo: { type: 'number' },
        rolls_loaded_or_shooting: { type: 'integer' },
    },
};

export const openApiComponents = {
    securitySchemes: {
        ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description: 'Agent authentication header for select endpoints.',
        },
    },
    schemas: {
        DailyLogContent: dailyLogContentSchema,
        DailyLogEntry: dailyLogEntrySchema,
        Error: errorSchema,
        Ticket: ticketSchema,
        FilmCamera: filmCameraSchema,
        FilmRoll: filmRollSchema,
        FilmDashboard: filmDashboardSchema,
    },
};