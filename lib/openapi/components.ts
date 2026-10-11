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
    "type": "object",
    "additionalProperties": false,
    "required": [
        "id",
        "name",
        "brand",
        "model",
        "purchase_date",
        "notes"
    ],
    "properties": {
        "id": {
            "type": "string",
            "format": "uuid"
        },
        "name": {
            "type": "string"
        },
        "brand": {
            "type": "string",
            "nullable": true
        },
        "model": {
            "type": "string",
            "nullable": true
        },
        "purchase_date": {
            "type": "string",
            "nullable": true,
            "format": "date"
        },
        "notes": {
            "type": "string",
            "nullable": true
        }
    }
};

const filmPhotoSchema = {
    "type": "object",
    "additionalProperties": false,
    "required": [
        "id",
        "name",
        "mime_type",
        "web_view_link",
        "width",
        "height",
        "is_favorite"
    ],
    "properties": {
        "id": {
            "type": "string",
            "format": "uuid"
        },
        "name": {
            "type": "string"
        },
        "mime_type": {
            "type": "string"
        },
        "web_view_link": {
            "type": "string",
            "nullable": true
        },
        "width": {
            "type": "integer",
            "nullable": true
        },
        "height": {
            "type": "integer",
            "nullable": true
        },
        "is_favorite": {
            "type": "boolean"
        }
    }
};

const filmMaintenanceSchema = {
    "type": "object",
    "additionalProperties": false,
    "required": [
        "id",
        "camera_id",
        "service_date",
        "service_type",
        "provider_name",
        "maintenance_cost",
        "notes"
    ],
    "properties": {
        "id": {
            "type": "string",
            "format": "uuid"
        },
        "camera_id": {
            "type": "string",
            "format": "uuid"
        },
        "service_date": {
            "type": "string",
            "nullable": true,
            "format": "date"
        },
        "service_type": {
            "type": "string",
            "nullable": true
        },
        "provider_name": {
            "type": "string",
            "nullable": true
        },
        "maintenance_cost": {
            "type": "number"
        },
        "notes": {
            "type": "string",
            "nullable": true
        }
    }
};

const filmDashboardSchema = {
    "type": "object",
    "additionalProperties": false,
    "required": [
        "total_pictures_taken",
        "total_money_spent",
        "total_rolls",
        "favorite_photos",
        "successful_photos",
        "status_breakdown",
        "cost_breakdown",
        "format_breakdown",
        "camera_usage",
        "activity_trend"
    ],
    "properties": {
        "total_pictures_taken": {
            "type": "integer"
        },
        "total_money_spent": {
            "type": "number"
        },
        "total_rolls": {
            "type": "integer"
        },
        "favorite_photos": {
            "type": "integer"
        },
        "successful_photos": {
            "type": "integer"
        },
        "status_breakdown": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "status",
                    "label",
                    "count",
                    "percentage"
                ],
                "properties": {
                    "status": {
                        "type": "string"
                    },
                    "label": {
                        "type": "string"
                    },
                    "count": {
                        "type": "integer"
                    },
                    "percentage": {
                        "type": "number"
                    }
                }
            }
        },
        "cost_breakdown": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "key",
                    "label",
                    "amount"
                ],
                "properties": {
                    "key": {
                        "type": "string"
                    },
                    "label": {
                        "type": "string"
                    },
                    "amount": {
                        "type": "number"
                    }
                }
            }
        },
        "format_breakdown": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "format",
                    "label",
                    "count",
                    "percentage"
                ],
                "properties": {
                    "format": {
                        "type": "string"
                    },
                    "label": {
                        "type": "string"
                    },
                    "count": {
                        "type": "integer"
                    },
                    "percentage": {
                        "type": "number"
                    }
                }
            }
        },
        "camera_usage": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "label",
                    "roll_count"
                ],
                "properties": {
                    "label": {
                        "type": "string"
                    },
                    "roll_count": {
                        "type": "integer"
                    }
                }
            }
        },
        "activity_trend": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "month",
                    "label",
                    "roll_count",
                    "frames_taken",
                    "spend"
                ],
                "properties": {
                    "month": {
                        "type": "string"
                    },
                    "label": {
                        "type": "string"
                    },
                    "roll_count": {
                        "type": "integer"
                    },
                    "frames_taken": {
                        "type": "integer"
                    },
                    "spend": {
                        "type": "number"
                    }
                }
            }
        }
    }
};

const filmRollSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: { type: 'string', format: 'uuid' },
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
        photos: { type: 'array', items: { $ref: '#/components/schemas/FilmPhoto' } },
    },
};

const filmRollSummarySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: filmRollSchema.properties.id,
        camera_id: filmRollSchema.properties.camera_id,
        film_name: filmRollSchema.properties.film_name,
        brand: filmRollSchema.properties.brand,
        format: filmRollSchema.properties.format,
        film_type: filmRollSchema.properties.film_type,
        process_type: filmRollSchema.properties.process_type,
        iso: filmRollSchema.properties.iso,
        status: filmRollSchema.properties.status,
        purchase_price: filmRollSchema.properties.purchase_price,
        location_name: filmRollSchema.properties.location_name,
        frames_taken: filmRollSchema.properties.frames_taken,
        notes: filmRollSchema.properties.notes,
        cover_photo_id: filmRollSchema.properties.cover_photo_id,
        cover_image_url: filmRollSchema.properties.cover_image_url,
        camera: { type: 'object', nullable: true, additionalProperties: false, properties: { name: { type: 'string' } } },
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
        FilmRollSummary: filmRollSummarySchema,
        FilmPhoto: filmPhotoSchema,
        FilmMaintenance: filmMaintenanceSchema,
        FilmDashboard: filmDashboardSchema,
    },
};