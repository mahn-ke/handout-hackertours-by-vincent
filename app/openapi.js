export const openapi = {
    openapi: '3.0.3',
    info: {
        title: 'Hackertours Handout API',
        version: '1.0.0',
        description: 'Generate an HTML public transport handout for a tour.',
    },
    servers: [{ url: '/' }],
    components: {
        securitySchemes: {
            passphrase: { type: 'apiKey', in: 'query', name: 'passphrase' },
        },
    },
    paths: {
        '/generate': {
            get: {
                operationId: 'getHandout',
                summary: 'Generate a tour handout',
                security: [{ passphrase: [] }],
                parameters: [
                    {
                        name: 'Accept', in: 'header', required: false,
                        description: 'Request application/pdf to receive a PDF; text/html or no preference returns HTML.',
                        schema: { type: 'string' }, example: 'application/pdf',
                    },
                    {
                        name: 'from', in: 'query', required: true,
                        description: 'Starting point of the tour.',
                        schema: { type: 'string' }, example: 'Hamburg Messe (Eingang Mitte)',
                    },
                    {
                        name: 'to', in: 'query', required: true,
                        description: 'Human-readable destination shown in the handout header.',
                        schema: { type: 'string' }, example: 'Neuer Jungfernstieg 5',
                    },
                    {
                        name: 'toLat', in: 'query', required: false,
                        description: 'Optional destination latitude override. Requires toLon; reverse-geocoded to a routable address.',
                        schema: { type: 'number', minimum: -90, maximum: 90 }, example: 53.5488,
                    },
                    {
                        name: 'toLon', in: 'query', required: false,
                        description: 'Optional destination longitude override. Requires toLat; reverse-geocoded to a routable address.',
                        schema: { type: 'number', minimum: -180, maximum: 180 }, example: 9.9787,
                    },
                    {
                        name: 'arriveBy', in: 'query', required: true,
                        description: 'Desired arrival time in ISO 8601 format.',
                        schema: { type: 'string' }, example: '2026-10-14T14:20',
                    },
                    {
                        name: 'tourname', in: 'query',
                        description: 'Document title.',
                        schema: { type: 'string' }, example: 'Hafenrundfahrt (Anleger 7)',
                    },
                    {
                        name: 'provider', in: 'query',
                        description: 'Public transport provider (case-insensitive).',
                        schema: { type: 'string', enum: ['SH', 'VRN'], default: 'SH' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Rendered HTML handout.',
                        content: { 'text/html': { schema: { type: 'string' } } },
                    },
                    '403': { description: 'Missing or invalid passphrase.' },
                    '500': { description: 'Handout generation failed.' },
                },
            },
        },
    },
};